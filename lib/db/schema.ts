import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Portrait, SourceComment } from "@/lib/adapters/types";

/**
 * 渠道 = 一个内容来源。业务语义上它是全局作用域：切渠道只换数据源，
 * 规则和界面都不变（跟切语言一个意思）。
 *
 * kind = "builtin" 走 lib/adapters 里写死的 adapter；
 * kind = "probed"  走探测出来的 profile，不需要写代码。
 */
export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rootUrl: text("root_url").notNull(),
  kind: text("kind", { enum: ["builtin", "probed"] })
    .notNull()
    .default("probed"),
  /** kind=builtin 时指向 lib/adapters 注册表里的键 */
  adapter: text("adapter"),
  /** kind=probed 时的抓取配置：列表策略 + 字段选择器 */
  profile: text("profile", { mode: "json" }).$type<ChannelProfile | null>(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/** 探测产出的抓取配置。整份东西是可读的 JSON，出问题能直接看出哪一条选择器错了。 */
export interface ChannelProfile {
  /** 从哪儿拿页面清单 */
  strategy: "sitemap" | "feed" | "pager";
  /** sitemap.xml / feed 地址，或列表页地址模板（含 {page}） */
  listUrl: string;
  /** pager 策略下的页数上限 */
  maxPages?: number;
  /** 只有匹配这个正则的 URL 才当成详情页 */
  detailPattern?: string;
  selectors: {
    title?: FieldSelector;
    poster?: FieldSelector;
    duration?: FieldSelector;
    published?: FieldSelector;
    tags?: FieldSelector;
    /** 播放清单地址在详情页 HTML 里的抽取方式 */
    stream?: FieldSelector;
  };
}

export interface FieldSelector {
  /** meta 标签取 content，css 取文本，regex 直接在整页 HTML 上抓第一个捕获组 */
  kind: "meta" | "css" | "attr" | "regex" | "jsonld";
  /** meta 的 property/name、css 选择器、或正则字面量 */
  query: string;
  /** kind=attr 时取哪个属性 */
  attr?: string;
  /** 探测时几个样本命中了，用来在 UI 上标「不确定」 */
  confidence?: { hit: number; total: number };
}

/**
 * 媒体元数据。**不存播放地址** —— 签名 URL 几分钟就过期，播放时现场解析。
 */
export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(), // `${channelId}:${externalId}`
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    posterUrl: text("poster_url"),
    sourceUrl: text("source_url"),
    durationSec: integer("duration_sec"),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    coreTags: text("core_tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    comments: text("comments", { mode: "json" }).$type<SourceComment[]>().notNull().default(sql`'[]'`),
    portrait: text("portrait", { mode: "json" }).$type<Portrait | null>(),
    streamType: text("stream_type", { enum: ["hls", "mp4"] }).notNull().default("hls"),

    score: integer("score").notNull().default(0),
    watchability: integer("watchability").notNull().default(0),
    excluded: integer("excluded", { mode: "boolean" }).notNull().default(false),
    matchedRules: text("matched_rules", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),

    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    watchedAt: integer("watched_at", { mode: "timestamp" }),

    firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("media_channel_idx").on(t.channelId),
    index("media_score_idx").on(t.score),
    index("media_watchability_idx").on(t.watchability),
    index("media_last_seen_idx").on(t.lastSeenAt),
  ],
);

/**
 * 规则。**身份是你说的那句话**（said），不是一个 id。
 * definition 是模型翻出来的条件，平时折叠着不给你看。
 */
export const rules = sqliteTable("rules", {
  id: text("id").primaryKey(),
  /** 你打的原话 */
  said: text("said").notNull(),
  /** 模型翻成的一句人话，列表里显示这个 */
  summary: text("summary").notNull(),
  definition: text("definition", { mode: "json" }).$type<RuleDefinition>().notNull(),
  score: integer("score").notNull().default(0),
  exclude: integer("exclude", { mode: "boolean" }).notNull().default(false),
  /** null = 全渠道生效 */
  channelId: text("channel_id"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** ai = 模型推的，manual = 手改过的，file = 从 rules/*.md 导进来的 */
  origin: text("origin", { enum: ["ai", "manual", "file"] }).notNull().default("ai"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export interface RuleDefinition {
  match: "all" | "any";
  conditions: RuleCondition[];
}

export interface RuleCondition {
  field: "title" | "description" | "tags" | "durationSec" | "channel";
  op: "regex" | "contains" | "eq" | "gt" | "lt";
  value: string | number;
}

/** 每次抓取的结果，用来在 UI 上看清楚哪个渠道挂了。 */
export const ingestRuns = sqliteTable("ingest_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelId: text("channel_id").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  added: integer("added").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  error: text("error"),
});

export type Media = typeof media.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type IngestRun = typeof ingestRuns.$inferSelect;
