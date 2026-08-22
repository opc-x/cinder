"use client";

import { Star } from "lucide-react";
import { useTransition } from "react";
import { toggleFavorite } from "@/app/actions";
import { cn } from "@/lib/utils";

export function FavoriteButton({ id, favorite }: { id: string; favorite: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => toggleFavorite(id))}
      className={cn(
        "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors disabled:opacity-50",
        favorite
          ? "bg-primary text-primary-foreground border-transparent"
          : "border-border text-foreground",
      )}
    >
      <Star className={cn("size-[17px]", favorite && "fill-current")} />
      {favorite ? "已收藏" : "收藏"}
    </button>
  );
}
