import { sign, verify } from "./sign";

export interface ProxyTarget {
  url: string;
  headers?: Record<string, string>;
}

/**
 * 把「要代理的上游地址 + 该带的请求头」打包进一个签名过的 query 参数。
 * 签名不是为了防外人（这东西只在 Tailnet 内），是为了防止这个 route
 * 变成一个任人使唤的开放代理 —— 只有我们自己改写出来的链接才认。
 */
export function packTarget(target: ProxyTarget): string {
  const p = Buffer.from(JSON.stringify(target), "utf8").toString("base64url");
  return `p=${p}&s=${sign(p)}`;
}

export function unpackTarget(params: URLSearchParams): ProxyTarget {
  const p = params.get("p");
  const s = params.get("s");
  if (!p || !s) throw new Error("缺少代理参数");
  if (!verify(p, s)) throw new Error("代理参数签名不匹配");

  const target = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as ProxyTarget;
  const url = new URL(target.url); // 顺手挡掉 file:// 之类的协议
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`不支持的协议: ${url.protocol}`);
  }
  return target;
}
