/*
 * Cinder 的 Service Worker。三条原则：
 *  1. **视频永远不缓存。** /api/stream/* 直接放行，一个字节都不进 Cache Storage
 *     —— 那些是短时效签名地址，缓存下来只会拿到过期的清单，而且几百 MB 塞爆配额。
 *  2. 页面走 network-first：连得上家里那台 Mac 就用新的，连不上退到缓存，
 *     缓存也没有才显示离线壳。
 *  3. 静态资源走 stale-while-revalidate：装完就能秒开。
 */

const VERSION = "cinder-v1";
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 视频流：绝不插手。Range 请求被 SW 中转过一次就可能坏掉拖进度条。
  if (url.pathname.startsWith("/api/stream")) return;

  // 抓取之类的写接口也不缓存
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons")) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(PAGES);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("离线，且没有缓存", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? network;
}
