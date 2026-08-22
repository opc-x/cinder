import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rules } from "@/lib/db/schema";
import type { EvaluableRule, RuleDefinition } from "./types";

const RULES_DIR = path.resolve(process.cwd(), "rules");

/** 库里的规则，打分时用这一份。 */
export async function loadRules(): Promise<EvaluableRule[]> {
  const rows = await db.select().from(rules).where(eq(rules.enabled, true));
  return rows.map((r) => ({
    id: r.id,
    summary: r.summary,
    definition: r.definition,
    score: r.score,
    exclude: r.exclude,
    channelId: r.channelId,
    enabled: r.enabled,
  }));
}

interface FileRuleSeed {
  id: string;
  said: string;
  summary: string;
  definition: RuleDefinition;
  score: number;
  exclude: boolean;
  channelId: string | null;
  enabled: boolean;
  origin: "file";
}

/**
 * `rules/*.md` 里的 json 块 —— 只在首次启动时导进库当种子。
 * 之后以库为准：你在界面上说的话才是规则的来源，md 文件不再被读。
 */
export async function loadFileRules(): Promise<FileRuleSeed[]> {
  let files: string[];
  try {
    files = (await fs.readdir(RULES_DIR)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }

  const out: FileRuleSeed[] = [];
  for (const file of files) {
    const text = await fs.readFile(path.join(RULES_DIR, file), "utf8");
    for (const block of text.matchAll(/```json\s*\n([\s\S]*?)```/g)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(block[1]);
      } catch (err) {
        console.warn(`[cinder] rules/${file} 里有 json 块解析失败，跳过: ${(err as Error).message}`);
        continue;
      }
      for (const raw of Array.isArray(parsed) ? parsed : [parsed]) {
        const seed = toSeed(raw as Record<string, unknown>);
        if (seed) out.push(seed);
      }
    }
  }
  return out;
}

function toSeed(raw: Record<string, unknown>): FileRuleSeed | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  if (!id) return null;

  const all = Array.isArray(raw.all) ? raw.all : [];
  const any = Array.isArray(raw.any) ? raw.any : [];
  const conditions = (all.length ? all : any) as RuleDefinition["conditions"];
  if (!conditions.length) return null;

  const score = typeof raw.score === "number" ? raw.score : 0;
  const exclude = raw.exclude === true;
  const label = typeof raw.label === "string" ? raw.label : id;

  return {
    id,
    said: label,
    summary: describe(conditions, all.length ? "all" : "any", score, exclude),
    definition: { match: all.length ? "all" : "any", conditions },
    score,
    exclude,
    channelId: null,
    enabled: true,
    origin: "file",
  };
}

const FIELD_CN: Record<string, string> = {
  title: "标题",
  description: "简介",
  tags: "标签",
  durationSec: "时长",
  channel: "渠道",
};

/** 把条件翻回人话，列表里显示的就是这句。 */
export function describe(
  conditions: RuleDefinition["conditions"],
  match: "all" | "any",
  score: number,
  exclude: boolean,
): string {
  const parts = conditions.map((c) => {
    const f = FIELD_CN[c.field] ?? c.field;
    if (c.field === "durationSec") {
      const mins = Math.round(Number(c.value) / 60);
      if (c.op === "lt") return `时长短于 ${mins} 分钟`;
      if (c.op === "gt") return `时长超过 ${mins} 分钟`;
      return `${f} ${c.op} ${c.value}`;
    }
    switch (c.op) {
      case "regex":
        return `${f}匹配 ${c.value}`;
      case "contains":
        return `${f}含「${c.value}」`;
      case "eq":
        return `${f}是「${c.value}」`;
      default:
        return `${f} ${c.op} ${c.value}`;
    }
  });

  const cond = parts.join(match === "all" ? " 且 " : " 或 ");
  if (exclude) return `${cond} 的，直接不进库`;
  if (score > 0) return `${cond} 的，往前排 +${score}`;
  if (score < 0) return `${cond} 的，往后排 ${score}`;
  return cond;
}
