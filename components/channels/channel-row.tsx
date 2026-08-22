"use client";

import { AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteChannelAction, toggleChannelAction, triggerIngest } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import type { Channel } from "@/lib/db/schema";
import { cn, formatDate } from "@/lib/utils";

export function ChannelRow({ channel, count }: { channel: Channel; count: number }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const state = channel.lastError ? "err" : channel.lastRunAt ? "ok" : "idle";

  function retry() {
    startTransition(async () => {
      const [r] = await triggerIngest(channel.id);
      setNote(r?.error ? r.error : `新增 ${r?.added ?? 0} · 更新 ${r?.updated ?? 0}`);
    });
  }

  return (
    <div
      className={cn(
        "bg-card border-border rounded-2xl border p-3.5",
        (!channel.enabled || pending) && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-[7px] shrink-0 rounded-full",
                state === "ok" && "bg-primary",
                state === "err" && "bg-destructive",
                state === "idle" && "bg-muted-foreground",
              )}
            />
            <span className="truncate text-[15px] font-semibold">{channel.name}</span>
          </div>
          <p className="text-muted-foreground truncate font-mono text-xs">
            {channel.rootUrl.replace(/^https?:\/\//, "")}
          </p>
        </div>

        <button
          role="switch"
          aria-checked={channel.enabled}
          aria-label={channel.enabled ? "停用" : "启用"}
          disabled={pending}
          onClick={() => startTransition(() => toggleChannelAction(channel.id, !channel.enabled))}
          className={cn(
            "relative h-[26px] w-11 shrink-0 rounded-full transition-colors",
            channel.enabled ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "absolute top-[3px] size-5 rounded-full bg-white transition-all",
              channel.enabled ? "left-[22px]" : "left-[3px]",
            )}
          />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{count} 条</Badge>
        <Badge variant="outline">
          {channel.lastRunAt ? `上次 ${formatDate(channel.lastRunAt)}` : "还没抓过"}
        </Badge>
        <Badge variant={channel.kind === "builtin" ? "outline" : "default"}>
          {channel.kind === "builtin" ? "内置 adapter" : `探测 · ${channel.profile?.strategy}`}
        </Badge>
      </div>

      {channel.lastError ? (
        <p className="text-destructive mt-2.5 flex items-start gap-1.5 text-xs leading-relaxed">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {channel.lastError}
        </p>
      ) : null}

      {note ? <p className="text-muted-foreground mt-2.5 text-xs">{note}</p> : null}

      <div className="border-border mt-3 flex items-center gap-4 border-t pt-2.5">
        <button
          disabled={pending}
          onClick={retry}
          className="text-muted-foreground flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
          重新抓取
        </button>
        {channel.kind === "probed" ? (
          <button
            disabled={pending}
            onClick={() => startTransition(() => deleteChannelAction(channel.id))}
            className="text-muted-foreground active:text-destructive ml-auto flex items-center gap-1.5 text-xs"
          >
            <Trash2 className="size-3.5" />
            移除渠道
          </button>
        ) : null}
      </div>
    </div>
  );
}
