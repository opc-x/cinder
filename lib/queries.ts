import { and, asc, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { db, ready } from "@/lib/db";
import { channels, media, rules } from "@/lib/db/schema";
import { JUNK_CORE, STRUCTURAL_TAGS } from "@/lib/features";

export type SortKey = "watchability" | "score" | "recent" | "duration" | "title";

export const PAGE_SIZE = 24;

export interface BrowseFilters {
  q?: string;
  tag?: string;
  channel?: string;
  favorite?: boolean;
  sort?: SortKey;
  page?: number;
}

const ORDER: Record<SortKey, SQL> = {
  watchability: sql`${media.watchability} DESC, ${media.lastSeenAt} DESC`,
  score: sql`${media.score} DESC, ${media.lastSeenAt} DESC`,
  recent: sql`COALESCE(${media.publishedAt}, ${media.firstSeenAt}) DESC`,
  duration: sql`${media.durationSec} DESC`,
  title: sql`${media.title} ASC`,
};

function scopeWhere(filters: BrowseFilters): SQL[] {
  const where: SQL[] = [eq(media.excluded, false)];
  if (filters.q) {
    const needle = `%${filters.q}%`;
    where.push(or(like(media.title, needle), like(media.description, needle))!);
  }
  if (filters.tag) {
    where.push(
      sql`(
        EXISTS (SELECT 1 FROM json_each(${media.coreTags}) WHERE json_each.value = ${filters.tag})
        OR EXISTS (SELECT 1 FROM json_each(${media.tags}) WHERE json_each.value = ${filters.tag})
      )`,
    );
  }
  if (filters.channel) where.push(eq(media.channelId, filters.channel));
  if (filters.favorite) where.push(eq(media.favorite, true));
  return where;
}

export async function browseMedia(filters: BrowseFilters = {}) {
  await ready();
  const page = Math.max(1, filters.page ?? 1);
  const where = and(...scopeWhere(filters));
  const [[countRow], items] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(media).where(where),
    db
      .select()
      .from(media)
      .where(where)
      .orderBy(ORDER[filters.sort ?? "watchability"])
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const total = Number(countRow?.n ?? 0);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getMedia(id: string) {
  await ready();
  const [row] = await db.select().from(media).where(eq(media.id, id));
  return row ?? null;
}

export async function listChannels() {
  await ready();
  return db.select().from(channels).orderBy(desc(channels.enabled), asc(channels.name));
}

export async function getChannel(id: string) {
  await ready();
  const [row] = await db.select().from(channels).where(eq(channels.id, id));
  return row ?? null;
}

export async function channelCounts(): Promise<Record<string, number>> {
  await ready();
  const rows = await db.all<{ channel_id: string; n: number }>(sql`
    SELECT channel_id, COUNT(*) AS n FROM media WHERE excluded = 0 GROUP BY channel_id
  `);
  return Object.fromEntries(rows.map((r) => [r.channel_id, r.n]));
}

export async function listRules() {
  await ready();
  return db.select().from(rules).orderBy(desc(rules.createdAt));
}

export async function getRule(id: string) {
  await ready();
  const [row] = await db.select().from(rules).where(eq(rules.id, id));
  return row ?? null;
}

export async function listTags(channel?: string): Promise<{ tag: string; count: number }[]> {
  await ready();
  const scope = channel ? sql` AND media.channel_id = ${channel}` : sql``;
  const rows = await db.all<{ tag: string; count: number }>(sql`
    SELECT json_each.value AS tag, COUNT(*) AS count
    FROM media, json_each(media.core_tags)
    WHERE media.excluded = 0${scope}
      AND json_each.value IS NOT NULL
      AND json_each.value != ''
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `);
  return rows.filter((r) => !STRUCTURAL_TAGS.has(r.tag) && !JUNK_CORE.has(r.tag));
}

export async function libraryStats(channel?: string) {
  await ready();
  const scope = channel ? sql` AND channel_id = ${channel}` : sql``;
  const [row] = await db.all<{ total: number; favorites: number; watched: number }>(sql`
    SELECT COUNT(*) AS total,
           SUM(favorite) AS favorites,
           SUM(CASE WHEN watched_at IS NOT NULL THEN 1 ELSE 0 END) AS watched
    FROM media WHERE excluded = 0${scope}
  `);
  return {
    total: row?.total ?? 0,
    favorites: row?.favorites ?? 0,
    watched: row?.watched ?? 0,
  };
}
