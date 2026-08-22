import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { MediaCard } from "@/components/media-card";
import { Pager } from "@/components/pager";
import { AppHeader } from "@/components/shell/app-header";
import { TabBar } from "@/components/shell/tab-bar";
import { Badge } from "@/components/ui/badge";
import { currentChannel } from "@/lib/channel-scope";
import {
  browseMedia,
  channelCounts,
  libraryStats,
  listChannels,
  listTags,
  type SortKey,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const channel = await currentChannel();
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);

  const filters = {
    q: one(sp.q),
    tag: one(sp.tag),
    channel,
    favorite: one(sp.favorite) === "1",
    sort: (one(sp.sort) ?? "watchability") as SortKey,
    page,
  };

  const [{ items, total, pages }, channels, counts, tags, stats] = await Promise.all([
    browseMedia(filters),
    listChannels(),
    channelCounts(),
    listTags(channel),
    libraryStats(channel),
  ]);

  const broken = channels.filter((c) => c.lastError && (!channel || c.id === channel));

  return (
    <>
      <AppHeader
        sub={`${stats.total} 条 · 收藏 ${stats.favorites} · ${channels.length} 个渠道`}
        channels={channels}
        counts={counts}
        current={channel}
        showIngest
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-3.5 pb-4">
        <FilterBar />

        {tags.length ? (
          <div className="shrink-0 -mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
            {tags.slice(0, 16).map(({ tag, count }) => (
              <Link key={tag} href={hrefWith(sp, { tag: filters.tag === tag ? null : tag, page: null })}>
                <Badge variant={filters.tag === tag ? "default" : "outline"} className="py-1">
                  {tag} <span className="opacity-60">{count}</span>
                </Badge>
              </Link>
            ))}
          </div>
        ) : null}

        {broken.length ? (
          <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed">
            {broken.map((c) => (
              <p key={c.id}>
                <Link href="/channels" className="font-medium underline underline-offset-2">
                  {c.name}
                </Link>
                ：{c.lastError}
              </p>
            ))}
          </div>
        ) : null}

        {items.length ? (
          <>
            <p className="text-muted-foreground text-[12px]">
              {filters.tag ? `「${filters.tag}」` : "全部"} {total} 条
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <MediaCard key={item.id} item={item} />
              ))}
            </div>
            <Pager page={page} pages={pages} hrefFor={(p) => hrefWith(sp, { page: p <= 1 ? null : String(p) })} />
          </>
        ) : (
          <div className="text-muted-foreground rounded-2xl border border-dashed px-6 py-14 text-center text-[13px] leading-relaxed">
            {channel ? "这个渠道还没抓到东西。" : "库是空的。"}
            <br />
            右上角刷新拉一次，或者{" "}
            <Link href="/channels/new" className="text-primary underline underline-offset-2">
              接入一个渠道
            </Link>
          </div>
        )}
      </div>

      <TabBar />
    </>
  );
}

function hrefWith(
  sp: Record<string, string | string[] | undefined>,
  patch: Record<string, string | null>,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value) params.set(k, value);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v) params.set(k, v);
    else params.delete(k);
  }
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}
