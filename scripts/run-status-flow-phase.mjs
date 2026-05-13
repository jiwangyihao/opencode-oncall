import { spawn } from "node:child_process"

const phase = process.argv[2]

if (phase !== "early" && phase !== "late") {
  console.error("usage: node scripts/run-status-flow-phase.mjs <early|late>")
  process.exit(1)
}

const child = spawn(
  process.execPath,
  ["--test", "--test-concurrency=1", "test/wechat-status-flow.test.js"],
  {
    env: {
      ...process.env,
      WECHAT_STATUS_FLOW_PHASE: phase,
    },
    stdio: "inherit",
  },
)

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
