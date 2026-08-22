import { Flame, Star } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Media } from "@/lib/db/schema";
import { cn, formatDuration } from "@/lib/utils";

export function MediaCard({ item }: { item: Media }) {
  const chips = (item.coreTags?.length ? item.coreTags : item.tags).slice(0, 3);

  return (
    <Link
      href={`/watch/${encodeURIComponent(item.id)}`}
      className="group focus-visible:ring-ring/60 block rounded-2xl outline-none focus-visible:ring-2"
    >
      <article className="bg-card group-active:border-primary/50 overflow-hidden rounded-2xl border transition-colors">
        <div className="relative aspect-video overflow-hidden bg-[oklch(0.235_0.013_60)]">
          {item.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="text-primary flex h-full w-full items-center justify-center px-2 text-center text-[13px] leading-tight font-semibold">
              {item.title}
            </span>
          )}

          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {formatDuration(item.durationSec)}
          </span>
          {item.favorite ? (
            <Star className="fill-primary text-primary absolute top-2 right-2 size-4" />
          ) : null}
          {item.watchedAt ? (
            <span className="bg-primary/70 absolute inset-x-0 bottom-0 h-0.5" />
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 p-2.5">
          <h3 className="line-clamp-2 text-[13px] leading-snug font-medium">{item.title}</h3>
          <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
            <span
              className={cn("inline-flex items-center gap-1", item.watchability >= 70 && "text-primary")}
            >
              <Flame className="size-3" strokeWidth={2} />
              {item.watchability}
            </span>
            <span className="truncate">{item.channelId}</span>
          </div>
          {chips.length ? (
            <div className="flex flex-wrap gap-1">
              {chips.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
