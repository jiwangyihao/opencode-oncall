opencode-oncall@0.1.0 是 OpenCode 远程值守 UX 的第一个独立版本，让用户可以单独安装、验证和升级离开电脑后的值守工作流。

## 适合谁升级

- 需要离开电脑后继续查看 OpenCode 会话状态、接收问题或处理授权请求的用户。
- 已经在使用微信通知、`/recover` 或 OpenClaw WeChat smoke，并希望远程值守能力后续升级不再受 Copilot 包发布节奏影响的人。

## 你会看到的变化

- 值守绑定、通知、远程回复、权限确认和恢复命令拥有独立包名 `opencode-oncall`。
- 首发文档把发布验证、GitHub Release 和 npm Trusted Publisher 链路收敛到远程值守插件仓库。
- `README.md` 和 Release Notes 都使用明确版本命令，避免 `latest` 或旧 Copilot 包名带来的安装歧义。

## 升级方式

```bash
opencode plugin opencode-oncall@0.1.0 --force -g
```
