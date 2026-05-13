import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

const require = createRequire(import.meta.url)
// biome-ignore lint/complexity/useRegexLiterals: avoids noControlCharactersInRegex diagnostics for ANSI control stripping
const OSC_SEQUENCE_PATTERN = new RegExp("\\u001b\\][^\\u0007]*(?:\\u0007|\\u001b\\\\)", "g")
// biome-ignore lint/complexity/useRegexLiterals: avoids noControlCharactersInRegex diagnostics for ANSI control stripping
const CSI_SEQUENCE_PATTERN = new RegExp("\\u001b\\[[0-?]*[ -/]*[@-~]", "g")
// biome-ignore lint/complexity/useRegexLiterals: avoids noControlCharactersInRegex diagnostics for ANSI control stripping
const CONTROL_CHARACTER_PATTERN = new RegExp("[\\u0000-\\u0008\\u000b-\\u001a\\u001c-\\u001f\\u007f]", "g")

function resolveExecutable(command, platform = process.platform) {
  if (platform === "win32" && command === "where") {
    return "where.exe"
  }
  return command
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeoutMs, ...spawnOptions } = options
    const resolvedCommand = resolveExecutable(command)
    const child = spawn(resolvedCommand, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      ...spawnOptions,
    })

    let stdout = ""
    let stderr = ""
    let settled = false
    let timeoutId

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })

    if (typeof timeoutMs === "number" && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (settled) {
          return
        }

        settled = true
        child.kill()
        const error = new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms`)
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      }, timeoutMs)
    }

    child.on("error", (error) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutId)
      reject(error)
    })
    child.on("close", (code) => {
      if (settled) {
        clearTimeout(timeoutId)
        return
      }

      settled = true
      clearTimeout(timeoutId)

      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      const error = new Error(`${command} ${args.join(" ")} failed: ${stderr || stdout}`)
      error.stdout = stdout
      error.stderr = stderr
      reject(error)
    })
  })
}

function parseResolvedLines(rawStdout) {
  return String(rawStdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

async function removeTreeWithRetry(targetPath, { retries = 10, delayMs = 200 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true })
      return
    } catch (error) {
      const retryable = error?.code === "EBUSY" || error?.code === "ENOTEMPTY" || error?.code === "EPERM"
      if (!retryable || attempt === retries) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
    }
  }
}

function isWindowsShimPath(candidate) {
  return /\.(cmd|bat)$/i.test(candidate)
}

function isWindowsCmdShim(candidate) {
  return /\.cmd$/i.test(candidate)
}

export function canExecuteWindowsCmdShimRegression(platform = process.platform) {
  return platform === "win32"
}

export async function resolveOpencodeBinary({ runCommandImpl = runCommand, platform = process.platform } = {}) {
  const command = platform === "win32" ? "where" : "which"

  try {
    const { stdout } = await runCommandImpl(command, ["opencode"])
    const candidates = parseResolvedLines(stdout)

    if (candidates.length === 0) {
      return undefined
    }

    if (platform === "win32") {
      const firstNonShim = candidates.find((candidate) => !isWindowsShimPath(candidate))
      if (firstNonShim) {
        return {
          resolvedPath: firstNonShim,
          command: firstNonShim,
          args: [],
          kind: "binary",
        }
      }

      const firstCmdShim = candidates.find((candidate) => isWindowsCmdShim(candidate))
      const firstBatShim = candidates.find((candidate) => /\.bat$/i.test(candidate))
      const selectedShim = firstCmdShim ?? firstBatShim
      if (!selectedShim) {
        return undefined
      }

      return {
        resolvedPath: selectedShim,
        command: "cmd.exe",
        args: ["/d", "/s", "/c", "call", selectedShim],
        kind: "cmd-shim",
      }
    }

    return {
      resolvedPath: candidates[0],
      command: candidates[0],
      args: [],
      kind: "binary",
    }
  } catch {
    return undefined
  }
}

export async function createRealOpencodeHostRoot({
  repoRoot,
  mkdtempImpl = mkdtemp,
  opencodePathResolver,
  whichOpencodeImpl,
} = {}) {
  const hostRoot = await mkdtempImpl(path.join(os.tmpdir(), "opencode-real-host-"))
  const resolveRuntime = opencodePathResolver ?? whichOpencodeImpl ?? resolveOpencodeBinary

  try {
    const runtime = await resolveRuntime()

    if (!runtime) {
      await removeTreeWithRetry(hostRoot)
      return {
        ok: false,
        stage: "host-bootstrap-failed",
        error: "opencode binary unavailable for real-host gate",
      }
    }

    const runtimePath = typeof runtime === "string" ? runtime : runtime.resolvedPath
    const runtimeCommand = typeof runtime === "string" ? runtime : runtime.command
    const runtimeArgs = typeof runtime === "string" ? [] : runtime.args
    const runtimeKind = typeof runtime === "string" ? "binary" : runtime.kind

    const cacheRoot = path.join(hostRoot, "cache")
    const configRoot = path.join(hostRoot, "config")
    const dataRoot = path.join(hostRoot, "data")
    const logRoot = path.join(hostRoot, "logs")
    const tmpRoot = path.join(hostRoot, "tmp")

    await Promise.all([
      mkdir(cacheRoot, { recursive: true }),
      mkdir(configRoot, { recursive: true }),
      mkdir(dataRoot, { recursive: true }),
      mkdir(logRoot, { recursive: true }),
      mkdir(tmpRoot, { recursive: true }),
    ])

    return {
      ok: true,
      stage: "host-bootstrap-ready",
      hostRoot,
      projectRoot: repoRoot ?? process.cwd(),
      cacheRoot,
      configRoot,
      dataRoot,
      logRoot,
      tmpRoot,
      runtimePath,
      runtimeCommand,
      runtimeArgs,
      runtimeKind,
      cleanup: async () => removeTreeWithRetry(hostRoot),
    }
  } catch (error) {
    await removeTreeWithRetry(hostRoot)
    throw error
  }
}

export function buildRealHostEnv(host, baseEnv = process.env, {
  inlineConfigContent,
} = {}) {
  const env = {}
  const passthroughKeys = ["PATH", "PATHEXT", "SystemRoot", "ComSpec", "WINDIR"]

  for (const key of passthroughKeys) {
    if (baseEnv[key] !== undefined) {
      env[key] = baseEnv[key]
    }
  }

  const tmpRoot = host.tmpRoot ?? path.join(host.hostRoot, "tmp")

  const nextEnv = {
    ...env,
    OPENCODE_TEST_HOME: host.hostRoot,
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    HOME: host.hostRoot,
    USERPROFILE: host.hostRoot,
    XDG_CONFIG_HOME: host.configRoot,
    XDG_CACHE_HOME: host.cacheRoot,
    XDG_DATA_HOME: host.dataRoot,
    XDG_STATE_HOME: host.logRoot,
    APPDATA: host.configRoot,
    LOCALAPPDATA: host.dataRoot,
    TMP: tmpRoot,
    TEMP: tmpRoot,
    TMPDIR: tmpRoot,
  }

  if (inlineConfigContent) {
    nextEnv.OPENCODE_CONFIG_CONTENT = inlineConfigContent
  }

  return nextEnv
}

function normalizePluginEntryFilePath(entryFilePath) {
  const normalizedPath = String(entryFilePath ?? "").replace(/\\/g, "/")

  if (!/^file:/i.test(normalizedPath)) {
    return normalizedPath
  }

  try {
    const fileUrl = new URL(normalizedPath)
    let decodedPath = decodeURIComponent(fileUrl.pathname)

    if (fileUrl.host) {
      decodedPath = `//${fileUrl.host}${decodedPath}`
    }

    if (/^\/[A-Za-z]:/.test(decodedPath)) {
      return decodedPath.slice(1)
    }

    return decodedPath
  } catch {
    return normalizedPath.replace(/^file:/i, "")
  }

}

