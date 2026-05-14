# opencode-oncall

[![npm version](https://img.shields.io/npm/v/opencode-oncall.svg)](https://www.npmjs.com/package/opencode-oncall)
[![npm downloads](https://img.shields.io/npm/dw/opencode-oncall.svg)](https://www.npmjs.com/package/opencode-oncall)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-brightgreen.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/jiwangyihao/opencode-oncall?style=social)](https://github.com/jiwangyihao/opencode-oncall/stargazers)

套件导航 / Suite: [OpenCode J Super Suite](https://github.com/jiwangyihao/opencode-j-super-suite)

`opencode-oncall` 是面向 OpenCode 的远程值守 UX 插件。它通过微信 slash-only 入口，把会话状态、待回复问题、权限确认、自然中止和恢复命令组织成离开电脑后仍可安全处理的工作流。

## 适合谁使用

- 需要在离开电脑时继续值守 OpenCode 进度、回答问题或处理授权请求的用户。
- 需要保留 `/status`、`/todo`、`/reply`、`/allow`、`/recover` 等微信侧交互合同的 OpenCode 工作流。
- 需要验证微信宿主链路与 OpenCode 远程值守交互合同的插件开发者。

## 安装

首发发布完成后，使用固定版本命令安装或升级：

```bash
opencode plugin opencode-oncall@0.1.5 --force -g
```

如果你只想把插件安装到当前项目的 `.opencode`，可以去掉 `-g`；否则建议保留全局安装参数，让平时实际使用的 OpenCode 实例拿到同一版本。

## 能力范围

- **值守绑定与重绑：** 通过插件入口管理 operator 绑定状态。
- **远程值守通知：** 覆盖 question、permission、terminal result、natural-stop 和 retry-error 场景。
- **微信侧 slash：** 支持 `/status`、`/todo`、`/reply <qid> ...`、`/allow <handle> once|always|reject`、`/reply <s*> ...` 和 `/recover`。
- **恢复与诊断：** 保留 debug bundle、dead-letter、请求状态和恢复所需的持久化状态。
- **OpenClaw 验证：** 保留 self-test、dry-run、guided smoke 和真实宿主 gate 脚本。

## 本地验证

```bash
npm install
node --test test/package-boundary.test.js
npm run build
npm run typecheck
npm test
npm run wechat:smoke:real-account -- --dry-run
```

`npm test` 是首发前的完整 fresh 验证入口；真实账号登录或真实宿主 gate 属于环境相关检查，不应替代自动化测试和 dry-run。

## 发布文档

- 发布流程：[`docs/publishing.md`](docs/publishing.md)
- Release Notes 模板：[`docs/release-notes-template.md`](docs/release-notes-template.md)
- v0.1.5 发布说明：[`docs/release-notes-v0.1.5.md`](docs/release-notes-v0.1.5.md)

## 许可证

MPL-2.0 License. See [LICENSE](LICENSE) for details.
