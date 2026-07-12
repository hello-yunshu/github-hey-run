# github.hey.run

面向 `hello-yunshu` 指定公开仓库的只读 GitHub 加速 Worker。

- 只允许配置表中的仓库与能力
- 支持只读 Git clone/fetch、Release、Archive 和 Raw
- 禁止 Git push、Cookie、Authorization 和任意 URL 代理
- Git 协议请求不缓存；静态下载按内容类型缓存
- Push 到 `main` 后由 GitHub Actions 自动部署到 Cloudflare

## 仓库结构

```text
.
├── .github/
│   ├── workflows/deploy.yml   # 校验及自动部署
│   └── dependabot.yml         # 依赖更新
├── scripts/
│   └── validate-config.mjs    # 白名单配置校验
├── src/
│   ├── config.js              # 日常维护主要修改这里
│   └── index.js               # Worker 核心逻辑
├── package.json
├── package-lock.json
└── wrangler.jsonc
```

## 第一次部署

### 1. 创建 GitHub 仓库

建议仓库名：

```text
github-hey-run
```

将本项目全部文件推送到仓库的 `main` 分支。

### 2. 清理 DNS 冲突

进入 Cloudflare 的 `hey.run` DNS 页面，检查是否已经存在主机名为 `github` 的 A、AAAA 或 CNAME 记录。

`github.hey.run` 若没有其他用途，应先删除冲突记录。`wrangler.jsonc` 会通过 Worker Custom Domain 创建并管理该域名。

### 3. 创建 Cloudflare API Token

进入 Cloudflare：

```text
Manage Account → API Tokens → Create Token
```

在权限模板中选择：

```text
Edit Cloudflare Workers
```

将 Token 的资源范围尽量缩小到：

- 你的 Cloudflare 账户
- `hey.run` 这个 Zone

复制生成的 Token。Token 只显示一次，不要提交到 GitHub 仓库。

### 4. 获取 Account ID

在 Cloudflare 控制台进入 `hey.run` 或账户概览，复制 Cloudflare Account ID。

### 5. 创建 production Environment 并添加 Secrets

进入 GitHub 仓库：

```text
Settings → Environments → New environment → production
```

建议在 **Deployment branches and tags** 中仅允许 `main` 分支。然后在该 Environment 的 **Environment secrets** 中添加：

| Secret | 值 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 上一步创建的 Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |

使用 Environment Secrets 比全仓库 Secrets 更容易限制生产部署范围。个人项目不需要每次人工批准；希望更严格时，可以再给 `production` 增加 Required reviewers。

### 6. 触发部署

首次推送到 `main` 会自动触发。也可以进入：

```text
Actions → Validate and Deploy Worker → Run workflow
```

Pull Request 只会执行校验；只有 `main` 分支 push 或手动运行才会部署。

### 7. 验证

```bash
curl -i https://github.hey.run/healthz

git clone https://github.hey.run/hello-yunshu/mira-mouse.git
```

预期 `/healthz` 返回 `200` 和 `ok`。

## 增加仓库

只修改 `src/config.js` 中的 `REPOSITORIES`：

```js
"new-repository": {
  git: true,
  release: true,
  archive: true,
  raw: true,
},
```

然后提交：

```bash
git add src/config.js
git commit -m "Add new-repository to whitelist"
git push
```

GitHub Actions 会先检查配置，再自动部署。

## 删除仓库

从 `REPOSITORIES` 中删除整个仓库配置块并 push。不要保留四项全部为 `false` 的空条目，配置校验会阻止这种提交部署。

## 调整能力

```js
"example": {
  git: true,       // clone、fetch、pull
  release: false,  // Release 文件
  archive: true,   // 分支或 Tag 源码包
  raw: true,       // Raw 文件
},
```

每项必须是 `true` 或 `false`。未知字段、非法仓库名和空权限都会使 Actions 校验失败。

## 本地检查

Node.js 22 或更高版本：

```bash
npm ci
npm run check
```

检查包括：

- JavaScript 语法
- 白名单配置结构
- Wrangler dry-run

## 本地部署

自动部署异常时，可临时使用：

```bash
npx wrangler login
npm run deploy
```

## 安全建议

1. API Token 只使用 `Edit Cloudflare Workers` 模板，并限制到账户与 `hey.run` Zone。
2. 不要把 Token、Account ID、`.env` 或 `.dev.vars` 提交到仓库。
3. GitHub 仓库建议开启 Secret scanning 和 Dependabot。
4. 建议为 `production` Environment 设置仅 `main` 分支可部署；需要更严格控制时可增加人工审批。
5. Cloudflare WAF 对 `github.hey.run` 设置按 IP 限速，但不要使用浏览器 Challenge，以免 Git、curl 和 Homebrew 无法访问。

## 常用地址

```text
Git clone:
https://github.hey.run/hello-yunshu/<repo>.git

Raw:
https://github.hey.run/hello-yunshu/<repo>/raw/<ref>/<path>

Release:
https://github.hey.run/hello-yunshu/<repo>/releases/download/<tag>/<file>

Archive:
https://github.hey.run/hello-yunshu/<repo>/archive/refs/tags/<tag>.zip
```
