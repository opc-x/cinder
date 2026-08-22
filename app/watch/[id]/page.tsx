import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/favorite-button";
import { Player } from "@/components/player/player";
import { Badge } from "@/components/ui/badge";
import { ensureTaste } from "@/lib/ensure-taste";
import { isAdCopy } from "@/lib/taste";
import { getChannel, getMedia, getRule } from "@/lib/queries";
import { formatDate, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WatchPage({ params }: PageProps<"/watch/[id]">) {
  const { id } = await params;
  const raw = await getMedia(decodeURIComponent(id));
  if (!raw) notFound();
  const item = await ensureTaste(raw);

  const matched = (
    await Promise.all(item.matchedRules.map((rid) => getRule(rid)))
  ).filter((r) => r !== null);

  const channel = await getChannel(item.channelId);
  const cannotPlay = channel?.kind === "probed" && !channel.profile?.selectors.stream;
  const portrait = item.portrait;
  const comments = item.comments ?? [];
  const desc = isAdCopy(item.description) ? null : item.description;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 px-4 pt-[calc(12px+env(safe-area-inset-top))]">
        <Link
          href="/"
          className="text-muted-foreground -ml-1 flex h-11 w-fit items-center gap-1.5 pr-3 text-sm"
        >
          <ArrowLeft className="size-5" strokeWidth={1.9} />
          库
        </Link>
      </div>

      {cannotPlay ? (
        <div className="mx-4 mb-1 rounded-2xl border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-[13px] leading-relaxed text-destructive">
          接入这个渠道时没探测到播放清单地址，<b>这条播不了</b>。元数据是好的 ——
          要能播得给它写一个 adapter。
        </div>
      ) : null}

      <Player id={item.id} title={item.title} poster={item.posterUrl} streamType={item.streamType} />

      <div className="flex flex-col gap-4 p-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg leading-snug font-semibold tracking-tight">{item.title}</h1>
          <p className="text-muted-foreground text-xs">
            {item.channelId} · {formatDuration(item.durationSec)} ·{" "}
            {formatDate(item.publishedAt) || "日期未知"} · 观赏 {item.watchability}
          </p>
        </div>

        {portrait ? (
          <section className="bg-card border-border rounded-2xl border px-3.5 py-3">
            <p className="text-[11px] font-medium tracking-wide text-primary">这片适不适合你</p>
            <p className="mt-1.5 text-[14px] leading-relaxed">{portrait.blurb}</p>
            {portrait.traits.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {portrait.traits.map((t) => (
                  <Badge key={t} variant="default">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="flex items-center gap-2.5">
          <FavoriteButton id={item.id} favorite={item.favorite} />
          {item.sourceUrl ? (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="border-border text-muted-foreground flex h-11 items-center gap-1.5 rounded-xl border px-4 text-sm"
            >
              源站 <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>

        {portrait?.summary ? (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-sm font-semibold">内容摘要</h2>
            <p className="text-muted-foreground text-[13px] leading-relaxed">{portrait.summary}</p>
          </section>
        ) : null}

        {portrait?.highlights?.length ? (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-sm font-semibold">看点总结</h2>
            <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4 text-[13px] leading-relaxed">
              {portrait.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {desc ? (
          <p className="text-muted-foreground text-[13px] leading-relaxed whitespace-pre-wrap">{desc}</p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {(item.coreTags?.length ? item.coreTags : []).map((tag) => (
            <Link key={tag} href={`/?tag=${encodeURIComponent(tag)}`}>
              <Badge variant="outline">{tag}</Badge>
            </Link>
          ))}
          {matched.map((rule) => (
            <Link key={rule.id} href="/rules">
              <Badge variant="secondary">「{rule.said}」</Badge>
            </Link>
          ))}
        </div>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-semibold">源站留言 {comments.length ? `· ${comments.length}` : ""}</h2>
          {comments.length ? (
            comments.filter((c) => !isAdCopy(c.body)).length ? (
              comments
                .filter((c) => !isAdCopy(c.body))
                .map((c, i) => (
                  <article key={`${c.author}-${i}`} className="bg-card border-border rounded-2xl border px-3.5 py-3">
                    <p className="text-muted-foreground text-[11px]">
                      {c.author}
                      {c.when ? ` · ${c.when}` : ""}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap">{c.body}</p>
                  </article>
                ))
            ) : (
              <p className="text-muted-foreground text-[13px]">留言全是广告，已藏掉。</p>
            )
          ) : (
            <p className="text-muted-foreground text-[13px]">这条下面没有有效留言。</p>
          )}
        </section>
      </div>
    </div>
  );
}
