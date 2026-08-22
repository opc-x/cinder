import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getChannelAdapter, type Playback } from "@/lib/adapters";
import { db, ready } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { proxyStream } from "@/lib/stream";

// 播放链路必须实时：常驻 Node 进程。签名 URL 不落库，只在内存里扛几分钟，
// 否则 <video> 每次 Range 都把详情页重扒一遍，代理被自己堵死，封面转圈。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESOLVE_TTL_MS = 10 * 60 * 1000;
const resolveCache = new Map<string, { exp: number; playback: Playback }>();

// 常驻进程里这张表只进不出：不过期清理的话，看得越多进程占的内存越大。
function evictExpired(now: number) {
  for (const [key, entry] of resolveCache) {
    if (entry.exp <= now) resolveCache.delete(key);
  }
}

/**
 * 播放入口。`<video src="/api/stream/demo:xxx">` 打到这里。
 * 流程：DB 取 media → adapter 现场解析出签名地址 → 交给代理转发/改写。
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/stream/[id]">) {
  const { id } = await ctx.params;
  await ready();

  const [row] = await db.select().from(media).where(eq(media.id, id));
  if (!row) return Response.json({ error: `没有这条媒体: ${id}` }, { status: 404 });

  const now = Date.now();
  const hit = resolveCache.get(id);
  let playback = hit && hit.exp > now ? hit.playback : null;

  if (!playback) {
    try {
      playback = await (await getChannelAdapter(row.channelId)).resolve(row.externalId);
    } catch (err) {
      return Response.json(
        { error: `解析播放地址失败: ${err instanceof Error ? err.message : String(err)}` },
        { status: 502 },
      );
    }
    resolveCache.set(id, { exp: now + RESOLVE_TTL_MS, playback });
  }

  // 播放器要的是签名地址本身：浏览器走用户自己的系统代理拉 CDN。
  if (req.nextUrl.searchParams.get("resolve") === "1") {
    return Response.json({ url: playback.url, type: playback.type });
  }

  // HLS 仍要改写清单，走字节代理。MP4 302 到 CDN，不经 Next 倒流。
  if (playback.type === "mp4" || row.streamType === "mp4") {
    return new Response(null, {
      status: 302,
      headers: {
        Location: playback.url,
        "referrer-policy": "no-referrer",
        "cache-control": "no-store",
      },
    });
  }

  return proxyStream(req, { url: playback.url, headers: playback.headers });
}
