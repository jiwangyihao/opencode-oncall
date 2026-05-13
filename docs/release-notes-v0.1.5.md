opencode-oncall@0.1.5 修复 jiti loader 在 Linux CI 中处理 Windows 绝对路径 fixture 时生成错误 file URL 的问题，让跨平台兼容测试通过后继续完成 GitHub Release workflow 和 npm 发布。

## 适合谁升级

- 依赖 `opencode-oncall` 通过微信接收 OpenCode question、permission、natural-stop 和 retry-error 通知的用户。
- 需要在 GitHub Actions、Linux 主机或跨平台测试环境中验证 jiti 兼容加载链路的维护者。

## 你会看到的变化

- jiti loader 现在能识别 Windows 绝对路径 fixture，并在 Linux CI 中生成稳定的 `file:///C:/...` URL。
- `resolveJitiEsmEntry`、`resolveJitiCjsEntry` 和 Bun JS 原生导入路径在跨平台测试中保持一致。
- 微信 slash-only 值守入口、通知格式和远程恢复交互保持不变。

## 升级方式

```bash
opencode plugin opencode-oncall@0.1.5 --force -g
```