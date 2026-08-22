import { DEFAULT_UA } from "@/lib/adapters/base";
import type { ChannelProfile, FieldSelector } from "@/lib/db/schema";
import { applySelector, metaContent, parseDate, parseDuration, parseTags } from "./extract";

/**
 * 「录一个首页地址就能扫」是做不到的 —— 每个站的结构都不一样。
 * 能做到的是：探测 + 让你点几下确认。这个文件是探测那半边。
 */

export interface ProbeStep {
  key: "sitemap" | "feed" | "pager";
  label: string;
  state: "ok" | "none" | "error";
  detail: string;
  listUrl?: string;
  urls?: string[];
}

export interface ProbeResult {
  rootUrl: string;
  name: string;
  steps: ProbeStep[];
  /** 探测选中的最佳策略，没有就是 null，那种站点只能写 adapter */
  best: {
    strategy: ChannelProfile["strategy"];
    listUrl: string;
    urls: string[];
    /** 猜出来的详情页路径规律，抓取时用它把「关于我们」这类页面挡在外面 */
    detailPattern?: string;
  } | null;
}

const TIMEOUT = 12_000;

async function get(url: string, referer?: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": DEFAULT_UA, ...(referer ? { referer } : {}) },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function probeChannel(rootInput: string): Promise<ProbeResult> {
  const root = normalizeRoot(rootInput);
  const steps: ProbeStep[] = [];

  // 1. sitemap —— 最省事的一条路，有就直接拿到全站页面清单
  const sitemap = await probeSitemap(root);
  steps.push(sitemap);

  // 2. RSS / Atom —— 拿不到全量但拿得到最新，很多站都有
  const feed = await probeFeed(root);
  steps.push(feed);

  // 3. 列表页翻页规律 —— 前两条都没有时的退路
  const pager = await probePager(root);
  steps.push(pager);

  const ranked = [sitemap, feed, pager]
    .filter((s) => s.state === "ok" && s.listUrl && s.urls?.length)
    .sort((a, b) => (b.urls?.length ?? 0) - (a.urls?.length ?? 0));

  const winner = ranked[0];
  if (!winner) {
    return { rootUrl: root, name: hostName(root), steps, best: null };
  }

  const { pattern, urls } = narrowToDetailPages(winner.urls!);
  return {
    rootUrl: root,
    name: hostName(root),
    steps,
    best: {
      strategy: winner.key,
      listUrl: winner.listUrl!,
      urls: urls.slice(0, 200),
      detailPattern: pattern,
    },
  };
}

function hostName(root: string): string {
  return new URL(root).hostname.replace(/^www\./, "");
}

/**
 * sitemap 里什么都有：关于页、标签页、真正的详情页。
 * 按「路径形状」分组（数字和 slug 归一成占位符），取最大的一组当详情页。
 * 不这么做，抽样就会抽到「关于我们」，然后字段命中率白白掉一截。
 */
