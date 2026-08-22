import type { RuleCondition, RuleDefinition } from "@/lib/db/schema";

export type { RuleCondition, RuleDefinition };

/** 引擎的输入：只依赖这几个字段，DB 行和 adapter 抓回来的原始数据都能对上。 */
export interface Scorable {
  title: string;
  description?: string | null;
  tags?: string[] | null;
  durationSec?: number | null;
  channelId: string;
}

/** 引擎认的规则形状，跟 DB 行的子集一致。 */
export interface EvaluableRule {
  id: string;
  summary: string;
  definition: RuleDefinition;
  score: number;
  exclude: boolean;
  channelId: string | null;
  enabled: boolean;
}

export interface Verdict {
  score: number;
  excluded: boolean;
  matched: string[];
}
