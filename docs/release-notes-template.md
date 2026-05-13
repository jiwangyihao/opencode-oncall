opencode-oncall@0.1.2 让 OpenCode 远程值守 UX 的 Linux 发布验证在长临时路径和 broker 子进程退出场景下都能稳定完成。

## 适合谁升级

- 需要通过微信接收 OpenCode question、permission、natural-stop 和 retry-error 通知的用户。
- 已经依赖微信侧 `/status`、`/todo`、`/reply`、`/allow` 或 `/recover` 继续远程处理会话的人。

## 你会看到的变化

- 远程值守 UX 现在由独立插件 `opencode-oncall` 承载，不再跟随 Copilot 账号切换包发布。
- 安装命令固定到明确版本，便于排查 OpenCode 插件缓存和环境差异。
- OpenClaw smoke、debug bundle 和发布验证继续归入远程值守插件自己的发布链路。
- POSIX broker endpoint 会避开过长 Unix socket 路径，减少 GitHub Actions 与长临时目录下的 `listen EINVAL`。
- broker 生命周期测试会显式等待 stdin EOF 退出，避免清理 fallback 掩盖 Linux 子进程退出超时。

## 升级方式

```bash
opencode plugin opencode-oncall@0.1.2 --force -g
```
