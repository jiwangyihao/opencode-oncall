import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

async function pathExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error?.code === "ENOENT") return false
    throw error
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"))
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8")
}

test("legacy account-switcher WeChat settings and retained state migrate into opencode-wechat", async () => {
  const sandboxConfigHome = await mkdtemp(path.join(os.tmpdir(), "wechat-migration-"))
  const previousXdgConfigHome = process.env.XDG_CONFIG_HOME
  const previousStateRoot = process.env.WECHAT_STATE_ROOT_OVERRIDE
  delete process.env.WECHAT_STATE_ROOT_OVERRIDE
  process.env.XDG_CONFIG_HOME = sandboxConfigHome

  try {
    const legacyRoot = path.join(sandboxConfigHome, "opencode", "account-switcher")
    const legacyWechatRoot = path.join(legacyRoot, "wechat")
    const canonicalRoot = path.join(sandboxConfigHome, "opencode", "opencode-wechat")

    await writeJson(path.join(legacyRoot, "settings.json"), {
      networkRetryEnabled: true,
      experimentalSlashCommandsEnabled: false,
      wechatNotificationsEnabled: false,
      wechatQuestionNotifyEnabled: true,
      wechatPermissionNotifyEnabled: false,
      wechatSessionErrorNotifyEnabled: true,
      wechatRetryErrorNotifyEnabled: false,
      wechat: {
        primaryBinding: {
          accountId: "wx-main",
          userId: "user-main",
          name: "Main WeChat",
          enabled: true,
          configured: true,
          boundAt: 1_700_000_000_000,
        },
        notifications: {
          enabled: true,
          question: false,
          permission: true,
          sessionError: false,
          retryError: true,
        },
      },
    })

    const legacyFiles = new Map([
      ["operator.json", { wechatAccountId: "wx-main", userId: "user-main", boundAt: 1_700_000_000_000 }],
      [path.join("tokens", "wx-main", "user-main.json"), { contextToken: "ctx-1", updatedAt: 1, source: "question" }],
      ["broker-state-store.json", { connections: {}, active: { instances: {}, sessions: {}, questions: {}, permissions: {}, naturalStops: {}, retryErrors: {} }, terminalMetadata: {}, retainedOccupancy: {}, legacyHandleClosures: {}, requestIndex: {}, deliveryTokens: {}, commandLedger: {}, controlLedger: {}, fullSync: { stagedByControlId: {} } }],
      ["latest-account.json", { accountId: "wx-main", token: "bot-token", baseUrl: "https://ilinkai.weixin.qq.com" }],
      [path.join("requests", "question", "route-q.json"), { kind: "question", routeKey: "route-q", requestID: "q-1", handle: "q1", wechatAccountId: "wx-main", userId: "user-main", status: "open", createdAt: 2 }],
      [path.join("notifications", "notif-q.json"), { idempotencyKey: "notif-q", kind: "question", routeKey: "route-q", handle: "q1", wechatAccountId: "wx-main", userId: "user-main", createdAt: 3, status: "pending" }],
      [path.join("dead-letter", "question", "route-dead.json"), { kind: "question", routeKey: "route-dead", requestID: "q-dead", handle: "q9", finalStatus: "expired", reason: "instanceStale", createdAt: 4, finalizedAt: 5 }],
      [path.join("instances", "inst-1.json"), { instanceID: "inst-1", status: "closed", reason: "legacy-state-reset-awaiting-full-sync" }],
      ["wechat-bridge.diagnostics.jsonl", { line: "bridge" }],
      ["wechat-status-runtime.diagnostics.jsonl", { line: "status" }],
    ])

    for (const [relativePath, value] of legacyFiles) {
      await writeJson(path.join(legacyWechatRoot, relativePath), value)
    }


    const settingsStore = await import(`../dist/settings-store.js?reload=${Date.now()}`)
    const storePaths = await import(`../dist/store-paths.js?reload=${Date.now()}`)
    const statePaths = await import(`../dist/wechat/state-paths.js?reload=${Date.now()}`)

    const settings = await settingsStore.readWechatSettingsStore()

    assert.equal(storePaths.opencodeWechatConfigDir(), canonicalRoot)
    assert.equal(storePaths.wechatLegacyConfigDir(), legacyWechatRoot)
    assert.equal(statePaths.wechatStateRoot(), canonicalRoot)
    assert.deepEqual(settings.wechat.primaryBinding, {
      accountId: "wx-main",
      userId: "user-main",
      name: "Main WeChat",
      enabled: true,
      configured: true,
      boundAt: 1_700_000_000_000,
    })
    assert.deepEqual(settings.wechat.notifications, {
      enabled: true,
      question: false,
      permission: true,
      sessionError: false,
      retryError: true,
    })

    assert.deepEqual(await readJson(path.join(canonicalRoot, "settings.json")), settings)
    for (const relativePath of legacyFiles.keys()) {
      assert.equal(await pathExists(path.join(canonicalRoot, relativePath)), true, `${relativePath} should migrate`)
    }
    assert.equal(await pathExists(path.join(canonicalRoot, "broker-state.json")), false)
    assert.equal(await pathExists(path.join(canonicalRoot, "latest-account-state.json")), false)
  } finally {
    if (previousXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME
    } else {
      process.env.XDG_CONFIG_HOME = previousXdgConfigHome
    }
    if (previousStateRoot === undefined) {
      delete process.env.WECHAT_STATE_ROOT_OVERRIDE
    } else {
      process.env.WECHAT_STATE_ROOT_OVERRIDE = previousStateRoot
    }
  }
})

