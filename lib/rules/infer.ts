import { spawn } from "node:child_process";
import type { RuleDefinition } from "@/lib/db/schema";
import { describe } from "./load";

export interface InferredRule {
  definition: RuleDefinition;
  score: number;
  exclude: boolean;
  summary: string;
  /** 这条规则是谁推出来的，UI 上要如实告诉你 */
  engine: "cli" | "ollama" | "heuristic";
  /** 推理耗时，毫秒 */
  tookMs: number;
}

const SYSTEM_PROMPT = `你把中文的观看偏好翻译成 JSON 筛选规则。只输出 JSON，不要解释、不要代码块围栏。

输出格式：
{"match":"any"|"all","conditions":[{"field":F,"op":O,"value":V}],"score":整数,"exclude":布尔}

field 只能是：title(标题) description(简介) tags(标签) durationSec(时长秒数)
op 只能是：regex contains eq gt lt
score：正数=想看，往前排；负数=不太想看，往后排；exclude=true 表示根本不要，此时 score 写 0
时长一律换算成秒。多个关键词用 regex 的 | 连接，别拆成多条。
关键词类的偏好通常要同时看 title 和 tags，用 match:"any"。

例子：
输入：只要 4K 的
输出：{"match":"any","conditions":[{"field":"title","op":"regex","value":"4K|2160p"},{"field":"tags","op":"regex","value":"4K|2160p"}],"score":30,"exclude":false}
输入：预告片一律别给我
输出：{"match":"any","conditions":[{"field":"title","op":"regex","value":"预告|trailer"},{"field":"tags","op":"regex","value":"预告|trailer"}],"score":0,"exclude":true}
输入：十分钟以下的基本是切片
输出：{"match":"all","conditions":[{"field":"durationSec","op":"lt","value":600}],"score":-20,"exclude":false}`;

/**
 * 把一句话翻成规则。三条路，按顺序试，全都失败才用启发式兜底：
 *   1. CINDER_AI_CMD 指定的 CLI（prompt 走 stdin，JSON 从 stdout 读）
 *   2. 本机 ollama 的 HTTP 接口
 *   3. 内置启发式解析（关键词 / 时长 / 排除三类，没有模型也能用）
 * 无论走哪条，结果都要你在界面上确认过才会落库 —— 这是防模型理解错的唯一手段。
 */
export async function inferRule(said: string): Promise<InferredRule> {
  const started = Date.now();

  const cmd = process.env.CINDER_AI_CMD?.trim();
  if (cmd) {
    const out = await runCli(cmd, said).catch((err) => {
      console.warn(`[cinder] CINDER_AI_CMD 失败，退回下一条路: ${(err as Error).message}`);
      return null;
    });
    const parsed = out && parseRule(out);
    if (parsed) return finish(parsed, "cli", started);
  }

  const viaOllama = await runOllama(said).catch(() => null);
  const parsedOllama = viaOllama && parseRule(viaOllama);
  if (parsedOllama) return finish(parsedOllama, "ollama", started);

  return finish(heuristic(said), "heuristic", started);
}

function finish(
  r: { definition: RuleDefinition; score: number; exclude: boolean },
  engine: InferredRule["engine"],
  started: number,
): InferredRule {
  return {
    ...r,
    summary: describe(r.definition.conditions, r.definition.match, r.score, r.exclude),
    engine,
    tookMs: Date.now() - started,
  };
}

/** prompt 从 stdin 喂进去，stdout 收回来。`claude -p`、`ollama run xxx` 都是这个形状。 */
function runCli(cmd: string, said: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("推理超时（30 秒）"));
    }, 30_000);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `退出码 ${code}`));
    });

    child.stdin.write(`${SYSTEM_PROMPT}\n\n输入：${said}\n输出：`);
    child.stdin.end();
  });
}

/** 本机 ollama。format:"json" 是关键 —— 不加的话小模型会给你一段散文。 */
async function runOllama(said: string): Promise<string> {
  const host = process.env.CINDER_OLLAMA_HOST ?? "http://127.0.0.1:11434";
  const model = process.env.CINDER_OLLAMA_MODEL ?? "qwen2.5:7b";

  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      system: SYSTEM_PROMPT,
      prompt: `输入：${said}\n输出：`,
      format: "json",
      stream: false,
      options: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const json = (await res.json()) as { response?: string };
  return json.response ?? "";
}

const FIELDS = new Set(["title", "description", "tags", "durationSec"]);
const OPS = new Set(["regex", "contains", "eq", "gt", "lt"]);

/** 模型输出永远当成不可信文本：抠出第一段 JSON，逐字段验，验不过就当没推出来。 */
function parseRule(
  raw: string,
): { definition: RuleDefinition; score: number; exclude: boolean } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  const rawConds = Array.isArray(obj.conditions) ? obj.conditions : [];
  const conditions = rawConds
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .filter((c) => FIELDS.has(String(c.field)) && OPS.has(String(c.op)))
    .filter((c) => typeof c.value === "string" || typeof c.value === "number")
    .map((c) => ({
      field: c.field as RuleDefinition["conditions"][number]["field"],
      op: c.op as RuleDefinition["conditions"][number]["op"],
      value: c.value as string | number,
    }));

  if (!conditions.length) return null;

  // 正则得先能编译，否则打分时每条都要吞异常
  for (const c of conditions) {
    if (c.op === "regex") {
      try {
        new RegExp(String(c.value));
      } catch {
        return null;
      }
    }
  }

  const exclude = obj.exclude === true;
  const score = exclude ? 0 : clampScore(obj.score);
  return {
    definition: { match: obj.match === "all" ? "all" : "any", conditions },
    score,
    exclude,
  };
}

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 10;
  return Math.max(-100, Math.min(100, Math.round(n)));
}

