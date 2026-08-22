"use client";

import { ArrowRight, Flame } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

const EXAMPLES = ["只要 4K 的", "预告片别给我", "科幻优先", "十分钟以下的不要"];

/**
 * 规则的入口就是一个输入框。你打字，剩下的交给模型。
 * 提交只是跳到确认页 —— 推理和落库都在那儿，这里不做任何判断。
 */
export function RuleComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const said = text.trim();
    if (!said) return;
    startTransition(() => router.push(`/rules/confirm?said=${encodeURIComponent(said)}`));
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-3.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={2}
          placeholder="说说你想看什么，或者不想看什么…"
          className="placeholder:text-muted-foreground resize-none bg-transparent text-[15px] leading-relaxed outline-none"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <Flame className="text-primary size-3" strokeWidth={2} />
            本地模型推理，这句话不出内网
          </span>
          <button
            onClick={submit}
            disabled={!text.trim() || pending}
            aria-label="推理"
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
              text.trim()
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground",
              pending && "opacity-60",
            )}
          >
            <ArrowRight className="size-[19px]" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="shrink-0 -mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => setText(e)}
            className="border-border text-muted-foreground shrink-0 rounded-full border px-3 py-1.5 text-xs"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
