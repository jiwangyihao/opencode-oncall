opencode-oncall@0.1.4 修复 notification-flow 在 Linux CI 长临时目录下生成过长 Unix socket 路径后挂起的问题，让 GitHub Release workflow 能完成通知同步测试并继续发布 npm。

## 适合谁升级

- 依赖 `opencode-oncall` 通过微信接收 OpenCode question、permission、natural-stop 和 retry-error 通知的用户。
- 需要在 GitHub Actions、Linux 主机或较长临时目录路径下验证远程值守通知链路的维护者。

## 你会看到的变化

- notification-flow 测试现在会在 POSIX 长路径下回退到短 socket 路径，不再因为 Unix socket 路径过长让 CI 停在 `npm test`。
- live questionOpened 通知同步测试会释放隔离状态根队列，后续 notification 测试可以继续执行并自然结束。
- 微信 slash-only 值守入口、通知格式和远程恢复交互保持不变。

## 升级方式

```bash
opencode plugin opencode-oncall@0.1.4 --force -g
```
