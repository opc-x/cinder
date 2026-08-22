import { buildPortrait } from "@/lib/portrait";
import { BaseAdapter, DEFAULT_UA } from "./base";
import { parseCards, parseDetail, parsePlayback } from "./kvs-cms";
import type { Playback, RawMedia } from "./types";
import { upstreamFetch } from "@/lib/http";

const CANDIDATES = ["https://jiuse.io", "https://91porny.com"];
const SECTIONS = [
  { path: "/videos", tag: "91视频" },
  { path: "/video", tag: "蝌蚪" },
];

export interface JiuseIterateOpts {
  limit?: number;
  /** 库里已经有的 externalId，翻页时直接跳过，避免把前几百页重抓一遍 */
  skipIds?: Set<string>;
}

/**
 * 九色全站目录。默认翻到空页为止，不设 240 这种假上限。
 * jiuse.io / 91porny 同一套 CMS；哪个域名活着用哪个。
 */
export class JiuseAdapter extends BaseAdapter {
  id = "jiuse";
  name = "九色 · jiuse";
  homepage = CANDIDATES[0];

  private origin = CANDIDATES[0];

  async list(opts?: { limit?: number }): Promise<RawMedia[]> {
    const out: RawMedia[] = [];
    for await (const batch of this.iterate({ limit: opts?.limit })) {
      out.push(...batch);
    }
    return out;
  }

  async *iterate(opts?: JiuseIterateOpts): AsyncGenerator<RawMedia[]> {
    const limit = opts?.limit ?? Number.POSITIVE_INFINITY;
    this.origin = await this.pickOrigin();
    this.homepage = this.origin;

    const seen = new Set<string>();
    let total = 0;

    for (const section of SECTIONS) {
      let emptyStreak = 0;
      for (let page = 1; total < limit; page++) {
        const url = listUrl(this.origin, section.path, page);
        let html: string;
        try {
          html = await this.fetchRetry(url);
        } catch (err) {
          console.warn(`[jiuse] 列表失败，30s 后重抓同一页 ${url}: ${(err as Error).message}`);
          await sleep(30_000);
          page--;
          continue;
        }

        const cards = parseCards(html, [section.tag]);
        if (!cards.length) {
          emptyStreak++;
          if (emptyStreak >= 2) break;
          continue;
        }

        const batch: RawMedia[] = [];
        let fresh = 0;
        for (const item of cards) {
          if (seen.has(item.externalId) || opts?.skipIds?.has(item.externalId)) {
            seen.add(item.externalId);
            continue;
          }
          seen.add(item.externalId);
          fresh++;
          item.sourceUrl = new URL(item.externalId, this.origin).toString();
          batch.push(item);
          total++;
          if (total >= limit) break;
        }

        if (!batch.length) {
          if (total > 0) {
            emptyStreak++;
            if (emptyStreak >= 3) break;
          }
          continue;
        }
        emptyStreak = 0;

        await mapPool(batch, 8, async (item) => {
          try {
            const pageUrl = new URL(item.externalId, this.origin).toString();
            const detailHtml = await this.fetchRetry(pageUrl);
            const detail = parseDetail(detailHtml);
            item.description = detail.description ?? item.description;
            item.comments = detail.comments;
            item.views = detail.views;
            item.tags = uniqTags([...(item.tags ?? []), ...detail.tags, lengthTag(item.durationSec)]);
            item.portrait = buildPortrait(item);
          } catch {
            item.portrait = buildPortrait(item);
            item.tags = uniqTags([...(item.tags ?? []), lengthTag(item.durationSec)]);
          }
        });

        console.log(`[jiuse] ${section.tag} p${page} +${batch.length} 累计 ${total}`);
        yield batch;
        if (total >= limit) return;
      }
    }

    if (!total) throw new Error("jiuse: 整站列表一张卡片都没有，域名全挂了或 HTML 改版");
  }

  async resolve(externalId: string): Promise<Playback> {
    const pageUrl = new URL(externalId, this.origin || this.homepage).toString();
    const html = await this.fetchRetry(pageUrl);
    return parsePlayback(html, pageUrl, new URL(pageUrl).origin);
  }

  private async pickOrigin(): Promise<string> {
    for (let round = 1; ; round++) {
      for (const origin of CANDIDATES) {
        try {
          const html = await this.fetchRetry(`${origin}/videos`);
          if (parseCards(html).length) {
            console.log(`[jiuse] 用源 ${origin}`);
            return origin;
          }
        } catch (err) {
          console.warn(`[jiuse] ${origin} 不可用: ${(err as Error).message}`);
        }
      }
      const wait = Math.min(120_000, 15_000 * round);
      console.warn(`[jiuse] 两个入口都挂，${wait / 1000}s 后再探（第 ${round} 轮）`);
      await sleep(wait);
    }
  }

  private async fetchRetry(url: string): Promise<string> {
    let last = "unknown";
    for (let i = 0; i < 4; i++) {
      try {
        const res = await upstreamFetch(url, {
          headers: {
            "user-agent": DEFAULT_UA,
            referer: `${this.origin}/`,
          },
          cache: "no-store",
        });
        const text = await res.text();
        if (res.ok && text.length > 200 && !text.startsWith("error code:")) return text;
        last = `HTTP ${res.status} ${text.slice(0, 40)}`;
      } catch (err) {
        last = (err as Error).message;
      }
      const wait = Math.min(20_000, 600 * 2 ** i);
      console.warn(`[jiuse] 重试 ${i + 1}/4 ${url} (${last}) ${wait}ms`);
      await sleep(wait);
    }
    throw new Error(`jiuse: 多次失败 ${url} (${last})`);
  }
}

function listUrl(origin: string, path: string, page: number): string {
  const url = new URL(path, origin);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.toString();
}

function uniqTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t && !/^\d+$/.test(t)))];
}

function lengthTag(sec?: number): string {
  if (!sec) return "";
  if (sec >= 20 * 60) return "长片";
  if (sec >= 8 * 60) return "中篇";
  return "短片";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, Math.max(items.length, 1)) }, () => worker()));
}
