# opencode-oncall 发布流程

本文档只描述 `opencode-oncall@0.1.3` 的发布链路。执行任何外部发布动作前，必须先获得明确授权；未获授权时只停在本地可审查状态。

## 手动首发

首发必须先完成本地 fresh 验证，再初始化新仓库并发布。推荐顺序如下：

1. 在当前仓库根目录中确认 package metadata、README、Release Notes 和 workflow 都指向 `opencode-oncall@0.1.3`。
2. 运行发布前 fresh 验证，确认 build、typecheck、测试、pack dry-run、tarball install / import smoke 和 OpenClaw dry-run 都有当前输出。
3. 获得授权后再执行 `git init`、initial commit、远端创建、tag、npm publish 和 GitHub Release。所有 git 命令都按上游流程要求逐条设置 `GIT_MASTER=1`。
4. 手动首发的 npm 发布命令为 `npm publish --access public`。发布成功后再配置 npm Trusted Publisher，让后续版本由 GitHub Release workflow 通过 OIDC 发布。
5. GitHub Release 正文必须来自 `docs/release-notes-v0.1.3.md`，不能临时改写成 `Summary + Test Plan`。

## 发布前 fresh 验证

每次发布前都重新执行以下命令，不沿用旧输出：

```powershell
npm install
npm run build
npm run typecheck
npm test
npm pack --dry-run --json
node --test test/package-boundary.test.js
npm run wechat:smoke:real-account -- --dry-run
```

如果需要执行真实 tarball smoke，使用当前工作区生成的 tarball：

```powershell
$packJson = npm pack --json
$pack = @($packJson | ConvertFrom-Json)
$tgz = Join-Path (Get-Location) $pack[0].filename
$tmp = Join-Path $env:TEMP ("opencode-oncall-pack-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
npm init -y --prefix $tmp | Out-Null
npm install --prefix $tmp $tgz
Push-Location $tmp
try {
  node --input-type=module -e "const mod = await import('opencode-oncall'); const keys = Object.keys(mod).sort(); console.log(keys.join(',')); if (!keys.includes('OpenCodeWechat') || !keys.includes('default') || keys.includes('CopilotAccountSwitcher')) process.exit(1)"
} finally {
  Pop-Location
}
```

真实账号 smoke 和 Windows PTY / 真实宿主 gate 受环境影响，只作为观察性证据；除非它们暴露插件代码缺陷，否则不要替代上面的 release-blocking gate。

## npm Trusted Publisher 设置与验证

首发手动 `npm publish --access public` 成功后，在 npm 包设置中配置 Trusted Publisher：

- Package：`opencode-oncall`
- Repository：`jiwangyihao/opencode-oncall`
- Workflow：`.github/workflows/release.yml`
- Environment：留空，除非后续显式引入 GitHub Environment 审批

配置完成后，用后续 GitHub Release published 事件验证 OIDC 发布。workflow 必须依赖 GitHub OIDC，不得使用 `NODE_AUTH_TOKEN`、`NPM_TOKEN` 或 `secrets.NPM_*`。

验证远端状态：

```powershell
npm view opencode-oncall@0.1.3 version
gh release view v0.1.3 --repo jiwangyihao/opencode-oncall --json body,url
```

只有 `npm view opencode-oncall@0.1.3 version` 返回 `0.1.3`，才能把同版本 publish skipped 视为正常。

## 后续 GitHub Actions 发布

后续版本通过 GitHub Release published 触发 `.github/workflows/release.yml`：

1. 更新 `package.json` 和 `package-lock.json` 的版本。
2. 重新生成对应版本的 Release Notes，并保留模板要求的三个小节。
3. 运行发布前 fresh 验证。
4. 创建 tag 和 GitHub Release。
5. 等待 release workflow 完成 install、build、test、version check 和 `npm publish --access public`。
6. 回读 npm、GitHub Release 和 workflow 状态。

workflow 如果发现同版本已经在 npm 存在，可以跳过 publish；但 install、build、test 和版本检查仍必须成功。

## GitHub Release 创建与验证

v0.1.3 的 Release 创建命令应使用固定 notes 文件：

```powershell
gh release create v0.1.3 --notes-file docs/release-notes-v0.1.3.md --repo jiwangyihao/opencode-oncall --target master --title "opencode-oncall v0.1.3"
```

创建后立刻回读正文和 URL：

```powershell
gh release view v0.1.3 --repo jiwangyihao/opencode-oncall --json body,url
```

检查正文包含一句价值导语、`## 适合谁升级`、`## 你会看到的变化`、`## 升级方式`，且升级命令为：

```bash
opencode plugin opencode-oncall@0.1.3 --force -g
```

## 部分失败恢复

如果 `npm publish` 已经成功，但 GitHub Release 创建失败，不要重新发布同一个 npm 版本。只修复 GitHub Release 缺口，运行或修复以下命令并做远端验证：

```powershell
gh release create v0.1.3 --notes-file docs/release-notes-v0.1.3.md --repo jiwangyihao/opencode-oncall --target master --title "opencode-oncall v0.1.3"
npm view opencode-oncall@0.1.3 version
gh release view v0.1.3 --repo jiwangyihao/opencode-oncall --json body,url
```

如果 GitHub Release 已存在，但 OIDC publish 失败，先修复 npm Trusted Publisher 设置或 `.github/workflows/release.yml`，再重新运行同一个 release workflow。只有当 `npm view opencode-oncall@0.1.3 version` 返回 `0.1.3` 时，workflow 中的 publish skipped 才能视为正常；否则必须继续修复 OIDC 发布链路，而不是创建新版本绕过问题。