function buildRealHostPluginSpec(artifact = {}) {
  const pluginEntryFilePath = artifact.entryFilePath ?? artifact.distEntryFilePath
  const normalizedPath = normalizePluginEntryFilePath(pluginEntryFilePath)

  if (!normalizedPath) {
    throw new Error("plugin dist entry file unavailable for real-host gate")
  }

  return normalizedPath
}

function loadNodePtySpawn() {
  return require("@lydell/node-pty").spawn
}

function stripAnsi(text) {
  return String(text ?? "")
    .replace(OSC_SEQUENCE_PATTERN, "")
    .replace(CSI_SEQUENCE_PATTERN, "")
    .replace(CONTROL_CHARACTER_PATTERN, "")
}

function toScreenText(rawBuffer) {
  return stripAnsi(rawBuffer)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
}

function extractCurrentScreenBuffer(rawBuffer) {
  const buffer = String(rawBuffer ?? "")
  const redrawStartIndex = Math.max(
    buffer.lastIndexOf("\u001b[2J"),
    buffer.lastIndexOf("\u001bc"),
    buffer.lastIndexOf("\u001b[H"),
    buffer.lastIndexOf("\u001b[1;1H"),
    buffer.lastIndexOf("\u001b[1;1f"),
  )

  if (redrawStartIndex >= 0) {
    return buffer.slice(redrawStartIndex)
  }

  return buffer.slice(-12_000)
}

