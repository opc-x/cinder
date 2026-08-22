import type { Portrait, SourceComment } from "@/lib/adapters/types";

const TRAITS: { re: RegExp; label: string }[] = [
  { re: /自拍|real|amateur/i, label: "自拍" },
  { re: /探花|约炮|外围/, label: "约拍" },
  { re: /人妻|少妇|熟女/, label: "人妻熟女" },
  { re: /学生|校服|制服/, label: "制服" },
  { re: /露脸/, label: "露脸" },
  { re: /4k|高清|1080/, label: "画质标了高清" },
  { re: /多人|3p|群/, label: "多人" },
  { re: /出轨|偷情/, label: "出轨向" },
  { re: /国产|国内/, label: "国产" },
  { re: /呆哥/, label: "系列：呆哥" },
];

export function buildPortrait(input: {
  title: string;
  tags?: string[];
  durationSec?: number | null;
  description?: string | null;
  comments?: SourceComment[];
  views?: number;
}): Portrait {
  const hay = `${input.title} ${(input.tags ?? []).join(" ")} ${input.description ?? ""}`;
  const traits = TRAITS.filter((t) => t.re.test(hay)).map((t) => t.label);
  for (const tag of input.tags ?? []) {
    if (tag && !traits.includes(tag) && traits.length < 6) traits.push(tag);
  }

  const durationSec = input.durationSec ?? 0;
  const length =
    durationSec >= 20 * 60 ? "长片" : durationSec >= 8 * 60 ? "中篇" : durationSec > 0 ? "短片" : "时长不明";

  const views = input.views ?? 0;
  const heat = views >= 200_000 ? "爆" : views >= 50_000 ? "热" : views >= 10_000 ? "一般" : "冷/未知";

  const commentN = input.comments?.length ?? 0;
  const bits = [length, heat === "冷/未知" ? null : `播放${heat}`, commentN ? `${commentN} 条有效留言` : null].filter(
    Boolean,
  );

  const who = traits.slice(0, 3).join(" · ") || "题材从标题里读不太出来";
  const blurb = `${who}。${bits.join("，") || "源站几乎没给旁证"}。`;

  return { blurb, traits: traits.length ? traits : ["未分类"], heat, length };
}
