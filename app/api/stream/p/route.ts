import type { NextRequest } from "next/server";
import { proxyStream, unpackTarget } from "@/lib/stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 清单改写后的目的地：分片、子清单、密钥、init segment 全走这里。
 * 上游地址来自签名参数，不是客户端随便给的 —— 否则这就是个开放代理。
 */
export async function GET(req: NextRequest) {
  let target;
  try {
    target = unpackTarget(req.nextUrl.searchParams);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  return proxyStream(req, target);
}
