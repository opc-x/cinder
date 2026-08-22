import { DEFAULT_UA } from "@/lib/adapters/base";
import { upstreamFetch } from "@/lib/http";
import { packTarget, type ProxyTarget } from "./target";

/** 改写后的分片/子清单都指回这个 route。 */
export const PROXY_PATH = "/api/stream/p";

const MANIFEST_TYPES = ["mpegurl", "x-mpegurl", "vnd.apple.mpegurl"];

function isManifest(url: string, contentType: string | null): boolean {
  if (contentType && MANIFEST_TYPES.some((t) => contentType.toLowerCase().includes(t))) return true;
  return new URL(url).pathname.toLowerCase().endsWith(".m3u8");
}

function proxyUrl(target: ProxyTarget): string {
  return `${PROXY_PATH}?${packTarget(target)}`;
}

/**
 * HLS 清单改写：把清单里所有指向源站的地址换成指回我们自己的代理。
 * 漏掉任何一类都会「播两秒就断」：
 *   - 裸行     → 分片 (.ts/.m4s) 或子清单 (.m3u8)
 *   - EXT-X-KEY / EXT-X-MAP / EXT-X-MEDIA / EXT-X-I-FRAME-STREAM-INF 的 URI="..."
 * 相对地址一律先按清单的最终 URL（跟完重定向的那个）解析成绝对地址。
 */
export function rewriteManifest(
  body: string,
  manifestUrl: string,
  headers: Record<string, string> | undefined,
): string {
  const base = new URL(manifestUrl);
  const toProxy = (raw: string) => proxyUrl({ url: new URL(raw, base).toString(), headers });

  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        // 属性行里的 URI="..."（可能不止一个标签用到）
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${toProxy(uri)}"`);
      }
      return toProxy(trimmed);
    })
    .join("\n");
}

/** 允许透传给上游的请求头。多一个都可能触发源站的风控。 */
const FORWARD_TO_UPSTREAM = ["range", "if-range", "accept"];
/** 需要原样回给浏览器的响应头。少一个进度条就废了。 */
const FORWARD_TO_CLIENT = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

/**
 * 核心转发。三件事：注入源站要的 Referer/Origin、透传 Range、
 * 遇到 m3u8 就改写而不是直传。字节流用 ReadableStream 直接转，不落盘不缓冲。
 */
export async function proxyStream(req: Request, target: ProxyTarget): Promise<Response> {
  const upstreamHeaders = new Headers({
    "user-agent": DEFAULT_UA,
    ...(target.headers ?? {}),
    // 浏览器的 br/gzip 透传上去，回来的字节就不是 mp4 了，播放器干转圈
    "accept-encoding": "identity",
  });
  for (const name of FORWARD_TO_UPSTREAM) {
    const value = req.headers.get(name);
    if (value) upstreamHeaders.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await upstreamFetch(target.url, {
      headers: upstreamHeaders,
      redirect: "follow",
      cache: "no-store",
      signal: req.signal, // 浏览器切走了就别继续拉源站
    });
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return Response.json(
      { error: `上游请求失败: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  if (!upstream.ok && upstream.status !== 206) {
    return Response.json(
      { error: `上游返回 ${upstream.status}`, url: target.url },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const contentType = upstream.headers.get("content-type");

  if (isManifest(upstream.url || target.url, contentType)) {
    const body = await upstream.text();
    return new Response(rewriteManifest(body, upstream.url || target.url, target.headers), {
      status: 200,
      headers: {
        "content-type": "application/vnd.apple.mpegurl",
        // 清单里嵌的是短时效签名地址，缓存它等于缓存一颗定时炸弹
        "cache-control": "no-store",
      },
    });
  }

  const headers = new Headers();
  for (const name of FORWARD_TO_CLIENT) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", "private, max-age=300");
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");

  return new Response(upstream.body, { status: upstream.status, headers });
}
