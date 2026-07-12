import { CACHE_TTL, REPOSITORIES, SETTINGS } from "../src/config.js";

const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const CAPABILITIES = ["git", "release", "archive", "raw"];

const errors = [];

if (!HOSTNAME.test(SETTINGS.hostname)) {
  errors.push(`SETTINGS.hostname 无效：${SETTINGS.hostname}`);
}

if (!OWNER.test(SETTINGS.owner)) {
  errors.push(`SETTINGS.owner 无效：${SETTINGS.owner}`);
}

for (const key of ["maxRedirects", "maxGitRequestBytes", "maxCacheableBytes"]) {
  if (!Number.isInteger(SETTINGS[key]) || SETTINGS[key] <= 0) {
    errors.push(`SETTINGS.${key} 必须是正整数`);
  }
}

const repoNames = Object.keys(REPOSITORIES);
if (repoNames.length === 0) {
  errors.push("REPOSITORIES 不能为空");
}

for (const [repo, permissions] of Object.entries(REPOSITORIES)) {
  if (!REPO_NAME.test(repo) || repo === "." || repo === "..") {
    errors.push(`仓库名无效：${repo}`);
  }

  const keys = Object.keys(permissions);
  for (const key of keys) {
    if (!CAPABILITIES.includes(key)) {
      errors.push(`${repo} 含未知能力：${key}`);
    }
  }

  let enabled = 0;
  for (const capability of CAPABILITIES) {
    if (typeof permissions[capability] !== "boolean") {
      errors.push(`${repo}.${capability} 必须是 true 或 false`);
    } else if (permissions[capability]) {
      enabled += 1;
    }
  }

  if (enabled === 0) {
    errors.push(`${repo} 没有启用任何能力；应删除整个仓库条目`);
  }
}

for (const [name, value] of Object.entries(CACHE_TTL)) {
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`CACHE_TTL.${name} 必须是非负整数秒数`);
  }
}

if (errors.length > 0) {
  console.error("配置校验失败：");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`配置校验通过：${repoNames.length} 个仓库，域名 ${SETTINGS.hostname}`);
