"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CHANNEL_COOKIE } from "@/lib/channel-scope";

/** 切渠道。空字符串 = 全部渠道。 */
export async function switchChannel(channelId: string) {
  const jar = await cookies();
  if (channelId) {
    jar.set(CHANNEL_COOKIE, channelId, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } else {
    jar.delete(CHANNEL_COOKIE);
  }
  revalidatePath("/", "layout");
}
