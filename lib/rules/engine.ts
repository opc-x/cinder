import type { EvaluableRule, RuleCondition, Scorable, Verdict } from "./types";

function fieldValue(item: Scorable, field: RuleCondition["field"]): string | number | null {
  switch (field) {
    case "title":
      return item.title;
    case "description":
      return item.description ?? "";
    case "tags":
      return (item.tags ?? []).join(" ");
    case "durationSec":
      return item.durationSec ?? null;
    case "channel":
      return item.channelId;
  }
}

function test(item: Scorable, cond: RuleCondition): boolean {
  const actual = fieldValue(item, cond.field);
  if (actual === null) return false;

  switch (cond.op) {
    case "regex":
      try {
        return new RegExp(String(cond.value), "i").test(String(actual));
      } catch {
        // 模型偶尔会吐出非法正则，当作没命中，不要让整轮打分崩掉
        return false;
      }
    case "contains":
      return String(actual).toLowerCase().includes(String(cond.value).toLowerCase());
    case "eq":
      return String(actual).toLowerCase() === String(cond.value).toLowerCase();
    case "gt":
      return Number(actual) > Number(cond.value);
    case "lt":
      return Number(actual) < Number(cond.value);
  }
}

export function hits(item: Scorable, rule: EvaluableRule): boolean {
  if (!rule.enabled) return false;
  // channelId 为 null 的规则全渠道生效；否则只管自己那个渠道
  if (rule.channelId && rule.channelId !== item.channelId) return false;

  const conds = rule.definition?.conditions ?? [];
  if (!conds.length) return false; // 空条件的规则不该无差别命中所有条目

  return rule.definition.match === "any"
    ? conds.some((c) => test(item, c))
    : conds.every((c) => test(item, c));
}

export function evaluate(item: Scorable, rules: EvaluableRule[]): Verdict {
  let score = 0;
  let excluded = false;
  const matched: string[] = [];

  for (const rule of rules) {
    if (!hits(item, rule)) continue;
    matched.push(rule.id);
    score += rule.score;
    if (rule.exclude) excluded = true;
  }

  return { score, excluded, matched };
}
