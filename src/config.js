/**
 * 日常维护只需要改这个文件。
 *
 * true  = 允许对应能力
 * false = 禁止对应能力
 * 删除整个仓库条目 = 立即停止该仓库的所有代理能力
 */

export const SETTINGS = Object.freeze({
  hostname: "github.hey.run",
  owner: "hello-yunshu",
  maxRedirects: 5,
  maxGitRequestBytes: 16 * 1024 * 1024,
  maxCacheableBytes: 500 * 1024 * 1024,
});

export const REPOSITORIES = Object.freeze({
  "mira-mouse": {
    git: true,
    release: true,
    archive: true,
    raw: true,
  },

  "mira-mouse-plugins": {
    git: true,
    release: false,
    archive: true,
    raw: true,
  },

  "homebrew-mira": {
    git: true,
    release: false,
    archive: true,
    raw: true,
  },

  "Xray_bash_onekey": {
    git: true,
    release: false,
    archive: true,
    raw: true,
  },

  "Xray_bash_onekey_skill": {
    git: true,
    release: false,
    archive: true,
    raw: true,
  },

  "Xray_bash_onekey_api": {
    git: false,
    release: false,
    archive: false,
    raw: true,
  },

  "Xray_bash_onekey_Nginx": {
    git: false,
    release: true,
    archive: false,
    raw: true,
  },

  "luci-app-nginx-manager": {
    git: true,
    release: true,
    archive: true,
    raw: true,
  },

  "luci-app-upnp-nat-relay": {
    git: true,
    release: true,
    archive: true,
    raw: true,
  },

  "luci-app-cloudflare-ip": {
    git: true,
    release: true,
    archive: true,
    raw: true,
  },
});

export const CACHE_TTL = Object.freeze({
  releaseVersion: 6 * 60 * 60, // 固定版本 Release：6 小时
  releaseLatest: 5 * 60,       // latest：5 分钟
  archiveTag: 24 * 60 * 60,    // Tag 源码包：24 小时
  archiveBranch: 5 * 60,       // 分支源码包：5 分钟
  rawCommit: 7 * 24 * 60 * 60, // Commit SHA Raw：7 天
  rawTag: 24 * 60 * 60,        // Tag Raw：24 小时
  rawBranch: 5 * 60,           // 分支 Raw：5 分钟
});

export function repositoryAllows(repo, capability) {
  return REPOSITORIES[repo]?.[capability] === true;
}
