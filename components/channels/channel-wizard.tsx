"use client";

import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createChannelAction, probeChannelAction, type ProbeOutcome } from "@/app/actions";
import { Input } from "@/components/ui/input";
import type { ChannelProfile } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Step = "input" | "probing" | "mapping" | "saving";

/**
 * 「录一个 root 地址就能扫」落到实处的样子：
 *   1. 探测 —— sitemap / RSS / 列表页，哪条走得通用哪条
 *   2. 抽 3 个样本猜字段，把不确定的明说出来
 *   3. 你确认，才落库开抓
 * 第 2 步的「不确定」是这套东西的诚实之处：探测不可能全对。
 */
export function ChannelWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [root, setRoot] = useState("");
  const [outcome, setOutcome] = useState<ProbeOutcome | null>(null);
  const [name, setName] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function probe() {
    if (!root.trim()) return;
    setStep("probing");
    setFailure(null);
    startTransition(async () => {
      try {
        const result = await probeChannelAction(root);
        setOutcome(result);
        setName(result.probe.name);
        setStep(result.error ? "probing" : "mapping");
        if (result.error) setFailure(result.error);
      } catch (err) {
        setFailure(err instanceof Error ? err.message : String(err));
        setStep("input");
      }
    });
  }

  function save(limit: number) {
    const best = outcome?.probe.best;
    if (!outcome || !best) return;
    setStep("saving");
    startTransition(async () => {
      try {
        const selectors: ChannelProfile["selectors"] = {};
        for (const f of outcome.fields) {
          if (f.selector) selectors[f.field] = f.selector;
        }
        const { result } = await createChannelAction({
          name: name.trim() || outcome.probe.name,
          rootUrl: outcome.probe.rootUrl,
          strategy: best.strategy,
          listUrl: best.listUrl,
          detailPattern: best.detailPattern,
          selectors,
          limit,
        });
        if (result.error) {
          setFailure(result.error);
          setStep("mapping");
          return;
        }
        router.push("/channels");
      } catch (err) {
        setFailure(err instanceof Error ? err.message : String(err));
        setStep("mapping");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-2.5 pb-[calc(24px+env(safe-area-inset-bottom))]">
      <section className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">渠道首页地址</span>
        <Input
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && probe()}
          placeholder="https://example-site.com"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          className="h-12 font-mono text-sm"
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          只要首页，不用找列表页。剩下的探测来猜。
        </p>
      </section>

      {step === "input" ? (
        <button
          onClick={probe}
          disabled={!root.trim()}
          className="bg-primary text-primary-foreground h-12 rounded-xl text-[15px] font-medium disabled:opacity-50"
        >
          开始探测
        </button>
      ) : null}

      {outcome ? (
        <section className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs">
            {step === "probing" ? "探测结果" : "探测完了"}
          </span>
          <div className="bg-card border-border rounded-2xl border px-3.5">
            {outcome.probe.steps.map((s, i) => (
              <div
                key={s.key}
                className={cn(
                  "flex items-center gap-2.5 py-2.5",
                  i < outcome.probe.steps.length - 1 && "border-border border-b",
                )}
              >
                {s.state === "ok" ? (
                  <Check className="text-primary size-4 shrink-0" strokeWidth={2.2} />
                ) : (
                  <X className="text-muted-foreground size-4 shrink-0" strokeWidth={2.2} />
                )}
                <span
                  className={cn(
                    "flex-1 text-[13px]",
                    s.state === "ok" ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
                <span className="text-muted-foreground font-mono text-[11px]">{s.detail}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {step === "probing" && !outcome ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
          <Loader2 className="size-4 animate-spin" />
          正在探测 sitemap、RSS、列表页…
        </div>
      ) : null}

      {failure ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{failure}</span>
        </div>
      ) : null}

      {outcome && step !== "probing" ? (
        <>
          <section className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">渠道名字</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </section>

          <section className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs leading-relaxed">
              从 {outcome.probe.best?.urls.length ?? 0} 个页面里抽了 {outcome.sampleUrls.length}{" "}
              个样本，下面是猜的结果
            </span>
            <div className="bg-card border-border rounded-2xl border px-3.5">
              {outcome.fields.map((f, i) => {
                const sure = f.total > 0 && f.hit === f.total;
                return (
                  <div
                    key={f.field}
                    className={cn(
                      "flex items-center gap-2.5 py-3",
                      i < outcome.fields.length - 1 && "border-border border-b",
                    )}
                  >
                    <span className="text-muted-foreground w-14 shrink-0 text-xs">{f.label}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[13px] font-medium">
                        {f.sample ?? <span className="text-muted-foreground">没抓到</span>}
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[11px]",
                          sure ? "text-primary" : "text-destructive",
                        )}
                      >
                        {sure ? (
                          <Check className="size-3" strokeWidth={2.6} />
                        ) : (
                          <AlertCircle className="size-3" />
                        )}
                        {f.hit} / {f.total} 个样本命中
                        {f.selector ? ` · ${f.selector.kind}` : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {outcome.fields.find((f) => f.field === "stream")?.hit === 0 ? (
              <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border px-3.5 py-3 text-xs leading-relaxed">
                没在详情页里找到播放清单地址。元数据能抓，但<b>点开播不了</b> —— 这站多半是用
                JS 调接口拿地址的，得给它写一个 adapter。
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs leading-relaxed">
              标红的是不确定的。先抓 20 条看看对不对，不对就把这个渠道删了重来 —— 比一开始就抓全站省事。
            </p>
          </section>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => save(20)}
              disabled={step === "saving"}
              className="bg-primary text-primary-foreground h-12 rounded-xl text-[15px] font-medium disabled:opacity-60"
            >
              {step === "saving" ? "抓取中…" : "先抓 20 条试试"}
            </button>
            <button
              onClick={() => save(200)}
              disabled={step === "saving"}
              className="text-muted-foreground h-11 text-sm disabled:opacity-60"
            >
              直接抓 200 条
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
