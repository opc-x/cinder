import type { Channel, ChannelProfile } from "@/lib/db/schema";
import { applySelector, parseDate, parseDuration, parseTags } from "@/lib/channels/extract";
import { BaseAdapter } from "./base";
import type { Playback, RawMedia } from "./types";

/**
 * 探测出来的渠道走这个 adapter —— 配置驱动，不用写代码。
 * profile 里存的就是探测阶段猜、你在界面上确认过的那套选择器。
 */
export class ConfigAdapter extends BaseAdapter {
  id: string;
  name: string;
  homepage: string;
  private profile: ChannelProfile;

  constructor(channel: Channel) {
    super();
    if (!channel.profile) throw new Error(`渠道 ${channel.id} 没有抓取配置，没法抓`);
    this.id = channel.id;
    this.name = channel.name;
    this.homepage = channel.rootUrl;
    this.profile = channel.profile;
  }

  async list(opts?: { limit?: number }): Promise<RawMedia[]> {
    const limit = opts?.limit ?? 50;
    const urls = (await this.collectUrls(limit)).slice(0, limit);
    if (!urls.length) throw new Error("列表里一个详情页地址都没拿到");

    const out: RawMedia[] = [];
    let emptyTitles = 0;

    for (const url of urls) {
      const html = await this.fetchText(url).catch(() => null);
      if (!html) continue;

      const sel = this.profile.selectors;
      const title = sel.title ? applySelector(html, sel.title, url) : null;
      if (!title) {
        emptyTitles++;
        continue;
      }

      out.push({
        externalId: url,
        title,
        posterUrl: sel.poster ? applySelector(html, sel.poster, url) ?? undefined : undefined,
        sourceUrl: url,
        durationSec: parseDuration(sel.duration ? applySelector(html, sel.duration, url) : null) ?? undefined,
        publishedAt: parseDate(sel.published ? applySelector(html, sel.published, url) : null) ?? undefined,
        tags: parseTags(sel.tags ? applySelector(html, sel.tags, url) : null),
        streamType: "hls",
      });
    }

    // 全空说明选择器废了（站点改版 / 其实是 JS 渲染），要明确报错而不是抓回一堆空货
    if (!out.length && emptyTitles > 0) {
      throw new Error(`${emptyTitles} 个页面全都没抓到标题，选择器可能失效了，去渠道管理里重新映射`);
    }
    return out;
  }

  /** 播放地址每次现场解析，绝不落库。 */
  async resolve(externalId: string): Promise<Playback> {
    const sel = this.profile.selectors.stream;
    if (!sel) throw new Error(`渠道 ${this.id} 没配播放清单的抽取方式`);

    const html = await this.fetchText(externalId);
    const url = applySelector(html, sel, externalId);
    if (!url) throw new Error("详情页里没找到播放地址，可能要登录或者是 JS 动态塞进去的");

    return {
      url,
      type: url.includes(".m3u8") ? "hls" : "mp4",
      headers: { referer: externalId, origin: new URL(this.homepage).origin },
    };
  }

  /** 按 profile 的策略拿详情页地址清单。 */
  private async collectUrls(limit: number): Promise<string[]> {
    const { strategy, listUrl, detailPattern } = this.profile;
    const filter = (urls: string[]) => {
      const uniq = [...new Set(urls)];
      if (!detailPattern) return uniq;
      try {
        const re = new RegExp(detailPattern);
        return uniq.filter((u) => re.test(u));
      } catch {
        return uniq;
      }
    };

    if (strategy === "sitemap") {
      const xml = await this.fetchText(listUrl);
      return filter([...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]));
    }

    if (strategy === "feed") {
      const xml = await this.fetchText(listUrl);
      const links = [
        ...xml.matchAll(/<link[^>]*>([^<]+)<\/link>/gi),
        ...xml.matchAll(/<link[^>]+href=["']([^"']+)["']/gi),
      ].map((m) => m[1].trim());
      return filter(links.filter((u) => /^https?:\/\//.test(u)));
    }

    // pager：一页页翻，直到够数或到上限
    const urls: string[] = [];
    const maxPages = this.profile.maxPages ?? 5;
    for (let page = 1; page <= maxPages && urls.length < limit; page++) {
      const pageUrl = listUrl.includes("{page}") ? listUrl.replace("{page}", String(page)) : listUrl;
      const html = await this.fetchText(pageUrl).catch(() => null);
      if (!html) break;

      const found = [...html.matchAll(/href=["']([^"']+)["']/gi)]
        .map((m) => {
          try {
            return new URL(m[1], pageUrl).toString();
          } catch {
            return null;
          }
        })
        .filter((u): u is string => !!u && u.startsWith(new URL(this.homepage).origin));
      urls.push(...found);

      if (!listUrl.includes("{page}")) break; // 没有翻页规律，只有一页
    }
    return filter(urls);
  }
}
