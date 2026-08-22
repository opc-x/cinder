/** adapter 抓回来的原始元数据。所有站点归一到这个形状。 */
export interface RawMedia {
  /** 站内唯一 ID（视频页 ID），要能拿它重新解析出播放地址 */
  externalId: string;
  title: string;
  description?: string;
  posterUrl?: string;
  sourceUrl?: string;
  durationSec?: number;
  publishedAt?: Date;
  tags?: string[];
  streamType?: "hls" | "mp4";
  comments?: SourceComment[];
  portrait?: Portrait;
  views?: number;
}

export interface SourceComment {
  author: string;
  when?: string;
  body: string;
}

/** 给详情页一眼扫的画像。不是模型玄学，是标题/标签/时长/播放量拼出来的。 */
export interface Portrait {
  blurb: string;
  traits: string[];
  heat: string;
  length: string;
  summary?: string;
  highlights?: string[];
}

/** 播放时现场解析出来的东西。**绝对不要落库。** */
export interface Playback {
  url: string;
  type: "hls" | "mp4";
  /** 源站 CDN 校验用的请求头，代理转发时注入 */
  headers?: Record<string, string>;
}

export interface Adapter {
  id: string;
  name: string;
  homepage?: string;
  /** 元数据链路：可以慢、可以缓存、可以离线批跑 */
  list(opts?: { limit?: number }): Promise<RawMedia[]>;
  /** 播放链路：必须实时，每次重新解析 */
  resolve(externalId: string): Promise<Playback>;
}
