opencode-oncall@0.1.3 修复 broker lifecycle 测试在干净 CI 状态根下读取不到 operator 绑定的问题，让 GitHub Release workflow 能真正验证 question candidate 合并与 distinct 路径后再发布 npm。

## 适合谁升级

- 依赖 `opencode-oncall` 通过微信接收 OpenCode question、permission、natural-stop 和 retry-error 通知的用户。
- 需要在 GitHub Actions、全新机器或没有本地微信绑定缓存的环境中验证远程值守工作流的维护者。

## 你会看到的变化

- broker lifecycle 测试现在会把 bridge 侧 operator 读取也固定到同一个 sandbox state root，不再意外依赖开发机上残留的默认绑定状态。
- 重复 question candidate 仍会合并为单条 authoritative active question，不会膨胀出多个句柄。
- 不同 question candidate 会各自保留独立 authoritative active question，不会被错误吞掉。
- 微信 slash-only 值守入口、通知格式和远程恢复交互保持不变。

## 升级方式

```bash
opencode plugin opencode-oncall@0.1.3 --force -g
```
