import { execSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { PassThrough, Readable } from "node:stream";
import { HttpsProxyAgent } from "https-proxy-agent";

/**
 * Node 不走操作系统「系统代理」。有翻墙的人浏览器能出站，服务端抓取还是直连。
 * 这里只读系统/环境里已经开着的 HTTP 代理，不写死任何客户端、不写死端口。
 * 没开代理就直连 —— 出不去就是出不去。
 */
function detectProxy(): string | undefined {
  const fromEnv = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (fromEnv) return fromEnv;
  if (process.platform !== "darwin") return undefined;
  try {
    const out = execSync("scutil --proxy", { encoding: "utf8", timeout: 2000 });
    const grab = (enable: string, hostKey: string, portKey: string) => {
      if (!new RegExp(`${enable}\\s*:\\s*1`).test(out)) return undefined;
      const host = out.match(new RegExp(`${hostKey}\\s*:\\s*(\\S+)`))?.[1];
      const port = out.match(new RegExp(`${portKey}\\s*:\\s*(\\d+)`))?.[1];
      return host && port ? `http://${host}:${port}` : undefined;
    };
    return grab("HTTPSEnable", "HTTPSProxy", "HTTPSPort") ?? grab("HTTPEnable", "HTTPProxy", "HTTPPort");
  } catch {
    return undefined;
  }
}

const proxyUrl = detectProxy();
const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl, { keepAlive: true, keepAliveMsecs: 30_000 }) : undefined;

export async function upstreamFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!agent) return fetch(url, init);
  return proxied(url, init ?? {}, agent, 0);
}

function proxied(
  url: string,
  init: RequestInit,
  proxy: HttpsProxyAgent<string>,
  hops: number,
): Promise<Response> {
  if (hops > 8) return Promise.reject(new Error(`重定向过多: ${url}`));

  const u = new URL(url);
  const lib = u.protocol === "http:" ? http : https;
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => {
    headers[k] = v;
  });

  return new Promise((resolve, reject) => {
    const req = lib.request(
      u,
      {
        method: (init.method ?? "GET").toUpperCase(),
        headers,
        agent: proxy,
        timeout: 25_000,
        signal: init.signal ?? AbortSignal.timeout(25_000),
      },
      (res) => {
        const status = res.statusCode ?? 500;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume();
          resolve(proxied(new URL(location, url).toString(), init, proxy, hops + 1));
          return;
        }

        const out = new Headers();
        out.set("x-cinder-url", url);
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === "string") out.set(k, v);
          else if (Array.isArray(v)) out.set(k, v.join(", "));
        }

        const passthrough = new PassThrough({ highWaterMark: 1024 * 1024 });
        res.pipe(passthrough);
        passthrough.on("error", () => res.destroy());
        res.on("error", () => passthrough.destroy());

        resolve(
          new Response(Readable.toWeb(passthrough) as ReadableStream, {
            status,
            headers: out,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}
