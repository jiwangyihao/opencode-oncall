opencode-oncall@0.1.2 修复 Linux 发布验证中长临时目录导致的 broker Unix socket 监听失败，并收紧 broker 子进程退出断言，让远程值守 UX 的第二个修正版可以在 GitHub Actions 上完整跑完自动化验证。

## 适合谁升级

- 已安装 `opencode-oncall@0.1.0` 或 `opencode-oncall@0.1.1`，并希望获得 Linux / CI 环境下更稳定 broker 启动行为的用户。
- 需要在 GitHub Actions、长临时目录或类似 POSIX 环境中验证远程值守工作流的维护者。

## 你会看到的变化

- POSIX 默认 broker endpoint 会在 state root 路径过长时回退到短临时目录，避免 Unix socket 路径超过系统限制后触发 `listen EINVAL`。
- broker 生命周期测试会显式等待 stdin EOF 退出，避免 Linux runner 上的子进程清理路径掩盖真实退出失败。
- 发布链测试覆盖了这个路径长度边界，防止后续 Release workflow 再次卡在同类问题。
- 微信 slash-only 值守入口、通知格式和远程恢复交互保持不变。

## 升级方式

```bash
opencode plugin opencode-oncall@0.1.2 --force -g
```
