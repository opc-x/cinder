import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { runIngest } from "@/lib/ingest";

export const runtime = "nodejs";

/** 手动触发抓取。定时任务走 instrumentation.ts 里的 node-cron，调的是同一个函数。 */
export async function POST(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channel") ?? undefined;
  const limitParam = req.nextUrl.searchParams.get("limit");
  const results = await runIngest({
    channelId,
    limit: limitParam ? Number(limitParam) : undefined,
  });
  revalidatePath("/");
  const failed = results.filter((r) => r.error);
  return Response.json({ results }, { status: failed.length ? 207 : 200 });
}
