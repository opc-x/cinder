import Link from "next/link";
import { FilterBar } from "@/components/filter-bar";
import { MediaCard } from "@/components/media-card";
import { Pager } from "@/components/pager";
import { AppHeader } from "@/components/shell/app-header";
import { TabBar } from "@/components/shell/tab-bar";
import { currentChannel } from "@/lib/channel-scope";
import { browseMedia, channelCounts, libraryStats, listChannels } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function FavoritesPage({ searchParams }: PageProps<"/favorites">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const channel = await currentChannel();
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);

  const [{ items, total, pages }, channels, counts, stats] = await Promise.all([
    browseMedia({
      q: one(sp.q),
      channel,
      favorite: true,
      sort: "watchability",
      page,
    }),
    listChannels(),
    channelCounts(),
    libraryStats(channel),
  ]);

  return (
    <>
      <AppHeader
        title="收藏"
        sub={`${stats.favorites} 条收藏`}
        channels={channels}
        counts={counts}
        current={channel}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-3.5 pb-4">
        <FilterBar />

        {items.length ? (
          <>
            <p className="text-muted-foreground text-[12px]">{total} 条</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <MediaCard key={item.id} item={item} />
              ))}
            </div>
            <Pager
              page={page}
              pages={pages}
              hrefFor={(p) => {
                const params = new URLSearchParams();
                if (one(sp.q)) params.set("q", one(sp.q)!);
                if (p > 1) params.set("page", String(p));
                const qs = params.toString();
                return qs ? `/favorites?${qs}` : "/favorites";
              }}
            />
          </>
        ) : (
          <div className="text-muted-foreground rounded-2xl border border-dashed px-6 py-14 text-center text-[13px] leading-relaxed">
            还没有收藏。
            <br />
            进详情点「收藏」，回来这里找。
            <Link href="/" className="text-primary mt-2 inline-block underline underline-offset-2">
              回库
            </Link>
          </div>
        )}
      </div>

      <TabBar />
    </>
  );
}
