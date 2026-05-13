import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("package root source exports only OpenCodeWechat", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8")

  assert.match(source, /OpenCodeWechat/)
  assert.match(source, /default/)
  assert.doesNotMatch(source, /CopilotAccountSwitcher|OpenAICodexAccountSwitcher|COPILOT_PROVIDER_DESCRIPTOR/)
})

test("package root dist exports only OpenCodeWechat", async () => {
  const indexExports = await import("../dist/index.js")
  const pluginExports = await import("../dist/plugin.js")
  const distTypeSource = await readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8")

  assert.equal(typeof indexExports.OpenCodeWechat, "function")
  assert.equal(indexExports.default, indexExports.OpenCodeWechat)
  assert.equal(indexExports.OpenCodeWechat, pluginExports.OpenCodeWechat)
  assert.deepEqual(Object.keys(indexExports).sort(), ["OpenCodeWechat", "default"])

  assert.match(distTypeSource, /OpenCodeWechat/)
  assert.doesNotMatch(distTypeSource, /CopilotAccountSwitcher|OpenAICodexAccountSwitcher|COPILOT_PROVIDER_DESCRIPTOR/)
})
