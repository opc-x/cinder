import type { FieldSelector } from "@/lib/db/schema";

/**
 * 从一页 HTML 里抽字段。没有引 cheerio —— 我们要的东西（og 标签、JSON-LD、
 * 清单地址）都在 <head> 或脚本里，正则够用，少一个依赖少一份维护。
 *
 * 代价说清楚：**重 JS 渲染的站点这条路拿不到东西**，那种站得走 playwright。
 * 探测阶段会因为三个样本全空而明确报错，不会静默抓回一堆空标题。
 */

export function metaContent(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${esc}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}

export function cssText(html: string, selector: string): string | null {
  // 只支持最常见的三种：#id、.class、tag。够探测用，复杂选择器请改用 regex。
  let re: RegExp | null = null;
  if (selector.startsWith("#")) {
    re = new RegExp(`<([a-z0-9]+)[^>]*id=["']${escapeRe(selector.slice(1))}["'][^>]*>([\\s\\S]*?)</\\1>`, "i");
  } else if (selector.startsWith(".")) {
    re = new RegExp(`<([a-z0-9]+)[^>]*class=["'][^"']*\\b${escapeRe(selector.slice(1))}\\b[^"']*["'][^>]*>([\\s\\S]*?)</\\1>`, "i");
  } else if (/^[a-z0-9]+$/i.test(selector)) {
    re = new RegExp(`<${selector}[^>]*>([\\s\\S]*?)</${selector}>`, "i");
  }
  if (!re) return null;
  const m = html.match(re);
  const raw = m?.[2] ?? m?.[1];
  return raw ? decodeEntities(stripTags(raw)).trim() || null : null;
}

export function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1].trim());
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node && typeof node === "object") out.push(node as Record<string, unknown>);
        const graph = (node as Record<string, unknown>)?.["@graph"];
        if (Array.isArray(graph)) {
          for (const g of graph) if (g && typeof g === "object") out.push(g);
        }
      }
    } catch {
      // 站点的 JSON-LD 经常是坏的，跳过就行
    }
  }
  return out;
}

export function jsonLdValue(html: string, key: string): string | null {
  for (const node of jsonLd(html)) {
    const v = node[key];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

/** 按一条选择器把值抽出来。选择器是探测阶段猜的，也可以是你在界面上重选的。 */
export function applySelector(html: string, sel: FieldSelector, base?: string): string | null {
  let value: string | null = null;
  switch (sel.kind) {
    case "meta":
      value = metaContent(html, sel.query);
      break;
    case "css":
      value = cssText(html, sel.query);
      break;
    case "jsonld":
      value = jsonLdValue(html, sel.query);
      break;
    case "attr": {
      const m = html.match(new RegExp(`${sel.query}[^>]*${sel.attr ?? "src"}=["']([^"']+)["']`, "i"));
      value = m?.[1] ?? null;
      break;
    }
    case "regex": {
      try {
        const m = html.match(new RegExp(sel.query, "i"));
        value = m?.[1] ?? m?.[0] ?? null;
      } catch {
        value = null;
      }
      break;
    }
  }
  if (value && base && /^(?:\/|\.\.?\/)/.test(value)) {
    try {
      value = new URL(value, base).toString();
    } catch {
      // base 不合法就保持原样
    }
  }
  return value;
}

/** "24:11" / "PT24M11S" / "1451" 都归一成秒。 */
export function parseDuration(raw: string | null): number | null {
  if (!raw) return null;
  const text = raw.trim();

  const iso = text.match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (iso) {
    return (
      Number(iso[1] ?? 0) * 3600 + Number(iso[2] ?? 0) * 60 + Math.round(Number(iso[3] ?? 0))
    );
  }

  const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) {
    return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  }

  const plain = Number(text);
  return Number.isFinite(plain) && plain > 0 ? Math.round(plain) : null;
}

export function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,，、|/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 24)
    .slice(0, 8);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTags(s: string) {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