function appendToPtyBuffer(session, chunk) {
  session.rawBuffer += String(chunk)
  const nextScreenText = toScreenText(extractCurrentScreenBuffer(session.rawBuffer))

  // Some redraw cycles briefly emit only clear-screen / clear-line frames before
  // the next visible content arrives. Keep the last non-empty screen snapshot so
  // waiters do not lose the currently visible menu to an all-whitespace frame.
  if (nextScreenText.trim().length > 0 || session.screenText.trim().length === 0) {
    session.screenText = nextScreenText
  }
}

function createPtyExitPromise(pty, session) {
  let exitSubscription
  const promise = new Promise((resolve) => {
    exitSubscription = pty.onExit?.((event) => {
      session.exitCode = event.exitCode
      session.exited = true
      exitSubscription?.dispose?.()
      resolve(event)
    })
  })

  return {
    promise,
    dispose: () => exitSubscription?.dispose?.(),
  }
}


async function buildPtyLaunchSpec({ host, commandArgsOverride, platform = process.platform }) {
  const runtimeCommand = host.runtimeCommand ?? host.runtimePath
  const runtimeArgs = commandArgsOverride
    ? [...getRuntimeDispatchArgs(host), ...commandArgsOverride]
    : [...(host.runtimeArgs ?? [])]

  if (platform === "win32" && host.runtimeKind === "binary") {
    return {
      command: runtimeCommand,
      args: runtimeArgs,
    }
  }

  return {
    command: runtimeCommand,
    args: runtimeArgs,
  }
}

