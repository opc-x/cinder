import { BaseAdapter } from "./base";
import { PER_PAGE, parseCards, parsePlayback } from "./kvs-cms";
import type { Playback, RawMedia } from "./types";

const ORIGIN = "https://91porny.com";
const LIST = `${ORIGIN}/search?keywords=${encodeURIComponent("呆哥")}&time=year1`;

/**
 * 91porny 搜索列表。探测走不通：Cloudflare + 本机 DNS 污染。
 * 页面本身是服务端渲染，不需要 playwright —— 过代理把 HTML 拉回来就能抽。
 * 播放地址在详情页 `#video-play[data-src]`，带签名，resolve 时现场拿，不入库。
 */
export class PornyAdapter extends BaseAdapter {
  id = "91porny";
  name = "91porny · 呆哥";
  homepage = ORIGIN;

  async list(opts?: { limit?: number }): Promise<RawMedia[]> {
    const limit = opts?.limit ?? 50;
    const maxPages = Math.max(1, Math.ceil(limit / PER_PAGE));
    const seen = new Set<string>();
    const out: RawMedia[] = [];

    for (let page = 1; page <= maxPages && out.length < limit; page++) {
      const url = page === 1 ? LIST : `${LIST}&page=${page}`;
      const html = await this.fetchText(url);
      for (const item of parseCards(html, ["呆哥"])) {
        if (seen.has(item.externalId)) continue;
        seen.add(item.externalId);
        out.push({ ...item, sourceUrl: new URL(item.externalId, ORIGIN).toString() });
        if (out.length >= limit) break;
      }
    }

    if (!out.length) throw new Error("91porny: 搜索页一个视频卡片都没抽到，HTML 可能改版了");
    return out;
  }

  async resolve(externalId: string): Promise<Playback> {
    const pageUrl = new URL(externalId, ORIGIN).toString();
    const html = await this.fetchText(pageUrl);
    return parsePlayback(html, pageUrl, ORIGIN);
  }
}
