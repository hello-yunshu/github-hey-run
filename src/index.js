import {
  CACHE_TTL,
  REPOSITORIES,
  SETTINGS,
  repositoryAllows,
} from "./config.js";

const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

const REDIRECT_HOSTS = Object.freeze({
  release: new Set([
    "github.com",
    "release-assets.githubusercontent.com",
    "objects.githubusercontent.com",
    "objects-origin.githubusercontent.com",
    "github-releases.githubusercontent.com",
  ]),
  archive: new Set(["github.com", "codeload.github.com"]),
  raw: new Set(["github.com", "raw.githubusercontent.com"]),
});

const REQUEST_HEADERS = [
  "accept",
  "content-type",
  "git-protocol",
  "range",
  "user-agent",
];

const REMOVE_RESPONSE_HEADERS = [
  "set-cookie",
  "set-cookie2",
  "server",
  "via",
  "x-powered-by",
];

export default {
  async fetch(request, _env, ctx) {
    try {
      return await handleRequest(request, ctx);
    } catch (error) {
      console.error("Unhandled Worker error", error);
      return text("Upstream service temporarily unavailable.\n", 502);
    }
  },
};

async function handleRequest(request, ctx) {
  const url = new URL(request.url);

  if (url.hostname !== SETTINGS.hostname) {
    return text("Invalid host.\n", 421);
  }

  if (url.pathname === "/") {
    if (!isGetOrHead(request.method)) return methodNotAllowed("GET, HEAD");
    return homepage();
  }

  if (url.pathname === "/healthz") {
    if (!isGetOrHead(request.method)) return methodNotAllowed("GET, HEAD");
    return text("ok\n", 200, { "Cache-Control": "no-store" });
  }

  if (hasAmbiguousPath(url)) {
    return text("Invalid path.\n", 400);
  }

  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length < 2 || segments[0] !== SETTINGS.owner) {
    return notFound();
  }

  if (segments[1].endsWith(".git")) {
    return handleGit(request, url, segments);
  }

  const repo = segments[1];
  if (!validRepository(repo) || !REPOSITORIES[repo]) return notFound();

  const kind = classifyStaticPath(segments, url.pathname);
  if (!kind || !repositoryAllows(repo, kind)) return notFound();

  return handleStatic(request, url, kind, ctx);
}

async function handleGit(request, url, segments) {
  const repo = segments[1].slice(0, -4);
  if (!validRepository(repo) || !repositoryAllows(repo, "git")) {
    return notFound();
  }

  if (
    segments.includes("git-receive-pack") ||
    url.searchParams.get("service") === "git-receive-pack"
  ) {
    return text("Git push is not supported.\n", 403);
  }

  const isInfoRefs =
    segments.length === 4 &&
    segments[2] === "info" &&
    segments[3] === "refs";

  if (isInfoRefs) {
    if (!isGetOrHead(request.method)) return methodNotAllowed("GET, HEAD");

    const query = [...url.searchParams.entries()];
    if (
      query.length !== 1 ||
      url.searchParams.get("service") !== "git-upload-pack"
    ) {
      return text("Only git-upload-pack is supported.\n", 403);
    }

    const upstream = new URL(
      `https://github.com/${SETTINGS.owner}/${repo}.git/info/refs`,
    );
    upstream.search = url.search;
    return proxyGit(request, upstream);
  }

  const isUploadPack =
    segments.length === 3 && segments[2] === "git-upload-pack";

  if (isUploadPack) {
    if (request.method !== "POST") return methodNotAllowed("POST");
    if (url.search) return text("Unexpected query string.\n", 400);

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("application/x-git-upload-pack-request")) {
      return text("Unsupported media type.\n", 415);
    }

    const length = parseContentLength(request.headers.get("content-length"));
    if (length !== null && length > SETTINGS.maxGitRequestBytes) {
      return text("Request body too large.\n", 413);
    }

    const upstream = new URL(
      `https://github.com/${SETTINGS.owner}/${repo}.git/git-upload-pack`,
    );
    return proxyGit(request, upstream);
  }

  return notFound();
}

async function proxyGit(request, upstream) {
  const headers = safeRequestHeaders(request);
  const response = await fetch(upstream, {
    method: request.method,
    headers,
    body: request.method === "POST" ? request.body : undefined,
    redirect: "manual",
    cf: { cacheEverything: false, cacheTtl: 0 },
  });

  if (isRedirect(response.status)) {
    await response.body?.cancel();
    return text("Unexpected upstream redirect.\n", 502);
  }

  return cleanedResponse(response, {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Proxy-Cache": "BYPASS",
  });
}

