import { and, eq, lt } from "drizzle-orm";
import { getChannelAdapter, isPagingAdapter } from "@/lib/adapters";
import { db, ready } from "@/lib/db";
import { channels, ingestRuns, media } from "@/lib/db/schema";
import { extractFeatures } from "@/lib/features";
import { buildTaste } from "@/lib/taste";
import { evaluate, loadRules } from "@/lib/rules";
import type { EvaluableRule } from "@/lib/rules";
import type { RawMedia } from "@/lib/adapters/types";

export interface IngestResult {
  channelId: string;
  added: number;
  updated: number;
  /** 被 exclude 规则挡掉的 */
  skipped: number;
  /** 渠道已下架、这轮清理掉的 */
  removed: number;
  error?: string;
}

/**
 * 元数据链路：adapter 抓 → 规则打分 → upsert。
 * 这条链路可以慢、可以离线批跑，跟播放链路完全隔离，绝不在这里解析播放地址。
 */
export async function runIngest(opts?: { channelId?: string; limit?: number; prune?: boolean }) {
  await ready();
  const rules = await loadRules();
  const enabled = await db.select().from(channels).where(eq(channels.enabled, true));
  const targets = enabled.filter((c) => !opts?.channelId || c.id === opts.channelId);

  const results: IngestResult[] = [];
  for (const channel of targets) {
    results.push(await ingestOne(channel.id, rules, opts));
  }
  return results;
}

async function ingestOne(
  channelId: string,
  rules: EvaluableRule[],
  opts?: { limit?: number; prune?: boolean },
): Promise<IngestResult> {
  const startedAt = new Date();
  const [run] = await db.insert(ingestRuns).values({ channelId, startedAt }).returning();
  const limit = opts?.limit;

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let removed: { id: string }[] = [];

  try {
    const adapter = await getChannelAdapter(channelId);
    const skipIds = new Set(
      (
        await db
          .select({ externalId: media.externalId })
          .from(media)
          .where(eq(media.channelId, channelId))
      ).map((r) => r.externalId),
    );

    const batches: AsyncIterable<RawMedia[]> = isPagingAdapter(adapter)
      ? adapter.iterate({ limit, skipIds })
      : (async function* () {
          yield await adapter.list({ limit });
        })();

    for await (const items of batches) {
      for (const item of items) {
      const verdict = evaluate(
        {
          title: item.title,
          description: item.description,
          tags: item.tags,
          durationSec: item.durationSec,
          channelId,
        },
        rules,
      );

      const id = `${channelId}:${item.externalId}`;
      if (verdict.excluded) {
        // 硬过滤：不进库，且把之前进过库的清掉
        await db.delete(media).where(eq(media.id, id));
        skipped++;
        continue;
      }

      const now = new Date();
      const pack = extractFeatures(item);
      const taste = buildTaste({ ...item, coreTags: pack.coreTags });
      const row = {
        id,
        channelId,
        externalId: item.externalId,
        title: item.title,
        description: item.description ?? null,
        posterUrl: item.posterUrl ?? null,
        sourceUrl: item.sourceUrl ?? null,
        durationSec: item.durationSec ?? null,
        publishedAt: item.publishedAt ?? null,
        tags: item.tags ?? [],
        coreTags: [...pack.coreTags],
        comments: item.comments ?? [],
        portrait: taste,
        streamType: item.streamType ?? ("hls" as const),
        score: verdict.score,
        watchability: pack.watchability,
        excluded: false,
        matchedRules: verdict.matched,
        firstSeenAt: now,
        lastSeenAt: now,
      };

      const existing = await db.select({ id: media.id }).from(media).where(eq(media.id, id));
      await db
        .insert(media)
        .values(row)
        .onConflictDoUpdate({
          target: media.id,
          // 不覆盖 firstSeenAt / favorite / watchedAt —— 那是本地状态，不是抓来的
          set: {
            title: row.title,
            description: row.description,
            posterUrl: row.posterUrl,
            sourceUrl: row.sourceUrl,
            durationSec: row.durationSec,
            publishedAt: row.publishedAt,
            tags: row.tags,
            coreTags: row.coreTags,
            comments: row.comments,
            portrait: row.portrait,
            streamType: row.streamType,
            score: row.score,
            watchability: row.watchability,
            excluded: false,
            matchedRules: row.matchedRules,
            lastSeenAt: row.lastSeenAt,
          },
        });
      if (existing.length) updated++;
      else added++;
      }
      console.log(`[ingest] ${channelId} 本轮累计 +${added} ~${updated} 跳过规则 ${skipped}`);
    }

    // 默认不按「本轮没扫到」删库：分页渠道限量抓会把没扫到的页当已下架。
    if (opts?.prune) {
      removed = await db
        .delete(media)
        .where(
          and(eq(media.channelId, channelId), eq(media.favorite, false), lt(media.lastSeenAt, startedAt)),
        )
        .returning({ id: media.id });
    }

    await db
      .update(channels)
      .set({ lastRunAt: new Date(), lastError: null })
      .where(eq(channels.id, channelId));
    await db
      .update(ingestRuns)
      .set({ finishedAt: new Date(), added, updated })
      .where(eq(ingestRuns.id, run.id));

    return { channelId, added, updated, skipped, removed: removed.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(channels).set({ lastError: message }).where(eq(channels.id, channelId));
    await db
      .update(ingestRuns)
      .set({ finishedAt: new Date(), error: message })
      .where(eq(ingestRuns.id, run.id));
    return { channelId, added, updated, skipped, removed: removed.length, error: message };
  }
}

/**
 * 规则改了以后重算全库的分，不重新抓。
 * 这是「保存并重算」按钮走的路 —— 几百条本地行，毫秒级，不用等抓取。
 */
export async function rescoreAll() {
  await ready();
  const rules = await loadRules();
  const rows = await db.select().from(media);

  let changed = 0;
  let dropped = 0;
  for (const row of rows) {
    const verdict = evaluate(
      {
        title: row.title,
        description: row.description,
        tags: row.tags,
        durationSec: row.durationSec,
        channelId: row.channelId,
      },
      rules,
    );

    if (verdict.excluded && !row.favorite) {
      await db.delete(media).where(eq(media.id, row.id));
      dropped++;
      continue;
    }
    if (verdict.score !== row.score) changed++;
    await db
      .update(media)
      .set({ score: verdict.score, matchedRules: verdict.matched, excluded: false })
      .where(eq(media.id, row.id));
  }
  return { total: rows.length, changed, dropped };
}
