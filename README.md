# github.hey.run

[![Deploy Worker](https://github.com/hello-yunshu/github-hey-run/actions/workflows/deploy.yml/badge.svg)](https://github.com/hello-yunshu/github-hey-run/actions/workflows/deploy.yml)

面向 `hello-yunshu` 白名单公开仓库的只读 GitHub 下载加速服务，基于 Cloudflare Worker。

> 更适合加速 **Raw、Release 和源码压缩包**。Git clone 仅作为备用访问方式，不保证比 GitHub 直连更快。

## 使用地址

服务入口：

```text
https://github.hey.run
```

### Raw 文件

```text
https://github.hey.run/hello-yunshu/<repo>/raw/<ref>/<path>
```

示例：

```bash
curl -fsSL   https://github.hey.run/hello-yunshu/Xray_bash_onekey/raw/refs/heads/main/install.sh
```

### Release 附件

```text
https://github.hey.run/hello-yunshu/<repo>/releases/download/<tag>/<file>
```

示例：

```text
https://github.hey.run/hello-yunshu/mira-mouse/releases/download/v1.0.0/Mira.dmg
```

也支持：

```text
https://github.hey.run/hello-yunshu/<repo>/releases/latest/download/<file>
```

### 源码压缩包

分支：

```text
https://github.hey.run/hello-yunshu/<repo>/archive/refs/heads/main.zip
```

Tag：

```text
https://github.hey.run/hello-yunshu/<repo>/archive/refs/tags/v1.0.0.zip
```

### Git 只读访问

```bash
git clone   https://github.hey.run/hello-yunshu/<repo>.git
```

不支持：

```bash
git push
```

## 缓存状态

响应头可能包含：

```text
X-Proxy-Cache: MISS
X-Proxy-Cache: HIT
X-Proxy-Cache: BYPASS
```

- `MISS`：本次从 GitHub 获取
- `HIT`：命中 Cloudflare 边缘缓存
- `BYPASS`：该请求不缓存

## 白名单维护

所有仓库与权限都集中在：

```text
src/config.js
```

新增或调整仓库：

```js
"example-repo": {
  git: false,
  release: true,
  archive: true,
  raw: true,
},
```

提交到 `main` 后，GitHub Actions 会自动校验并部署。

## 说明

- 仅支持 `hello-yunshu` 名下已加入白名单的公开仓库
- 不支持私有仓库、登录认证、GitHub API、Issues 或普通网页代理
- Release 必须是实际附件地址，不支持 `/releases` 或 `/releases/tag/...` 页面
- 返回 `404` 通常表示仓库未授权、能力未开启、路径错误或资源不存在
- `curl`、Git 和自动更新程序无法完成浏览器质询，Cloudflare Bot Fight Mode 可能导致 `403`