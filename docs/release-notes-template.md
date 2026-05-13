opencode-oncall@0.1.0 让 OpenCode 远程值守 UX 脱离 Copilot 账号切换包，作为独立插件安装和验证。

## 适合谁升级

- 需要通过微信接收 OpenCode question、permission、natural-stop 和 retry-error 通知的用户。
- 已经依赖微信侧 `/status`、`/todo`、`/reply`、`/allow` 或 `/recover` 继续远程处理会话的人。

## 你会看到的变化

- 远程值守 UX 现在由独立插件 `opencode-oncall` 承载，不再跟随 Copilot 账号切换包发布。
- 安装命令固定到明确版本，便于排查 OpenCode 插件缓存和环境差异。
- OpenClaw smoke、debug bundle 和发布验证归入远程值守插件自己的发布链路。

## 升级方式

```bash
opencode plugin opencode-oncall@0.1.0 --force -g
```
