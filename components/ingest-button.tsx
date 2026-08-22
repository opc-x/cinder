"use client";

import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { triggerIngest } from "@/app/actions";
import { cn } from "@/lib/utils";

export function IngestButton({ channelId }: { channelId?: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function run() {
    startTransition(async () => {
      const results = await triggerIngest(channelId);
      const sum = (key: "added" | "updated" | "removed") =>
        results.reduce((n, r) => n + r[key], 0);
      const failed = results.filter((r) => r.error);
      setNote(
        failed.length
          ? failed[0].error!
          : `新增 ${sum("added")} · 更新 ${sum("updated")} · 清理 ${sum("removed")}`,
      );
      setTimeout(() => setNote(null), 6000);
    });
  }

  return (
    <>
      <button
        onClick={run}
        disabled={pending}
        aria-label="抓取"
        className="text-muted-foreground flex size-[34px] items-center justify-center disabled:opacity-50"
      >
        <RefreshCw className={cn("size-[19px]", pending && "animate-spin")} strokeWidth={1.9} />
      </button>
      {note ? (
        <div className="bg-popover border-border text-foreground fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 rounded-xl border px-4 py-3 text-[13px] shadow-lg">
          {note}
        </div>
      ) : null}
    </>
  );
}
