import { parseDuration } from "@/lib/channels/extract";
import type { Playback, RawMedia, SourceComment } from "./types";

export const PER_PAGE = 24;

const AD =
  /zshmh|私信问我|专属客服|极速传送门|约啪圈子|人妻上门|匹配，告诉她你的XP|全国已有/i;

export function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

export function parseCards(html: string, extraTags: string[] = []): RawMedia[] {
  const out: RawMedia[] = [];
  const re =
    /href="(\/videos\/view\/\d+\/[^"]+\/)"[\s\S]*?url\('([^']+)'\)[\s\S]*?class="layer">\s*([^<]+)[\s\S]*?class="title[^"]*"[^>]*>([^<]+)/gi;
  for (const m of html.matchAll(re)) {
    const href = m[1];
    const title = decodeHtml(m[4]).trim();
    if (!href || !title) continue;
    out.push({
      externalId: href,
      title,
      posterUrl: m[2],
      durationSec: parseDuration(m[3].trim()) ?? undefined,
      tags: extraTags,
      streamType: "mp4",
    });
  }
  return out;
}

export function parseNavSections(html: string): { path: string; tag: string }[] {
  const seen = new Set<string>();
  const out: { path: string; tag: string }[] = [];
  const re = /href="(\/(?:videos|video)(?:\/[^"?#]*)?)"[^>]*>([^<]{1,16})<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const path = m[1].replace(/\/+$/, "") || m[1];
    const tag = decodeHtml(m[2]).trim();
    if (!tag || tag === "+更多" || seen.has(path)) continue;
    if (/登录|注册|会员|上传|搜索/.test(tag)) continue;
    seen.add(path);
    out.push({ path: path.startsWith("/") ? path : `/${path}`, tag });
  }
  return out;
}

export function parsePlayback(html: string, pageUrl: string, origin: string): Playback {
  const raw =
    html.match(/id="video-play"[^>]*data-src="([^"]+)"/i)?.[1] ??
    html.match(/data-src="([^"]+\.mp4[^"]*)"/i)?.[1];
  if (!raw) throw new Error("详情页没有 data-src，播不了");
  const url = decodeHtml(raw);
  return {
    url,
    type: url.includes(".m3u8") ? "hls" : "mp4",
    headers: { referer: pageUrl, origin },
  };
}

export function parseDetail(html: string): {
  description?: string;
  comments: SourceComment[];
  tags: string[];
  views?: number;
} {
  const comments = parseComments(html);
  const tags = [
    ...new Set(
      [...html.matchAll(/href="\/tags\/([^"]+)"[^>]*>([^<]+)</gi)].map((m) =>
        decodeHtml(m[2]).trim(),
      ),
    ),
  ].filter((t) => t && t.length < 24 && !/^\d+$/.test(t));

  const views = parseViews(html.match(/([\d.]+)\s*万次播放/)?.[1]);
  const author = comments.find((c) => c.author.startsWith("作者"));
  const description = author?.body;

  return {
    description,
    comments: comments.filter((c) => !AD.test(c.body)),
    tags,
    views,
  };
}

function parseViews(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 10000);
}

function parseComments(html: string): SourceComment[] {
  const out: SourceComment[] = [];
  const chunks = html.split(/class="commented-section[^"]*"/i).slice(1);
  for (const chunk of chunks) {
    const author = decodeHtml(
      chunk.match(/<(?:h5|h6)[^>]*>\s*([^<]+)/i)?.[1] ?? "匿名",
    )
        .trim();
    const when = chunk.match(/ml-2">([^<]+)</)?.[1]?.trim();
    const lines = [...chunk.matchAll(/class="comment-text-sm"[^>]*>\s*<span>([\s\S]*?)<\/span>/gi)]
      .map((m) =>
        decodeHtml(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(),
      )
      .filter(Boolean)
      .filter((line) => !AD.test(line));
    const body = lines.join("\n").trim();
    if (!body) continue;
    out.push({ author, when, body });
  }
  return out;
}
