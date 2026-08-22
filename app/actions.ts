"use server";

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { probeChannel, sampleChannel, type FieldGuess, type ProbeResult } from "@/lib/channels/probe";
import { db, ready } from "@/lib/db";
import { channels, media, rules, type ChannelProfile, type RuleDefinition } from "@/lib/db/schema";
import { rescoreAll, runIngest } from "@/lib/ingest";
import { inferRule, previewRule, type InferredRule, type RulePreview } from "@/lib/rules";

// --------------------------------------------------------------- 库

export async function toggleFavorite(id: string) {
  await ready();
  await db
    .update(media)
    .set({ favorite: sql`NOT ${media.favorite}` })
    .where(eq(media.id, id));
  revalidatePath("/");
  revalidatePath("/favorites");
  revalidatePath(`/watch/${id}`);
}

export async function markWatched(id: string) {
  await ready();
  await db.update(media).set({ watchedAt: new Date() }).where(eq(media.id, id));
  revalidatePath("/");
}

export async function triggerIngest(channelId?: string) {
  const results = await runIngest({ channelId });
  revalidatePath("/");
  revalidatePath("/channels");
  return results;
}

// --------------------------------------------------------------- 渠道接入

export interface ProbeOutcome {
  probe: ProbeResult;
  fields: FieldGuess[];
  sampleUrls: string[];
  looksClientRendered: boolean;
  error?: string;
}

/** 第一步：给个首页地址，探测能不能扫、字段猜成什么样。 */
export async function probeChannelAction(rootUrl: string): Promise<ProbeOutcome> {
  const probe = await probeChannel(rootUrl);

  if (!probe.best) {
    return {
      probe,
      fields: [],
      sampleUrls: [],
      looksClientRendered: false,
      error: "sitemap、RSS、列表页三条路都没走通，这个站得写 adapter",
    };
  }

  const sample = await sampleChannel(probe.best.urls, probe.rootUrl);
  return {
    probe,
    fields: sample.fields,
    sampleUrls: sample.sampleUrls,
    looksClientRendered: sample.looksClientRendered,
    error: sample.looksClientRendered
      ? "三个样本一个标题都没抓到，这站多半是 JS 渲染的，得上 playwright"
      : undefined,
  };
}

/** 第二步：你确认完字段，落库并抓一批回来。 */
export async function createChannelAction(input: {
  name: string;
  rootUrl: string;
  strategy: ChannelProfile["strategy"];
  listUrl: string;
  selectors: ChannelProfile["selectors"];
  detailPattern?: string;
  limit?: number;
}) {
  await ready();
  const id = slugify(input.rootUrl);

  await db
    .insert(channels)
    .values({
      id,
      name: input.name,
      rootUrl: input.rootUrl,
      kind: "probed",
      profile: {
        strategy: input.strategy,
        listUrl: input.listUrl,
        detailPattern: input.detailPattern,
        selectors: input.selectors,
      },
      enabled: true,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: channels.id,
      set: {
        name: input.name,
        rootUrl: input.rootUrl,
        profile: {
          strategy: input.strategy,
          listUrl: input.listUrl,
          detailPattern: input.detailPattern,
          selectors: input.selectors,
        },
        lastError: null,
      },
    });

  const [result] = await runIngest({ channelId: id, limit: input.limit ?? 50 });
  revalidatePath("/");
  revalidatePath("/channels");
  return { id, result };
}

export async function deleteChannelAction(id: string) {
  await ready();
  await db.delete(channels).where(eq(channels.id, id));
  revalidatePath("/");
  revalidatePath("/channels");
}

export async function toggleChannelAction(id: string, enabled: boolean) {
  await ready();
  await db.update(channels).set({ enabled }).where(eq(channels.id, id));
  revalidatePath("/channels");
}

// --------------------------------------------------------------- 规则

export interface InferOutcome {
  inferred: InferredRule;
  preview: RulePreview;
}

/** 你打一句话 → 模型翻成规则 → 立刻拿现有库跑一遍，两样一起返回。 */
export async function inferRuleAction(said: string, channelId?: string): Promise<InferOutcome> {
  await ready();
  const inferred = await inferRule(said);
  const preview = await previewRule(
    inferred.definition,
    inferred.score,
    inferred.exclude,
    channelId ?? null,
  );
  return { inferred, preview };
}

export async function saveRuleAction(input: {
  said: string;
  summary: string;
  definition: RuleDefinition;
  score: number;
  exclude: boolean;
  channelId?: string | null;
  origin?: "ai" | "manual";
}) {
  await ready();
  const id = randomUUID().slice(0, 8);
  await db.insert(rules).values({
    id,
    said: input.said,
    summary: input.summary,
    definition: input.definition,
    score: input.score,
    exclude: input.exclude,
    channelId: input.channelId ?? null,
    enabled: true,
    origin: input.origin ?? "ai",
    createdAt: new Date(),
  });

  // 规则一落库立刻重算全库的分，不用等下一轮抓取
  const rescored = await rescoreAll();
  revalidatePath("/");
  revalidatePath("/rules");
  return { id, rescored };
}

export async function toggleRuleAction(id: string, enabled: boolean) {
  await ready();
  await db.update(rules).set({ enabled }).where(eq(rules.id, id));
  await rescoreAll();
  revalidatePath("/");
  revalidatePath("/rules");
}

export async function deleteRuleAction(id: string) {
  await ready();
  await db.delete(rules).where(eq(rules.id, id));
  await rescoreAll();
  revalidatePath("/");
  revalidatePath("/rules");
}

function slugify(rootUrl: string): string {
  try {
    return new URL(rootUrl).hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");
  } catch {
    return rootUrl.replace(/[^a-z0-9]+/gi, "-").slice(0, 32);
  }
}
