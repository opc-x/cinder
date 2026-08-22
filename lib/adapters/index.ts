import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { channels } from "@/lib/db/schema";
import { ConfigAdapter } from "./config";
import { DemoAdapter } from "./demo";
import { JiuseAdapter } from "./jiuse";
import { PornyAdapter } from "./porny";
import type { Adapter, Playback, RawMedia } from "./types";

export function isPagingAdapter(
  adapter: Adapter,
): adapter is Adapter & { iterate: (opts?: { limit?: number; skipIds?: Set<string> }) => AsyncIterable<RawMedia[]> } {
  return typeof (adapter as { iterate?: unknown }).iterate === "function";
}

/**
 * 写死在代码里的 adapter。要真浏览器、要登录、结构特别刁的站点写在这里；
 * 普通站点走探测出来的 ConfigAdapter，不用动代码。
 */
export const adapters: Record<string, Adapter> = {
  demo: new DemoAdapter(),
  "91porny": new PornyAdapter(),
  jiuse: new JiuseAdapter(),
};

/** 按渠道拿 adapter：内置的取注册表，探测出来的现场用 profile 造一个。 */
export async function getChannelAdapter(channelId: string): Promise<Adapter> {
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
  if (!channel) throw new Error(`没有这个渠道: ${channelId}`);

  if (channel.kind === "builtin") {
    const adapter = adapters[channel.adapter ?? channel.id];
    if (!adapter) throw new Error(`内置 adapter 没注册: ${channel.adapter ?? channel.id}`);
    return adapter;
  }
  return new ConfigAdapter(channel);
}

export { ConfigAdapter };
export type { Adapter, Playback, RawMedia } from "./types";