export async function spawnRealOpencodePty({
  host,
  spawnPtyImpl = loadNodePtySpawn(),
  commandArgsOverride,
  workingDirectoryOverride,
  platform = process.platform,
  disableInheritedMcp = false,
  inlineConfigContent,
  resolveInlineConfigContentImpl = resolveDisabledMcpInlineConfigContent,
  cols = 120,
  rows = 30,
  name = "xterm-color",
} = {}) {
  const { command, args } = await buildPtyLaunchSpec({
    host,
    commandArgsOverride,
    platform,
  })
  const resolvedInlineConfigContent = inlineConfigContent
    ?? (disableInheritedMcp ? await resolveInlineConfigContentImpl({ host }) : undefined)
  const pty = spawnPtyImpl(command, args, {
    name,
    cols,
    rows,
    cwd: workingDirectoryOverride ?? host.projectRoot ?? host.hostRoot,
    env: buildRealHostEnv(host, process.env, {
      inlineConfigContent: resolvedInlineConfigContent,
    }),
    ...(platform === "win32" ? { useConpty: true } : {}),
  })

  const session = {
    host,
    transport: "pty",
    pty,
    command,
    args,
    inlineConfigContent: resolvedInlineConfigContent,
    rawBuffer: "",
    screenText: "",
    exited: false,
    exitCode: null,
    dataSubscription: null,
    exitSubscription: null,
  }

  session.dataSubscription = pty.onData?.((chunk) => appendToPtyBuffer(session, chunk)) ?? null
  const exitState = createPtyExitPromise(pty, session)
  session.exitSubscription = exitState
  session.exitPromise = exitState.promise

  return session
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function cleanupPtyInternals(pty) {
  const agent = pty?._agent

  if (agent?._closeTimeout) {
    clearTimeout(agent._closeTimeout)
    agent._closeTimeout = undefined
  }

  const conoutSocketWorker = agent?._conoutSocketWorker
  if (conoutSocketWorker?._drainTimeout) {
    clearTimeout(conoutSocketWorker._drainTimeout)
    conoutSocketWorker._drainTimeout = undefined
  }

  if (typeof conoutSocketWorker?._destroySocket === "function") {
    await conoutSocketWorker._destroySocket()
  } else {
    conoutSocketWorker?.dispose?.()
  }

  agent?._inSocket?.destroy?.()
  agent?._outSocket?.destroy?.()
  pty?._socket?.destroy?.()
}

function parseDebugConfig(stdout) {
  return JSON.parse(String(stdout ?? "{}"))
}

function buildDisabledMcpInlineConfigContent(config) {
  const mcpKeys = Object.keys(config?.mcp ?? {})
  if (mcpKeys.length === 0) {
    return undefined
  }

  return JSON.stringify({
    mcp: Object.fromEntries(mcpKeys.map((key) => [key, { enabled: false }])),
  })
}

function getRuntimeDispatchArgs(host) {
  if (Array.isArray(host.runtimeDispatchArgs)) {
    return [...host.runtimeDispatchArgs]
  }

  if (host.runtimeKind === "cmd-shim") {
    return [...(host.runtimeArgs ?? [])].slice(0, 5)
  }

  return []
}

export async function resolveDisabledMcpInlineConfigContent({
  host,
  runCommandImpl = runCommand,
} = {}) {
  const command = host.runtimeCommand ?? host.runtimePath
  const args = [...getRuntimeDispatchArgs(host), "debug", "config", "--pure"]
  const { stdout } = await runCommandImpl(command, args, {
    cwd: host.hostRoot,
    env: buildRealHostEnv(host),
    timeoutMs: 120_000,
  })

  return buildDisabledMcpInlineConfigContent(parseDebugConfig(stdout))
}

export async function resolveRealHostPluginInlineConfigContent({
  host,
  artifact,
  resolveDisabledMcpInlineConfigContentImpl = resolveDisabledMcpInlineConfigContent,
} = {}) {
  const pluginSpec = buildRealHostPluginSpec(artifact)
  const probeHost = await createRealOpencodeHostRoot({
    opencodePathResolver: async () => ({
      resolvedPath: host.runtimePath ?? host.runtimeCommand,
      command: host.runtimeCommand ?? host.runtimePath,
      args: getRuntimeDispatchArgs(host),
      kind: host.runtimeKind ?? "binary",
    }),
  })

  const disabledMcpInlineConfigContent = await resolveDisabledMcpInlineConfigContentImpl({
    host: probeHost.ok ? probeHost : host,
  })
  const disabledMcpConfig = disabledMcpInlineConfigContent
    ? parseDebugConfig(disabledMcpInlineConfigContent)
    : {}

  if (probeHost.ok) {
    await probeHost.cleanup()
  }

  return JSON.stringify({
    plugin: [pluginSpec],
    ...(disabledMcpConfig.mcp ? { mcp: disabledMcpConfig.mcp } : {}),
  })
}

export async function runWechatSlashThroughRealOpencode({
  host,
  artifact,
  inlineConfigContent,
  slashCommand = "/recover",
  responseMatcher = /没有可恢复的请求|wechat status|待处理事项|请使用 slash 命令/i,
  spawnPtyImpl,
  readScreenImpl,
  sendInputImpl,
  screenWaitTimeoutMs = 60_000,
  inputChangeTimeoutMs = 2_000,
  resolvePluginInlineConfigContentImpl = resolveRealHostPluginInlineConfigContent,
} = {}) {
  const resolvedInlineConfigContent = inlineConfigContent
    ?? (artifact ? await resolvePluginInlineConfigContentImpl({ host, artifact }) : undefined)
  const session = await spawnRealOpencodePty({
    host,
    inlineConfigContent: resolvedInlineConfigContent,
    workingDirectoryOverride: host.hostRoot,
    spawnPtyImpl,
  })
  let succeeded = false

  try {
    const askAnythingScreen = await waitForAskAnythingScreen(session, {
      timeoutMs: screenWaitTimeoutMs,
      readScreenImpl,
    })
    await sendKeys(session, [slashCommand, "ENTER"], { sendInputImpl })
    const responseScreen = await waitForScreenText(session, responseMatcher, {
      timeoutMs: inputChangeTimeoutMs,
      readScreenImpl,
    })
    succeeded = true

    return {
      ok: true,
      stage: "wechat-slash-response-visible",
      reachedAskAnything: true,
      slashCommand,
      askAnythingScreen,
      responseScreen,
      session,
    }
  } finally {
    if (!succeeded) {
      await stopRealOpencodePty(session, { sendInputImpl })
    }
  }
}

export async function waitForScreenText(session, matcher, {
  timeoutMs = 15_000,
  pollIntervalMs = 50,
  readScreenImpl,
} = {}) {
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    await readSessionScreen(session, readScreenImpl)

    if (matcher.test(session.screenText)) {
      return session.screenText
    }

    if (session.exited) {
      break
    }

    await delay(pollIntervalMs)
  }

  throw new Error(`menu buffer did not match ${matcher} within ${timeoutMs}ms`)
}