async function handleStatic(request, incomingUrl, kind, ctx) {
  if (!isGetOrHead(request.method)) return methodNotAllowed("GET, HEAD");
  if (incomingUrl.search) return text("Query strings are not supported.\n", 400);

  const hasRange = request.headers.has("range");
  const cacheKey = new Request(incomingUrl.toString(), { method: "GET" });

  if (request.method === "GET" && !hasRange) {
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return copyResponse(cached, { "X-Proxy-Cache": "HIT" });
    }
  }

  let target = new URL(`https://github.com${incomingUrl.pathname}`);

  for (let count = 0; count <= SETTINGS.maxRedirects; count += 1) {
    if (!allowedTarget(target, kind)) {
      return text("Blocked upstream destination.\n", 403);
    }

    const response = await fetch(target, {
      method: request.method,
      headers: safeRequestHeaders(request),
      redirect: "manual",
      cf: { cacheEverything: false },
    });

    if (isRedirect(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) return text("Invalid upstream redirect.\n", 502);

      try {
        target = new URL(location, target);
      } catch {
        return text("Invalid upstream redirect URL.\n", 502);
      }
      continue;
    }

    const ttl = cacheTtl(kind, incomingUrl.pathname);
    const extraHeaders = {
      "X-Proxy-Cache": "MISS",
      "Cache-Control": `public, max-age=${ttl}`,
    };

    const cleaned = cleanedResponse(response, extraHeaders);

    if (canCache(request, response, hasRange)) {
      ctx.waitUntil(
        caches.default.put(cacheKey, cleaned.clone()).catch((error) => {
          console.error("Cache put failed", error);
        }),
      );
    } else {
      cleaned.headers.set("X-Proxy-Cache", "BYPASS");
      if (response.status !== 200) cleaned.headers.set("Cache-Control", "no-store");
    }

    return cleaned;
  }

  return text("Too many upstream redirects.\n", 502);
}

function classifyStaticPath(segments, pathname) {
  const isVersionRelease =
    segments[2] === "releases" &&
    segments[3] === "download" &&
    segments.length >= 6;

  const isLatestRelease =
    segments[2] === "releases" &&
    segments[3] === "latest" &&
    segments[4] === "download" &&
    segments.length >= 6;

  if (isVersionRelease || isLatestRelease) return "release";

  const isArchive =
    segments[2] === "archive" &&
    segments[3] === "refs" &&
    ["heads", "tags"].includes(segments[4]) &&
    segments.length >= 6 &&
    (pathname.endsWith(".zip") || pathname.endsWith(".tar.gz"));

  if (isArchive) return "archive";

  if (segments[2] === "raw" && segments.length >= 5) return "raw";

  return null;
}

function cacheTtl(kind, pathname) {
  if (kind === "release") {
    return pathname.includes("/releases/latest/download/")
      ? CACHE_TTL.releaseLatest
      : CACHE_TTL.releaseVersion;
  }

  if (kind === "archive") {
    return pathname.includes("/archive/refs/tags/")
      ? CACHE_TTL.archiveTag
      : CACHE_TTL.archiveBranch;
  }

  const rawTail = pathname.split("/raw/")[1] ?? "";
  const firstSegment = rawTail.split("/")[0] ?? "";

  if (COMMIT_SHA.test(firstSegment)) return CACHE_TTL.rawCommit;
  if (rawTail.startsWith("refs/tags/")) return CACHE_TTL.rawTag;
  return CACHE_TTL.rawBranch;
}

function canCache(request, response, hasRange) {
  if (request.method !== "GET" || hasRange || response.status !== 200) return false;

  const length = parseContentLength(response.headers.get("content-length"));
  return length === null || length <= SETTINGS.maxCacheableBytes;
}

function allowedTarget(url, kind) {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443") &&
    REDIRECT_HOSTS[kind].has(url.hostname)
  );
}

function safeRequestHeaders(request) {
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  if (!headers.has("user-agent")) {
    headers.set("user-agent", `${SETTINGS.hostname}/1.0 read-only-proxy`);
  }

  // 故意不转发 Authorization、Cookie、Host、客户端真实 IP 等敏感头。
  return headers;
}

function cleanedResponse(upstream, extraHeaders = {}) {
  const headers = new Headers(upstream.headers);
  for (const name of REMOVE_RESPONSE_HEADERS) headers.delete(name);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function copyResponse(response, extraHeaders = {}) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function homepage() {
  const names = Object.keys(REPOSITORIES).sort();
  return text(
    [
      "Unofficial read-only accelerator.",
      `Allowed owner: ${SETTINGS.owner}`,
      "",
      "Allowed repositories:",
      ...names.map((name) => `- ${name}`),
      "",
      `Clone example: git clone https://${SETTINGS.hostname}/${SETTINGS.owner}/mira-mouse.git`,
      "Git push, authentication and private repositories are not supported.",
      "",
    ].join("\n"),
  );
}

function hasAmbiguousPath(url) {
  return (
    /%(?:25)*(?:2f|5c|00)/i.test(url.pathname) ||
    url.pathname.includes("\\") ||
    url.pathname.split("/").some((segment) => segment === "." || segment === "..")
  );
}

function validRepository(repo) {
  return REPO_NAME.test(repo) && repo !== "." && repo !== "..";
}

function parseContentLength(value) {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isGetOrHead(method) {
  return method === "GET" || method === "HEAD";
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function methodNotAllowed(allow) {
  return text("Method not allowed.\n", 405, { Allow: allow });
}

function notFound() {
  return text("Not found.\n", 404);
}

function text(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      ...extraHeaders,
    },
  });
}
