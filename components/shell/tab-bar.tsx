"use client";

import { LayoutGrid, SlidersHorizontal, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "库", icon: LayoutGrid },
  { href: "/favorites", label: "收藏", icon: Star },
  { href: "/rules", label: "规则", icon: SlidersHorizontal },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="border-border bg-card/80 shrink-0 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="flex">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("size-[22px]", label === "收藏" && active && "fill-current")} strokeWidth={1.75} />
              <span className={cn("text-[11px]", active && "font-medium")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