export async function waitForAskAnythingScreen(session, {
  timeoutMs = 60_000,
  pollIntervalMs = 50,
  readScreenImpl,
} = {}) {
  // Real-host interactive startup can land close to 30s on Windows, so use a
  // dedicated first-paint budget instead of the shorter generic menu wait.
  return waitForScreenText(session, /Ask anything\.\.\./, {
    timeoutMs,
    pollIntervalMs,
    readScreenImpl,
  })
}

function resettableMatcher(matcher) {
  if (!(matcher instanceof RegExp)) {
    return matcher
  }

  return new RegExp(matcher.source, matcher.flags.replace(/[gy]/g, ""))
}

function matcherMatchesText(matcher, text) {
  if (matcher instanceof RegExp) {
    return resettableMatcher(matcher).test(text)
  }

  return text.includes(String(matcher))
}

function extractSelectedMenuLabel(screenText) {
  const lines = String(screenText ?? "").split(/\r?\n/)

  for (const line of lines) {
    const match = line.match(/^\s*(?:[│┃]\s+)?(?:Selected:\s*|[>●›❯])\s*(.+?)\s*$/u)
    if (match) {
      return match[1]
    }
  }

  return undefined
}

function screenHasSelectedMenuItem(screenText, matcher) {
  const selectedLabel = extractSelectedMenuLabel(screenText)
  if (!selectedLabel) {
    return false
  }

  return matcherMatchesText(matcher, selectedLabel)
}

function formatMatcher(matcher) {
  return matcher instanceof RegExp ? matcher.toString() : JSON.stringify(String(matcher))
}

export async function selectMenuItemOnScreen(session, matcher, {
  navigationKey = "DOWN",
  timeoutMs = 15_000,
  readScreenImpl,
  sendInputImpl,
  inputChangeTimeoutMs = 750,
  inputRetryAttempts = 1,
  inputPollIntervalMs = 25,
} = {}) {
  const startedAt = Date.now()
  let currentScreen = await readSessionScreen(session, readScreenImpl)

  while (Date.now() - startedAt <= timeoutMs) {
    if (screenHasSelectedMenuItem(currentScreen, matcher)) {
      return currentScreen
    }

    if (session.exited) {
      break
    }

    currentScreen = await sendKeyWithScreenChangeRetry(session, navigationKey, {
      sendInputImpl,
      readScreenImpl,
      baselineScreenText: currentScreen,
      inputChangeTimeoutMs,
      inputRetryAttempts,
      inputPollIntervalMs,
    })
  }

  throw new Error(`menu buffer did not select ${formatMatcher(matcher)} within ${timeoutMs}ms`)
}

