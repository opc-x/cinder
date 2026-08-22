import { createHmac, timingSafeEqual } from "node:crypto";

const secret =
  process.env.CINDER_PROXY_SECRET ??
  // 自用工具，没配也要能跑起来；但线上换成 .env.local 里的长随机串。
  "cinder-dev-secret-change-me";

export function sign(payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 32);
}

export function verify(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
