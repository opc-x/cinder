import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pager({
  page,
  pages,
  hrefFor,
}: {
  page: number;
  pages: number;
  hrefFor: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <Link
        href={hrefFor(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className="border-border flex h-11 items-center gap-1 rounded-xl border px-3 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40"
      >
        <ChevronLeft className="size-4" />
        上页
      </Link>
      <span className="text-muted-foreground font-mono text-[12px]">
        {page} / {pages}
      </span>
      <Link
        href={hrefFor(Math.min(pages, page + 1))}
        aria-disabled={page >= pages}
        className="border-border flex h-11 items-center gap-1 rounded-xl border px-3 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-40"
      >
        下页
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}