async function readSessionScreen(session, readScreenImpl) {
  const readScreen = readScreenImpl ?? (async (activeSession) => activeSession.screenText)
  const screenText = await readScreen(session)

  if (typeof screenText === "string") {
    session.screenText = screenText
  }

  return session.screenText
}

async function waitForScreenChange(session, previousScreenText, {
  timeoutMs = 750,
  pollIntervalMs = 25,
  readScreenImpl,
} = {}) {
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutMs) {
    const currentScreenText = await readSessionScreen(session, readScreenImpl)

    if (currentScreenText !== previousScreenText) {
      return currentScreenText
    }

    if (session.exited) {
      break
    }

    await delay(pollIntervalMs)
  }

  throw new Error(`screen did not change within ${timeoutMs}ms`)
}

async function sendKeyWithScreenChangeRetry(session, key, {
  sendInputImpl,
  readScreenImpl,
  baselineScreenText,
  inputChangeTimeoutMs = 750,
  inputRetryAttempts = 1,
  inputPollIntervalMs = 25,
} = {}) {
  let previousScreenText = baselineScreenText ?? await readSessionScreen(session, readScreenImpl)

  for (let attempt = 0; attempt <= inputRetryAttempts; attempt += 1) {
    await sendKeys(session, [key], { sendInputImpl })

    try {
      return await waitForScreenChange(session, previousScreenText, {
        timeoutMs: inputChangeTimeoutMs,
        pollIntervalMs: inputPollIntervalMs,
        readScreenImpl,
      })
    } catch {
      previousScreenText = await readSessionScreen(session, readScreenImpl)

      if (attempt === inputRetryAttempts) {
        return previousScreenText
      }
    }
  }
}

function normalizeKeyInput(key) {
  if (key === "ENTER") return "\r"
  if (key === "CTRL_C") return "\u0003"
  if (key === "CTRL_P") return "\u0010"
  if (key === "UP") return "\u001b[A"
  if (key === "DOWN") return "\u001b[B"
  if (key === "LEFT") return "\u001b[D"
  if (key === "RIGHT") return "\u001b[C"
  return key
}

export async function sendKeys(session, keys, {
  sendInputImpl,
} = {}) {
  const chunks = Array.isArray(keys) ? keys.map(normalizeKeyInput) : [normalizeKeyInput(keys)]
  const sendInput = sendInputImpl ?? (async (activeSession, input) => {
    activeSession.pty.write(input)
  })

  for (const chunk of chunks) {
    await sendInput(session, chunk)
  }
}

export async function stopRealOpencodePty(session, {
  timeoutMs = 5_000,
  gracefulInputs = ["CTRL_C"],
  gracefulExitWaitMs = 1_000,
  sendInputImpl,
  platform = process.platform,
} = {}) {
  if (!session) {
    return
  }

  let killError = null
  const stopInputs = platform === "win32"
    && gracefulInputs.length > 0
    && !gracefulInputs.includes("CTRL_C")
    ? [...gracefulInputs, "CTRL_C"]
    : gracefulInputs

  try {
    if (!session.exited) {
      for (const input of stopInputs) {
        await sendKeys(session, [input], { sendInputImpl })

        const didExitGracefully = await Promise.race([
          session.exitPromise.then(() => true),
          delay(gracefulExitWaitMs).then(() => false),
        ])
        if (didExitGracefully) {
          break
        }
      }
    }

    if (!session.exited) {
      try {
        session.pty.kill()
      } catch (error) {
        if (error?.code === "UNKNOWN") {
          killError = error
        } else {
          throw error
        }
      }
    }

    try {
      await Promise.race([
        session.exitPromise,
        delay(timeoutMs).then(() => {
          throw new Error(`opencode process did not exit within ${timeoutMs}ms`)
        }),
      ])
    } catch (error) {
      if (killError) {
        throw killError
      }

      throw error
    }
  } finally {
    session.dataSubscription?.dispose?.()
    session.exitSubscription?.dispose?.()
    await cleanupPtyInternals(session.pty)
  }
}