const NEGATIVE = /不要|别给|别推|别来|讨厌|不想看|拉黑|屏蔽|不看/;
const POSITIVE = /只要|优先|多来|想看|喜欢|要看|重点|专门/;
const DEMOTE = /往后|靠后|降权|少推|少来|不太想/;
const QUALITY: Record<string, string> = {
  "4k": "4K|2160p",
  "2160": "4K|2160p",
  "1080": "1080p|fullhd|全高清",
  "720": "720p",
  蓝光: "蓝光|bluray|remux",
  高清: "1080p|4K|2160p|高清",
};

/** 「十分钟」「半小时」这种中文数字，正则匹配不到，得单独认。 */
const CN_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function cnNumber(text: string): number | null {
  if (text === "半") return 0.5;
  if (/^\d+$/.test(text)) return Number(text);

  // 十 / 十五 / 二十 / 二十五
  const m = text.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) return (m[1] ? CN_DIGITS[m[1]] : 1) * 10 + (m[2] ? CN_DIGITS[m[2]] : 0);

  if (text.length === 1 && text in CN_DIGITS) return CN_DIGITS[text];
  return null;
}

/** 先摘掉这些「语气词/句式」，剩下的才是你真正在说的东西。 */
const STOP_PHRASES = [
  "一律", "基本是", "基本", "通常", "尽量", "最好", "我想看", "我要看", "我想", "我要",
  "想看", "不想看", "别给我", "别给", "别推", "别来", "不要", "给我", "的话", "之类",
  "优先", "多来点", "少来点", "往后排", "往前排", "别的", "那些", "这些", "东西",
  "以下的", "以上的", "以内的", "看看", "就行", "可以", "应该", "而已",
];

function extractKeyword(text: string): string {
  let cleaned = text.replace(/[，。！？、,.!?\s]+/g, " ");
  for (const phrase of STOP_PHRASES) cleaned = cleaned.split(phrase).join(" ");

  const runs = cleaned.match(/[a-zA-Z0-9]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? [];
  const usable = runs.filter((w) => !/^(的|了|吧|啊|和|跟|或)/.test(w));
  // 挑最长的一段当关键词：短句里最长的实词通常就是主题
  return usable.sort((a, b) => b.length - a.length)[0] ?? text.slice(0, 6);
}

/**
 * 没有模型时的兜底：认三类最常见的偏好 —— 时长、画质关键词、主题词。
 * 覆盖不了的翻成一条「标题或标签含某个词」的宽松规则，起码不会一句话都接不住。
 * 它只是兜底，翻错了确认屏会让你看见 —— 装个本地模型效果会好得多。
 */
function heuristic(said: string): {
  definition: RuleDefinition;
  score: number;
  exclude: boolean;
} {
  const text = said.trim();
  const lower = text.toLowerCase();
  const exclude = NEGATIVE.test(text);
  // 「只要 4K 的，别的往后排」里的「往后」说的是别的，不是 4K —— 正向词优先
  const positive = POSITIVE.test(text);
  const demote = !exclude && !positive && DEMOTE.test(text);

  // 时长：「十分钟以下」「短于 5 分钟」「超过半小时」
  const durMatch = text.match(/([0-9]+|[一二两三四五六七八九十]+|半)\s*(分钟|分|小时|秒)/);
  if (durMatch) {
    const n = cnNumber(durMatch[1]);
    if (n !== null) {
      const unit = durMatch[2];
      const seconds = Math.round(unit === "小时" ? n * 3600 : unit === "秒" ? n : n * 60);
      const isBelow = /以下|以内|不到|短于|小于|少于|不足/.test(text);
      return {
        definition: {
          match: "all",
          conditions: [{ field: "durationSec", op: isBelow ? "lt" : "gt", value: seconds }],
        },
        // 「太短的不要」是想压下去，不是想整条删掉 —— 除非明确说了别给我
        score: exclude ? 0 : isBelow ? -20 : 10,
        exclude,
      };
    }
  }

  // 画质关键词
  for (const [key, pattern] of Object.entries(QUALITY)) {
    if (lower.includes(key)) {
      return {
        definition: {
          match: "any",
          conditions: [
            { field: "title", op: "regex", value: pattern },
            { field: "tags", op: "regex", value: pattern },
          ],
        },
        score: exclude ? 0 : demote ? -20 : 30,
        exclude,
      };
    }
  }

  // 兜底：把句子里的主题词抠出来，在标题和标签里找
  const keyword = extractKeyword(text);
  return {
    definition: {
      match: "any",
      conditions: [
        { field: "title", op: "contains", value: keyword },
        { field: "tags", op: "contains", value: keyword },
      ],
    },
    score: exclude ? 0 : demote ? -20 : 20,
    exclude,
  };
}
