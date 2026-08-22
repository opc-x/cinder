"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveRuleAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import type { Channel } from "@/lib/db/schema";
import type { InferredRule, RulePreview } from "@/lib/rules";
import { cn, formatDuration } from "@/lib/utils";

interface Props {
  said: string;
  inferred: InferredRule;
  preview: RulePreview;
  channels: Channel[];
  defaultChannel: string | null;
}

const ENGINE_LABEL: Record<InferredRule["engine"], string> = {
  cli: "本地 CLI",
  ollama: "本地 ollama",
  heuristic: "内置规则解析（没找到本地模型）",
};

/**
 * 确认屏。这里是模型理解错了唯一能被发现的地方，所以三样必须都在：
 * 你说的原话、它翻成的人话、拿真实库跑出来的命中结果。
 */
export function RuleConfirm({ said, inferred, preview, channels, defaultChannel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showConditions, setShowConditions] = useState(false);
  const [scoped, setScoped] = useState<string | null>(defaultChannel);
  const [error, setError] = useState<string | null>(null);

  function save() {
    startTransition(async () => {
      try {
        await saveRuleAction({
          said,
          summary: inferred.summary,
          definition: inferred.definition,
          score: inferred.score,
          exclude: inferred.exclude,
          channelId: scoped,
        });
        router.push("/rules");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-2.5 pb-[calc(24px+env(safe-area-inset-bottom))]">
      <section className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">你说的</span>
        <div className="bg-card border-border rounded-2xl border p-3.5 text-[15px] leading-relaxed">
          {said}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <span className="text-muted-foreground flex items-center gap-2 text-xs">
          翻译成了这样
          <Badge variant="outline">
            {ENGINE_LABEL[inferred.engine]} · {(inferred.tookMs / 1000).toFixed(1)} 秒
          </Badge>
        </span>
        <div className="bg-card border-border rounded-2xl border p-3.5">
          <p className="text-[15px] leading-relaxed font-medium">{inferred.summary}</p>

          <button
            onClick={() => setShowConditions((v) => !v)}
            className="border-border text-muted-foreground mt-3 flex w-full items-center justify-between border-t pt-2.5 text-xs"
          >
            看它实际写的条件
            <ChevronRight className={cn("size-4 transition-transform", showConditions && "rotate-90")} />
          </button>

          {showConditions ? (
            <pre className="shrink-0 text-muted-foreground mt-2.5 overflow-x-auto rounded-lg bg-black/25 p-3 font-mono text-[11px] leading-relaxed">
              {JSON.stringify(
                {
                  match: inferred.definition.match,
                  conditions: inferred.definition.conditions,
                  score: inferred.score,
                  exclude: inferred.exclude,
                },
                null,
                2,
              )}
            </pre>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">
          拿库里现有的 {preview.total} 条跑了一遍
        </span>
        <div className="border-primary/35 flex flex-col gap-3 rounded-2xl border bg-[oklch(0.3_0.03_45_/_55%)] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {preview.hitCount ? `命中 ${preview.hitCount} 条` : "一条都没命中"}
            </span>
            {preview.scoreShift ? (
              <span className="text-primary font-mono text-xs">
                {preview.scoreShift.from} → {preview.scoreShift.to}
              </span>
            ) : null}
          </div>

          {preview.samples.length ? (
            <div className="shrink-0 -mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
              {preview.samples.map((s) => (
                <div key={s.id} className="w-24 shrink-0">
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-[oklch(0.235_0.013_60)]">
                    {s.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.posterUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-primary flex h-full items-center justify-center px-1 text-center text-[9px] font-semibold">
                        {s.title}
                      </span>
                    )}
                    <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 font-mono text-[9px] text-white">
                      {formatDuration(s.durationSec)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-[10px] leading-tight">
                    {s.title}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {preview.hitCount === 0
              ? "库里没有能对上的条目。可能是话说得太具体，也可能确实还没抓到 —— 规则照样能存，以后抓到就生效。"
              : preview.nearMiss
                ? `没中的比如「${preview.nearMiss.title}」：${preview.nearMiss.reason}。`
                : "库里所有条目都命中了，这条规则可能太宽。"}
          </p>
        </div>
      </section>

      {channels.length > 1 ? (
        <section className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">作用范围</span>
          <div className="flex flex-wrap gap-1.5">
            <ScopeChip label="全部渠道" active={!scoped} onClick={() => setScoped(null)} />
            {channels.map((c) => (
              <ScopeChip
                key={c.id}
                label={c.name}
                active={scoped === c.id}
                onClick={() => setScoped(c.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border px-3.5 py-3 text-[13px]">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2.5">
        <button
          onClick={() => router.push("/rules")}
          className="border-border h-11 flex-1 rounded-xl border text-sm"
        >
          重说一遍
        </button>
      </div>

      <button
        onClick={save}
        disabled={pending}
        className="bg-primary text-primary-foreground h-12 rounded-xl text-[15px] font-medium disabled:opacity-60"
      >
        {pending ? "存进去，重算全库…" : "加上这条规则"}
      </button>
    </div>
  );
}

function ScopeChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}
