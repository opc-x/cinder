import type { Portrait, SourceComment } from "@/lib/adapters/types";
import { STRUCTURAL_TAGS } from "@/lib/features";

const AD = /zshmh|约上车|游艇|加微|私信|专属客服|极速传送门|福利姬广告/i;

export function isAdCopy(text?: string | null): boolean {
  if (!text) return true;
  return AD.test(text) || text.length > 400;
}

export function buildTaste(input: {
  title: string;
  tags?: string[] | null;
  coreTags?: string[] | null;
  durationSec?: number | null;
  description?: string | null;
  comments?: SourceComment[] | null;
  portrait?: Portrait | null;
}): Portrait {
  const tags = (input.coreTags ?? []).filter((t) => t && !STRUCTURAL_TAGS.has(t));
  const d = input.durationSec ?? 0;
  const mins = d ? Math.round(d / 60) : 0;
  const length = d >= 20 * 60 ? "完整长片" : d >= 8 * 60 ? "中等时长" : d > 0 ? "短片/切片" : "时长未知";
  const heat = input.portrait?.heat ?? "未知";

  const who = tags.slice(0, 3);
  const like = who.length
    ? `爱看「${who.join("、")}」这口的，打开基本对路。`
    : "标题里口味信号很弱，得靠片名自己判断。";
  const pace =
    mins >= 20
      ? `${mins} 分钟，能当一部正经看完，不是几分钟切片。`
      : mins >= 8
        ? `${mins} 分钟，中等长度，适合随便翻。`
        : mins
          ? `只有 ${mins} 分钟，更像切片/预览。`
          : "时长不清楚。";
  const skip =
    who.includes("调教") || who.includes("多人")
      ? "不吃重口/多人的会觉得冲。"
      : who.includes("番号片")
        ? "日系番号路子，要剧情或自拍真实感的可能对不上。"
        : "没有特别偏门的玩法信号。";

  const blurb = `${like}${pace}${skip}`;
  const summary = who.length
    ? `片名叫「${clip(input.title, 28)}」。从标题和标签看，核心口味是 ${who.join("、")}，体量是${length}。源站热度：${heatLabel(heat)}。`
    : `片名叫「${clip(input.title, 28)}」。口味标签几乎抽不出来，${length}，热度${heatLabel(heat)}。只能当盲盒。`;

  const highlights = [
    who.length ? `口味：${who.join(" / ")}` : "口味：标题里读不太清",
    `体量：${length}${mins ? `（约 ${mins} 分钟）` : ""}`,
    heat === "爆" || heat === "热" ? "源站看起来有人看" : "源站热度一般，别当必看",
  ];

  return { blurb, traits: who, heat, length, summary, highlights };
}

function heatLabel(h: string) {
  if (h === "爆") return "很热";
  if (h === "热") return "偏热";
  if (h === "一般") return "一般";
  return "不明";
}

function clip(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

const TASTE_PROMPT = `你给私人片库写口味说明，让人没看片就知道自己爱不爱这口。只输出 JSON，不要解释。
格式：{"blurb":"两到三句，先说适合谁、不适合谁","summary":"不超过80字的内容摘要，只根据标题和标签，禁止编造具体剧情","highlights":["看点1","看点2","看点3"]}
不要广告、不要网址、不要推荐加微信。`;

export async function generateTasteAi(input: {
  title: string;
  tags: string[];
  durationSec?: number | null;
}): Promise<Pick<Portrait, "blurb" | "summary" | "highlights"> | null> {
  const host = process.env.CINDER_OLLAMA_HOST ?? "http://127.0.0.1:11434";
  const model = process.env.CINDER_OLLAMA_MODEL ?? "qwen2.5:7b";
  try {
    const ping = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(800) });
    if (!ping.ok) return null;
  } catch {
    return null;
  }
  const prompt = `标题：${input.title}\n标签：${input.tags.join("、") || "无"}\n时长秒：${input.durationSec ?? "未知"}`;
  try {
    const res = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        system: TASTE_PROMPT,
        prompt,
        format: "json",
        stream: false,
        options: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { response?: string };
    const raw = json.response ?? "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as {
      blurb?: unknown;
      summary?: unknown;
      highlights?: unknown;
    };
    const blurb = typeof obj.blurb === "string" ? obj.blurb.trim() : "";
    const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
    const highlights = Array.isArray(obj.highlights)
      ? obj.highlights.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 4)
      : [];
    if (!blurb || !summary) return null;
    return { blurb, summary, highlights: highlights.length ? highlights : [blurb] };
  } catch {
    return null;
  }
}
