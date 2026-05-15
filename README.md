# opencode-oncall

[![npm version](https://img.shields.io/npm/v/opencode-oncall.svg)](https://www.npmjs.com/package/opencode-oncall)
[![npm downloads](https://img.shields.io/npm/dw/opencode-oncall.svg)](https://www.npmjs.com/package/opencode-oncall)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-brightgreen.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/jiwangyihao/opencode-oncall?style=social)](https://github.com/jiwangyihao/opencode-oncall/stargazers)

套件导航 / Suite: [OpenCode J Super Suite](https://github.com/jiwangyihao/opencode-j-super-suite)

> **Latest in v0.1.5 | v0.1.5 最近更新**
>
> - Provides standalone remote on-call UX for OpenCode over WeChat | 提供独立 OpenCode 微信远程值守 UX
> - Keeps slash-only WeChat control for status, todo, reply, allow, and recover flows | 保留 `/status`、`/todo`、`/reply`、`/allow`、`/recover` 等微信 Slash 控制
> - Includes OpenClaw smoke, debug bundle, dead-letter, and recovery diagnostics | 包含 OpenClaw smoke、debug bundle、dead-letter 与恢复诊断能力

[中文](#中文) | [English](#english)

---

<a name="中文"></a>

## 中文

`opencode-oncall` 是面向 **OpenCode** 的远程值守 UX 插件。它通过微信 slash-only 入口，把会话状态、待回复问题、权限确认、自然中止和恢复命令组织成离开电脑后仍可安全处理的工作流。

它适合需要远程查看 OpenCode 进度、处理 `question` / permission 请求、恢复卡住会话，或验证 OpenClaw WeChat 宿主链路的用户。

## 功能一览

- **值守绑定与重绑** — 通过插件入口管理 operator 绑定状态，支持绑定、重绑和解绑。
- **远程值守通知** — 覆盖 question、permission、terminal result、natural-stop 和 retry-error 场景。
- **微信 Slash 控制** — 支持 `/status`、`/todo`、`/reply <qid> ...`、`/allow <handle> once|always|reject`、`/reply <s*> ...` 和 `/recover`。
- **恢复与诊断** — 保留 debug bundle、dead-letter、请求状态和恢复所需的持久化状态。
- **OpenClaw 验证** — 保留 self-test、dry-run、guided smoke 和真实宿主 gate 脚本。

---

## 安装

<details open>
<summary><b>面向人类用户</b></summary>

**选项 A：让 LLM 帮你安装**

把下面这段话丢给任意 LLM（OpenCode / Claude Code / Cursor 等）：

```text
请先查看 opencode-oncall 最新 GitHub Release 正文里的“升级方式”，然后严格执行其中带明确版本号的安装/升级命令。默认应使用带 `-g/--global` 的全局命令来更新你平时实际在用的 OpenCode 实例；只有你明确想改当前项目目录下的 `.opencode` 时，才省略 `-g`。不要手动编辑 OpenCode 配置，也不要使用裸包名或 latest。参考说明：https://github.com/jiwangyihao/opencode-oncall/releases/latest
```

**选项 B：手动安装**

1. **先查看最新 GitHub Release** 的 `## 升级方式` 小节。

2. **执行其中带明确版本号的全局命令**。例如当前版本是：

   ```bash
   opencode plugin opencode-oncall@0.1.5 --force -g
   ```

3. **如果你是刻意只想改当前项目目录下的 `.opencode`**，才使用不带 `-g` 的局部命令；否则默认不要省略 `-g`。

4. **如果升级后看起来仍然没有变化**，先清理 OpenCode 插件缓存，再重新执行同一条带版本号命令。

   ```bash
   rm -rf ~/.cache/opencode/packages/opencode-oncall@*
   ```

5. **如果 OpenCode 已在运行，重启后再验证**。

</details>

<details>
<summary><b>面向 LLM 智能体</b></summary>

### 步骤指引

1. 读取本仓库最新 GitHub Release 正文，提取 `## 升级方式` 中带明确版本号的命令。

2. 直接执行该命令。默认使用带 `-g/--global` 的全局命令；只有用户明确要改当前项目目录下的 `.opencode` 时，才省略 `-g`。例如当前版本：

   ```bash
   opencode plugin opencode-oncall@0.1.5 --force -g
   ```

3. 不要手动编辑 OpenCode 配置，也不要使用裸包名或 `latest`。

4. 如果执行后版本看起来仍然没更新，先清理 OpenCode 插件缓存，再重新执行同一条带版本号命令：

   ```bash
   rm -rf ~/.cache/opencode/packages/opencode-oncall@*
   ```

5. 如果 OpenCode 已在运行，重启后再验证。

### 验证

插件安装后，先运行本地或发布包提供的 OpenClaw smoke dry-run，再在真实宿主中确认微信侧 slash-only 入口可用：

```bash
npm run wechat:smoke:real-account -- --dry-run
```

</details>

---

## 使用方式

默认入口导出 OpenCode 插件函数：

```typescript
import OpenCodeWechat from "opencode-oncall"

export default OpenCodeWechat
```

在 OpenCode TUI 中打开插件入口，完成 operator 绑定后，通过微信发送 slash 命令进行远程值守。

## 微信 Slash 命令

```text
/status
/todo
/reply <qid> <message>
/reply <s*> <message>
/allow <handle> once
/allow <handle> always
/allow <handle> reject
/recover
```

- `/status`：查看当前会话、待处理问题和远程值守状态。
- `/todo`：查看可恢复的待办或待回复事项。
- `/reply`：回复指定问题或自然中止恢复项。
- `/allow`：处理权限请求。
- `/recover`：触发恢复流程。

## 状态与诊断

插件会维护 operator 绑定、请求状态、dead-letter、debug bundle 和 broker 启动诊断等状态，用于远程值守、失败排查和恢复。

常用验证命令：

```bash
npm run wechat:smoke:self-test
npm run wechat:smoke:real-account -- --dry-run
npm run wechat:smoke:guided
```

## 适合谁使用

- 需要离开电脑后继续值守 OpenCode 进度、回答问题或处理授权请求的用户。
- 需要保留 `/status`、`/todo`、`/reply`、`/allow`、`/recover` 等微信侧交互合同的 OpenCode 工作流。
- 需要验证微信宿主链路与 OpenCode 远程值守交互合同的插件开发者。

## 本地开发

```bash
npm install
npm test
npm run build
npm run typecheck
```

真实账号登录或真实宿主 gate 属于环境相关检查，不应替代自动化测试和 dry-run。发布资料见 `docs/publishing.md`、`docs/release-notes-template.md` 和 `docs/release-notes-v0.1.5.md`。

---

<a name="english"></a>

## English

`opencode-oncall` is a remote on-call UX plugin for **OpenCode**. Through a WeChat slash-only surface, it organizes session status, pending questions, permission approvals, natural stops, and recovery commands into a workflow you can safely handle away from your computer.

Use it when you need to monitor OpenCode remotely, answer `question` / permission prompts, recover stalled sessions, or verify the OpenClaw WeChat host contract.

## What You Get

- **On-call binding and rebinding** — manage operator binding state from the plugin entry.
- **Remote on-call notifications** — cover question, permission, terminal result, natural-stop, and retry-error cases.
- **WeChat slash control** — support `/status`, `/todo`, `/reply <qid> ...`, `/allow <handle> once|always|reject`, `/reply <s*> ...`, and `/recover`.
- **Recovery and diagnostics** — keep debug bundle, dead-letter, request state, and recovery persistence.
- **OpenClaw verification** — keep self-test, dry-run, guided smoke, and real-host gate scripts.

---

## Installation

<details open>
<summary><b>For Humans</b></summary>

**Option A: Let an LLM do it**

Paste this into any LLM agent (OpenCode, Claude Code, Cursor, etc.):

```text
First read the latest GitHub Release for opencode-oncall and execute the exact versioned install/upgrade command from its "Upgrade / 升级方式" section. By default, use the global command with `-g/--global` so you update the OpenCode instances you actually run; omit `-g` only if you intentionally want to change the current project's `.opencode`. Do not manually edit the OpenCode config, and do not use a bare package name or latest. Reference: https://github.com/jiwangyihao/opencode-oncall/releases/latest
```

**Option B: Manual setup**

1. **Read the latest GitHub Release** and look for the `## Upgrade / 升级方式` section.

2. **Run the exact versioned global command** from that section. For the current version:

   ```bash
   opencode plugin opencode-oncall@0.1.5 --force -g
   ```

3. **Only omit `-g` if you intentionally want to update the current project's `.opencode` instead of the global OpenCode config.**

4. **If an upgrade still looks stale**, clear the OpenCode plugin cache and rerun the same versioned command:

   ```bash
   rm -rf ~/.cache/opencode/packages/opencode-oncall@*
   ```

5. **If OpenCode is already running, restart it before verification**.

</details>

<details>
<summary><b>For LLM Agents</b></summary>

### Step-by-Step Instructions

1. Read the latest GitHub Release body for this repository and extract the exact versioned command from `## Upgrade / 升级方式`.

2. Execute that command directly. By default, use the global command with `-g/--global`; only omit `-g` if you intentionally want to update the current project's `.opencode`. For the current version:

   ```bash
   opencode plugin opencode-oncall@0.1.5 --force -g
   ```

3. Do not install or upgrade this plugin by hand-editing OpenCode config, and do not use a bare package name or `latest`.

4. If the installed version still does not change, clear the OpenCode plugin cache and rerun the same versioned command:

   ```bash
   rm -rf ~/.cache/opencode/packages/opencode-oncall@*
   ```

5. If OpenCode is already running, restart before feature verification.

### Verification

After installation, run the OpenClaw smoke dry-run from the local or packaged repo, then confirm the WeChat slash-only surface in a real host:

```bash
npm run wechat:smoke:real-account -- --dry-run
```

</details>

---

## Usage

The default export is the OpenCode plugin function:

```typescript
import OpenCodeWechat from "opencode-oncall"

export default OpenCodeWechat
```

Open the plugin entry in OpenCode TUI, bind the operator, then send slash commands from WeChat for remote on-call control.

## WeChat Slash Commands

```text
/status
/todo
/reply <qid> <message>
/reply <s*> <message>
/allow <handle> once
/allow <handle> always
/allow <handle> reject
/recover
```

- `/status`: check the current session, pending questions, and on-call status.
- `/todo`: view recoverable todos or pending reply items.
- `/reply`: answer a specific question or natural-stop recovery item.
- `/allow`: handle permission requests.
- `/recover`: trigger the recovery flow.

## State and Diagnostics

The plugin maintains operator binding, request state, dead-letter, debug bundle, and broker startup diagnostics for remote on-call handling, failure analysis, and recovery.

Useful verification commands:

```bash
npm run wechat:smoke:self-test
npm run wechat:smoke:real-account -- --dry-run
npm run wechat:smoke:guided
```

## Who Should Use This

- Users who need to monitor OpenCode progress, answer questions, or approve requests while away from the computer.
- OpenCode workflows that need the WeChat-side `/status`, `/todo`, `/reply`, `/allow`, and `/recover` interaction contract.
- Plugin developers validating the WeChat host path and OpenCode remote on-call contract.

## Local Development

```bash
npm install
npm test
npm run build
npm run typecheck
```

Real account login and real-host gates are environment-dependent checks, not replacements for automated tests and dry-runs. Release material lives in `docs/publishing.md`, `docs/release-notes-template.md`, and `docs/release-notes-v0.1.5.md`.

---

## License

MPL-2.0 License. See [LICENSE](LICENSE) for details.
