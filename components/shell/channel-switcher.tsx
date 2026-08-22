"use client";

import { Check, Globe, Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { switchChannel } from "@/app/channel-actions";
import type { Channel } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

interface Props {
  channels: Channel[];
  counts: Record<string, number>;
  current?: string;
}

/**
 * 渠道切换器。位置和手感照着「多语言选择」做：右上角一个 chip，
 * 点开是底部弹层，切完整个 app 的作用域就变了，页面结构一点不动。
 */
export function ChannelSwitcher({ channels, counts, current }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const active = channels.find((c) => c.id === current);
  const total = Object.values(counts).reduce((n, v) => n + v, 0);

  function pick(id: string) {
    startTransition(async () => {
      await switchChannel(id);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border-border bg-card flex h-[34px] max-w-[150px] items-center gap-1.5 rounded-full border pr-2.5 pl-3 text-[13px] font-medium"
      >
        <Globe className="text-primary size-3.5 shrink-0" strokeWidth={1.8} />
        <span className="truncate">{active?.name ?? "全部渠道"}</span>
        <svg viewBox="0 0 24 24" className="text-muted-foreground size-3 shrink-0" fill="none">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            aria-label="关闭"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/55"
          />
          <div className="bg-popover border-border relative rounded-t-[22px] border-t px-4 pt-2.5 pb-[calc(30px+env(safe-area-inset-bottom))] shadow-[0_-18px_40px_rgba(0,0,0,.45)]">
            <div className="bg-input mx-auto mb-3.5 h-1 w-9 rounded-full" />
            <div className="text-muted-foreground mb-0.5 text-xs">切换渠道</div>

            <Row
              name="全部渠道"
              meta={`${total} 条 · ${channels.length} 个源`}
              state="ok"
              active={!current}
              disabled={pending}
              onClick={() => pick("")}
            />
            {channels.map((c) => (
              <Row
                key={c.id}
                name={c.name}
                meta={metaFor(c, counts[c.id] ?? 0)}
                state={c.lastError ? "err" : c.lastRunAt ? "ok" : "idle"}
                active={current === c.id}
                disabled={pending}
                onClick={() => pick(c.id)}
              />
            ))}

            <div className="h-1.5" />
            <Link
              href="/channels/new"
              onClick={() => setOpen(false)}
              className="text-muted-foreground flex h-[52px] items-center gap-3"
            >
              <Plus className="size-[19px]" strokeWidth={1.8} />
              <span className="text-foreground flex-1 text-sm">接入新渠道</span>
            </Link>
            <Link
              href="/channels"
              onClick={() => setOpen(false)}
              className="text-muted-foreground flex h-[52px] items-center gap-3"
            >
              <SlidersHorizontal className="size-[19px]" strokeWidth={1.8} />
              <span className="text-foreground flex-1 text-sm">管理渠道</span>
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}

function metaFor(c: Channel, count: number): string {
  if (c.lastError) return "上次抓取失败";
  if (!c.lastRunAt) return "还没抓过";
  return `${count} 条 · 上次 ${new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(c.lastRunAt)}`;
}

function Row({
  name,
  meta,
  state,
  active,
  disabled,
  onClick,
}: {
  name: string;
  meta: string;
  state: "ok" | "err" | "idle";
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="border-border flex h-14 w-full items-center gap-3 border-b text-left disabled:opacity-50"
    >
      <span
        className={cn(
          "size-[7px] shrink-0 rounded-full",
          state === "ok" && "bg-primary",
          state === "err" && "bg-destructive",
          state === "idle" && "bg-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[15px]", active && "font-semibold")}>{name}</span>
        <span className="text-muted-foreground block text-[11px]">{meta}</span>
      </span>
      {active ? <Check className="text-primary size-[18px]" strokeWidth={2.4} /> : null}
    </button>
  );
}
