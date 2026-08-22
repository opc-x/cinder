import { cookies } from "next/headers";

/**
 * 当前渠道作用域。跟切语言一个意思：存一份、全局生效、页面不变。
 * 用 cookie 而不是 URL 参数 —— 换页面不该丢作用域。
 */
const COOKIE = "cinder_channel";

export async function currentChannel(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value || undefined;
}

export const CHANNEL_COOKIE = COOKIE;