function looksLikeTerminalQrBlockCanvas(text) {
  const lines = String(text ?? "").split(/\r?\n/)
  let denseLineCount = 0
  let totalBlockGlyphCount = 0

  for (const line of lines) {
    const blockGlyphCount = (line.match(/[█▄▀]/g) ?? []).length
    totalBlockGlyphCount += blockGlyphCount

    if (blockGlyphCount >= 12) {
      denseLineCount += 1
    }
  }

  return denseLineCount >= 5 && totalBlockGlyphCount >= 120
}

export function classifyRealOpencodeWechatBindResult({ transcript, logText } = {}) {
  const source = [transcript, logText]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n")

  if (/wechat bind failed:/i.test(source) && /Missing 'default' export/i.test(source)) {
    return {
      ok: false,
      stage: "wechat-bind-import-failed",
      error: source,
    }
  }

  if (/wechat bind failed:/i.test(source)) {
    return {
      ok: false,
      stage: "wechat-bind-runtime-failed",
      error: source,
    }
  }

  if (/QR URL fallback:|sessionKey|qr login/i.test(source)) {
    return {
      ok: false,
      stage: "qr-wait-reached",
      error: source,
    }
  }

  if (looksLikeTerminalQrBlockCanvas(source)) {
    return {
      ok: false,
      stage: "qr-wait-reached",
      error: source,
    }
  }

  return {
    ok: false,
    stage: "menu-chain-failed",
    error: source || "unknown real-host failure",
  }
}

export async function installPluginIntoRealHost({
  host,
  artifact,
  runCommandImpl = runCommand,
} = {}) {
  const command = host.runtimeCommand ?? host.runtimePath
  let pluginSpec = ""

  try {
    pluginSpec = buildRealHostPluginSpec(artifact)
    const args = [...(host.runtimeArgs ?? []), "plugin", pluginSpec, "--force"]

    await runCommandImpl(command, args, {
      cwd: host.hostRoot,
      env: buildRealHostEnv(host),
      timeoutMs: 120_000,
    })

    return {
      ok: true,
      stage: "plugin-install-ready",
      pluginSpec,
      runtimeKind: host.runtimeKind,
    }
  } catch (error) {
    return {
      ok: false,
      stage: "plugin-install-failed",
      error: error instanceof Error ? error.message : String(error),
      pluginSpec,
      stdout: error?.stdout ?? "",
      stderr: error?.stderr ?? "",
      runtimeKind: host.runtimeKind,
    }
  }
}

test("real host PTY helper: stopRealOpencodePty cleans up after exit timeout", async () => {
  let dataDisposed = false
  let exitDisposed = false
  let conoutDisposed = false
  let inSocketDestroyed = false
  let outSocketDestroyed = false
  let socketDestroyed = false

  const closeTimeout = setTimeout(() => {}, 60_000)
  const session = {
    exited: false,
    exitPromise: new Promise(() => {}),
    dataSubscription: {
      dispose() {
        dataDisposed = true
      },
    },
    exitSubscription: {
      dispose() {
        exitDisposed = true
      },
    },
    pty: {
      kill() {},
      _agent: {
        _closeTimeout: closeTimeout,
        _conoutSocketWorker: {
          dispose() {
            conoutDisposed = true
          },
        },
        _inSocket: {
          destroy() {
            inSocketDestroyed = true
          },
        },
        _outSocket: {
          destroy() {
            outSocketDestroyed = true
          },
        },
      },
      _socket: {
        destroy() {
          socketDestroyed = true
        },
      },
    },
  }

  try {
    await assert.rejects(
      stopRealOpencodePty(session, {
        gracefulInputs: [],
        timeoutMs: 10,
      }),
      /opencode process did not exit within 10ms/,
    )
  } finally {
    clearTimeout(closeTimeout)
  }

  assert.equal(dataDisposed, true)
  assert.equal(exitDisposed, true)
  assert.equal(conoutDisposed, true)
  assert.equal(inSocketDestroyed, true)
  assert.equal(outSocketDestroyed, true)
  assert.equal(socketDestroyed, true)
})
