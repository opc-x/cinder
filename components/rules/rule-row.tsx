"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";
import { deleteRuleAction, toggleRuleAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import type { Channel, Rule } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/** 规则卡片的标题是你说的那句话。条件长什么样，平时不给你看。 */
export function RuleRow({ rule, channels }: { rule: Rule; channels: Channel[] }) {
  const [pending, startTransition] = useTransition();
  const scoped = rule.channelId ? channels.find((c) => c.id === rule.channelId) : null;

  const effect = rule.exclude
    ? { text: "直接不进库", variant: "destructive" as const }
    : rule.score > 0
      ? { text: `往前排 +${rule.score}`, variant: "default" as const }
      : { text: `往后排 ${rule.score}`, variant: "secondary" as const };

  return (
    <div
      className={cn(
        "bg-card border-border rounded-2xl border p-3.5 transition-opacity",
        (!rule.enabled || pending) && "opacity-55",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm leading-relaxed font-medium">「{rule.said}」</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={effect.variant}>{effect.text}</Badge>
            {scoped ? <Badge variant="outline">只管 {scoped.name}</Badge> : null}
            {rule.origin === "file" ? <Badge variant="outline">来自 rules/*.md</Badge> : null}
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">{rule.summary}</p>
        </div>

        <button
          role="switch"
          aria-checked={rule.enabled}
          aria-label={rule.enabled ? "停用" : "启用"}
          disabled={pending}
          onClick={() => startTransition(() => toggleRuleAction(rule.id, !rule.enabled))}
          className={cn(
            "relative h-[26px] w-11 shrink-0 rounded-full transition-colors",
            rule.enabled ? "bg-primary" : "bg-input",
          )}
        >
          <span
            className={cn(
              "absolute top-[3px] size-5 rounded-full bg-white transition-all",
              rule.enabled ? "left-[22px]" : "left-[3px]",
            )}
          />
        </button>
      </div>

      <div className="border-border mt-3 flex items-center justify-between border-t pt-2.5">
        <span className="text-muted-foreground font-mono text-[11px]">{rule.id}</span>
        <button
          disabled={pending}
          onClick={() => startTransition(() => deleteRuleAction(rule.id))}
          className="text-muted-foreground active:text-destructive flex items-center gap-1.5 text-xs"
        >
          <Trash2 className="size-3.5" />
          删掉
        </button>
      </div>
    </div>
  );
}
