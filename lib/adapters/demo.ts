import { BaseAdapter } from "./base";
import type { Playback, RawMedia } from "./types";

/**
 * 参考实现 + 联调用的样本源，用的是各家公开的测试流。
 * 它存在的意义是把整条链路（抓取 → 打分 → 入库 → 代理 → 播放）跑通，
 * 写真实站点的 adapter 时照着这个形状抄，只换 list / resolve 两个方法的内部实现。
 */

interface DemoEntry {
  id: string;
  title: string;
  description: string;
  poster: string;
  url: string;
  type: "hls" | "mp4";
  durationSec: number;
  tags: string[];
  publishedAt: string;
}

const CATALOG: DemoEntry[] = [
  {
    id: "mux-x36xhzz",
    title: "Big Buck Bunny 4K (多码率 HLS)",
    description: "Mux 官方多码率测试流，用来验证 master 清单 → 子清单 → 分片 三层改写。",
    poster: "https://placehold.co/640x360/1c1917/f97316?text=Big+Buck+Bunny+4K",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    type: "hls",
    durationSec: 888,
    tags: ["4K", "multi-bitrate", "hls"],
    publishedAt: "2024-01-12",
  },
  {
    id: "apple-bipbop-fmp4",
    title: "Apple BipBop Advanced (fMP4)",
    description: "Apple 官方样例，带独立音轨和字幕轨，专治 EXT-X-MEDIA / EXT-X-MAP 漏改。",
    poster: "https://placehold.co/640x360/1c1917/f97316?text=BipBop+fMP4",
    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
    type: "hls",
    durationSec: 1800,
    tags: ["fmp4", "字幕", "hls", "1080p"],
    publishedAt: "2023-06-01",
  },
  {
    id: "tos-ismc",
    title: "Tears of Steel (shaka-packager)",
    description: "分离音轨 + TTML 字幕的 HLS，清单结构跟前两条都不一样。",
    poster: "https://placehold.co/640x360/1c1917/f97316?text=Tears+of+Steel",
    url: "https://test-streams.mux.dev/tos_ismc/main.m3u8",
    type: "hls",
    durationSec: 734,
    tags: ["科幻", "hls", "1080p"],
    publishedAt: "2022-11-05",
  },
  {
    id: "unified-tos",
    title: "Tears of Steel (Unified Streaming)",
    description: "另一家打包器产出的清单，验证改写逻辑不依赖某一家的格式习惯。",
    poster: "https://placehold.co/640x360/1c1917/f97316?text=Unified+Streaming",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    type: "hls",
    durationSec: 734,
    tags: ["科幻", "hls"],
    publishedAt: "2023-02-14",
  },
  {
    id: "jellyfish-1080p",
    title: "Jellyfish 1080p",
    description: "单文件 MP4，用来验证 Range 请求透传（拖进度条不能断）。",
    poster: "https://placehold.co/640x360/1c1917/f97316?text=Jellyfish+1080p",
    url: "https://test-videos.co.uk/vids/jellyfish/mp4/h264/1080/Jellyfish_1080_10s_5MB.mp4",
    type: "mp4",
    durationSec: 10,
    tags: ["mp4", "1080p", "样片"],
    publishedAt: "2021-03-18",
  },
  {
    id: "sintel-trailer-mp4",
    title: "Sintel 预告",
    description: "被 rules/default.md 的硬过滤规则挡在库外，用来证明 exclude 真的生效。",
    poster: "https://placehold.co/640x360/1c1917/f97316?text=Sintel+Trailer",
    url: "https://test-videos.co.uk/vids/sintel/mp4/h264/1080/Sintel_1080_10s_5MB.mp4",
    type: "mp4",
    durationSec: 10,
    tags: ["mp4", "预告"],
    publishedAt: "2020-09-30",
  },
];

export class DemoAdapter extends BaseAdapter {
  id = "demo";
  name = "Demo（公开测试流）";
  homepage = "https://test-streams.mux.dev";

  async list(opts?: { limit?: number }): Promise<RawMedia[]> {
    const rows = CATALOG.slice(0, opts?.limit ?? CATALOG.length);
    return rows.map((e) => ({
      externalId: e.id,
      title: e.title,
      description: e.description,
      posterUrl: e.poster,
      sourceUrl: e.url,
      durationSec: e.durationSec,
      publishedAt: new Date(e.publishedAt),
      tags: e.tags,
      streamType: e.type,
    }));
  }

  /**
   * 真实站点这里会是：打开视频页 → 等 XHR → 抽出签名清单地址。
   * 关键约束跟真实站点一致：**每次调用都重新解析**，结果不进 DB。
   */
  async resolve(externalId: string): Promise<Playback> {
    const entry = CATALOG.find((e) => e.id === externalId);
    if (!entry) throw new Error(`demo: 未知的 externalId ${externalId}`);
    return {
      url: entry.url,
      type: entry.type,
      headers: { referer: this.homepage, origin: new URL(this.homepage).origin },
    };
  }
}