function narrowToDetailPages(urls: string[]): { pattern?: string; urls: string[] } {
  const groups = new Map<string, string[]>();

  for (const url of urls) {
    let shape: string;
    try {
      const segs = new URL(url).pathname.split("/").filter(Boolean);
      if (!segs.length) continue;
      // 末段一般是 id / slug，归一掉；保留前面的路径前缀当形状
      shape = segs
        .slice(0, -1)
        .concat(segs.length > 1 ? ["*"] : [])
        .join("/");
      if (segs.length === 1) shape = "*";
    } catch {
      continue;
    }
    const bucket = groups.get(shape) ?? [];
    bucket.push(url);
    groups.set(shape, bucket);
  }

  const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const [shape, bucket] = ranked[0] ?? [];

  // 最大的一组占比太低说明这站没有统一的详情页形状，那就别乱猜，全都留着
  if (!shape || !bucket || bucket.length < Math.max(3, urls.length * 0.2)) {
    return { urls };
  }

  const prefix = shape.replace(/\/?\*$/, "");
  return {
    pattern: prefix ? `/${escapeRegex(prefix)}/[^/]+/?$` : undefined,
    urls: bucket,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRoot(input: string): string {
  const trimmed = input.trim();
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withProto);
  return `${u.protocol}//${u.host}`;
}

async function probeSitemap(root: string): Promise<ProbeStep> {
  const candidates = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml"];

  // robots.txt 里常常直接写了 sitemap 在哪，先看它
  const robots = await get(`${root}/robots.txt`);
  if (robots) {
    for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) candidates.unshift(m[1]);
  }

  for (const path of candidates) {
    const url = path.startsWith("http") ? path : `${root}${path}`;
    const xml = await get(url);
    if (!xml || !xml.includes("<loc")) continue;

    let locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

    // sitemap index：再下一层拿真正的页面清单
    if (/<sitemapindex/i.test(xml) && locs.length) {
      const child = await get(locs[0]);
      if (child) locs = [...child.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    }

    if (locs.length) {
      return {
        key: "sitemap",
        label: "sitemap.xml",
        state: "ok",
        detail: `${locs.length.toLocaleString()} 个页面`,
        listUrl: url,
        urls: locs,
      };
    }
  }
  return { key: "sitemap", label: "sitemap.xml", state: "none", detail: "没有" };
}

async function probeFeed(root: string): Promise<ProbeStep> {
  const candidates = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"];

  const home = await get(root);
  if (home) {
    for (const m of home.matchAll(
      /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/gi,
    )) {
      candidates.unshift(new URL(m[1], root).toString());
    }
  }

  for (const path of candidates) {
    const url = path.startsWith("http") ? path : `${root}${path}`;
    const xml = await get(url);
    if (!xml) continue;
    const links = [
      ...xml.matchAll(/<link[^>]*>([^<]+)<\/link>/gi),
      ...xml.matchAll(/<link[^>]+href=["']([^"']+)["']/gi),
    ]
      .map((m) => m[1].trim())
      .filter((u) => /^https?:\/\//.test(u) && u !== root);

    if (links.length) {
      return {
        key: "feed",
        label: "RSS / Atom",
        state: "ok",
        detail: `${links.length} 条最新`,
        listUrl: url,
        urls: [...new Set(links)],
      };
    }
  }
  return { key: "feed", label: "RSS / Atom", state: "none", detail: "没有" };
}

async function probePager(root: string): Promise<ProbeStep> {
  const home = await get(root);
  if (!home) {
    return { key: "pager", label: "列表页规律", state: "error", detail: "首页打不开" };
  }

  const hrefs = [...home.matchAll(/href=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith("#") && !h.startsWith("mailto:") && !h.startsWith("javascript:"));

  // 找带页码的链接：?page=2 / /page/2 / ?p=2
  const pagerHit = hrefs.find((h) => /[?&](?:page|p|pg)=\d+|\/page\/\d+/i.test(h));
  const listUrl = pagerHit
    ? new URL(pagerHit, root).toString().replace(/(\d+)(?!.*\d)/, "{page}")
    : root;

  // 详情页 URL 通常比列表页深一层，且路径里带数字或 slug
  const same = hrefs
    .map((h) => {
      try {
        return new URL(h, root).toString();
      } catch {
        return null;
      }
    })
    .filter((u): u is string => !!u && u.startsWith(root));
  const detail = [...new Set(same)].filter((u) => {
    const p = new URL(u).pathname.replace(/\/$/, "");
    return p.split("/").filter(Boolean).length >= 2;
  });

  if (!detail.length) {
    return { key: "pager", label: "列表页规律", state: "none", detail: "首页上没找到详情页链接" };
  }

  return {
    key: "pager",
    label: "列表页规律",
    state: "ok",
    detail: pagerHit ? `${listUrl.replace(root, "")} · 翻页` : "只有首页一层",
    listUrl,
    urls: detail,
  };
}

// ---------------------------------------------------------------------------

export interface FieldGuess {
  field: keyof ChannelProfile["selectors"];
  label: string;
  selector: FieldSelector | null;
  /** 样本里抽出来的值，界面上给你看的就是这个 */
  sample: string | null;
  hit: number;
  total: number;
}

export interface SampleResult {
  sampleUrls: string[];
  fields: FieldGuess[];
  /** 三个样本全空 —— 基本可以断定这站是 JS 渲染的，走不了这条路 */
  looksClientRendered: boolean;
}

/** 每个字段按顺序试几个候选选择器，谁在样本里命中得多就用谁。 */
const CANDIDATES: Record<
  string,
  { label: string; tries: FieldSelector[]; accept?: (v: string) => boolean }
> = {
  title: {
    label: "标题",
    tries: [
      { kind: "meta", query: "og:title" },
      { kind: "jsonld", query: "name" },
      { kind: "meta", query: "twitter:title" },
      { kind: "css", query: "h1" },
      { kind: "regex", query: "<title[^>]*>([^<]+)</title>" },
    ],
  },
  poster: {
    label: "封面",
    tries: [
      { kind: "meta", query: "og:image" },
      { kind: "jsonld", query: "thumbnailUrl" },
      { kind: "meta", query: "twitter:image" },
    ],
  },
  duration: {
    label: "时长",
    tries: [
      { kind: "meta", query: "og:video:duration" },
      { kind: "jsonld", query: "duration" },
      { kind: "meta", query: "video:duration" },
      { kind: "regex", query: '"duration"\\s*:\\s*"?([0-9:PTHMS.]+)"?' },
    ],
  },
  published: {
    label: "发布",
    tries: [
      { kind: "meta", query: "article:published_time" },
      { kind: "jsonld", query: "uploadDate" },
      { kind: "jsonld", query: "datePublished" },
      { kind: "meta", query: "og:video:release_date" },
    ],
  },
  tags: {
    label: "标签",
    tries: [
      { kind: "meta", query: "article:tag" },
      { kind: "jsonld", query: "keywords" },
      { kind: "meta", query: "keywords" },
    ],
  },
  stream: {
    label: "播放清单",
    // 抽到的必须真的是个清单/媒体地址。og:video 经常是「嵌入页」，
    // 拿它去播只会把一坨 HTML 喂给播放器 —— 那种失败要在这一步就暴露，不能拖到播放时。
    accept: (v) => /\.(m3u8|mpd|mp4|m4s|webm)(\?|#|$)/i.test(v),
    tries: [
      { kind: "regex", query: "(https?://[^\"'\\s]+\\.m3u8[^\"'\\s]*)" },
      { kind: "regex", query: "(https?://[^\"'\\s]+\\.mp4[^\"'\\s]*)" },
      { kind: "meta", query: "og:video:secure_url" },
      { kind: "meta", query: "og:video" },
    ],
  },
};

export async function sampleChannel(urls: string[], referer: string): Promise<SampleResult> {
  const picks = pickSpread(urls, 3);
  const pages: { url: string; html: string }[] = [];
  for (const url of picks) {
    const html = await get(url, referer);
    if (html) pages.push({ url, html });
  }

  const fields: FieldGuess[] = [];
  for (const [field, cfg] of Object.entries(CANDIDATES)) {
    let best: FieldGuess = {
      field: field as keyof ChannelProfile["selectors"],
      label: cfg.label,
      selector: null,
      sample: null,
      hit: 0,
      total: pages.length,
    };

    for (const sel of cfg.tries) {
      let hit = 0;
      let sample: string | null = null;
      for (const page of pages) {
        const v = applySelector(page.html, sel, page.url);
        if (v && (!cfg.accept || cfg.accept(v))) {
          hit++;
          sample ??= v;
        }
      }
      if (hit > best.hit) {
        best = {
          ...best,
          selector: { ...sel, confidence: { hit, total: pages.length } },
          sample: prettify(field, sample),
          hit,
        };
      }
      if (hit === pages.length) break; // 全中就不用再试后面的候选了
    }
    fields.push(best);
  }

  const titleGuess = fields.find((f) => f.field === "title");
  return {
    sampleUrls: pages.map((p) => p.url),
    fields,
    looksClientRendered: pages.length > 0 && (titleGuess?.hit ?? 0) === 0,
  };
}

function prettify(field: string, raw: string | null): string | null {
  if (!raw) return null;
  if (field === "duration") {
    const secs = parseDuration(raw);
    if (secs === null) return raw;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  if (field === "published") {
    const d = parseDate(raw);
    return d ? d.toISOString().slice(0, 10) : raw;
  }
  if (field === "tags") return parseTags(raw).join(" · ") || raw;
  return raw.length > 60 ? `${raw.slice(0, 58)}…` : raw;
}

/** 从头中尾各取一个，比连着取三个更能暴露结构不一致（比如混进了直播页）。 */
function pickSpread<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const step = Math.floor(list.length / n);
  return Array.from({ length: n }, (_, i) => list[i * step]);
}

export { metaContent };
