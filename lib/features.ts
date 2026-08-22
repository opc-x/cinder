import type { Portrait, SourceComment } from "@/lib/adapters/types";

/** 渠道栏/时长桶，不是给人筛口味的 */
export const STRUCTURAL_TAGS = new Set([
  "91视频",
  "蝌蚪",
  "长片",
  "中篇",
  "短片",
  "最受欢迎",
  "最近更新",
  "最高评分",
  "未分类",
  "时长不明",
]);

const PREFS: { re: RegExp; label: string }[] = [
  { re: /人妻|少妇|熟女|人妻/, label: "人妻熟女" },
  { re: /出轨|偷情|NTR|绿帽/i, label: "出轨" },
  { re: /自拍|real|amateur|国产自拍/i, label: "自拍" },
  { re: /探花|约炮|外围|上门/, label: "约拍" },
  { re: /学生|校服|jk|制服|护士|空姐/i, label: "制服角色" },
  { re: /露脸/, label: "露脸" },
  { re: /多人|3p|群p|换妻/i, label: "多人" },
  { re: /口爆|口交|深喉/, label: "口" },
  { re: /sm|调教|捆绑|奴/i, label: "调教" },
  { re: /巨乳|爆乳|大奶|胸/, label: "胸向" },
  { re: /无码|无碼|无修/, label: "无码" },
  { re: /中出|内射/, label: "中出" },
  { re: /颜射|口爆/, label: "颜射" },
  { re: /直播|录播/, label: "直播感" },
  { re: /情侣|女友|老婆/, label: "情侣实拍" },
  { re: /按摩|会所|技师/, label: "会所" },
  { re: /车震|车上/, label: "车震" },
  { re: /酒店|开房/, label: "酒店" },
  { re: /户外|野外|露出/, label: "露出" },
  { re: /呆哥/, label: "呆哥" },
  { re: /heyzo|caribbean|ipx|pred|ssni|wanz|jul|kbi|jrzd|heydouga/i, label: "番号片" },
  { re: /国产自拍|国产/, label: "国产" },
  { re: /欧美|西洋/, label: "欧美" },
  { re: /动漫|里番|3d/, label: "二次元" },
  { re: /4k|高清|1080|2160/i, label: "高清" },
  { re: /反差/, label: "反差" },
  { re: /萌白酱|pantiantian|dannan/i, label: "网红脸" },
];

export interface FeaturePack {
  coreTags: string[];
  watchability: number;
}

export function extractFeatures(input: {
  title: string;
  tags?: string[] | null;
  durationSec?: number | null;
  description?: string | null;
  comments?: SourceComment[] | null;
  portrait?: Portrait | null;
  views?: number;
}): FeaturePack {
  const hay = `${input.title} ${(input.tags ?? []).join(" ")} ${input.description ?? ""}`;
  const found: string[] = [];
  for (const p of PREFS) {
    if (p.re.test(hay) && !found.includes(p.label)) found.push(p.label);
  }
  for (const tag of input.tags ?? []) {
    if (!tag || STRUCTURAL_TAGS.has(tag) || JUNK_CORE.has(tag) || found.includes(tag) || tag.length > 10)
      continue;
    found.push(tag);
  }

  const coreTags = found.filter((t) => !JUNK_CORE.has(t)).slice(0, 3);
  return { coreTags, watchability: rawWatchability(input, coreTags.length) };
}

export const JUNK_CORE = new Set([
  "口味不明",
  "能看完的长片",
  "中等时长",
  "短切片",
  "时长未知",
  "小众",
  "常规向",
  "其它1",
  "其它2",
]);

function rawWatchability(
  input: {
    title: string;
    durationSec?: number | null;
    comments?: SourceComment[] | null;
    portrait?: Portrait | null;
    views?: number;
  },
  prefHits: number,
): number {
  const d = input.durationSec ?? 0;
  let s = 40;
  if (d > 0 && d < 3 * 60) s = 28;
  else if (d < 8 * 60) s = 52;
  else if (d < 20 * 60) s = 74;
  else if (d < 40 * 60) s = 88;
  else if (d < 70 * 60) s = 80;
  else if (d > 0) s = 68;

  const views = input.views ?? 0;
  if (views >= 200_000) s += 12;
  else if (views >= 50_000) s += 8;
  else if (views >= 10_000) s += 4;
  else if (input.portrait?.heat === "爆") s += 12;
  else if (input.portrait?.heat === "热") s += 8;
  else if (input.portrait?.heat === "一般") s += 4;

  s += Math.min(8, (input.comments?.length ?? 0) * 2);
  s += Math.min(6, prefHits);

  if (/破解|app下载|加微|福利姬广告|zshmh/i.test(input.title)) s -= 18;
  if (/预告|trailer|剪辑/i.test(input.title)) s -= 12;

  return Math.max(1, Math.min(100, Math.round(s)));
}
