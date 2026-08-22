import { upstreamFetch } from "@/lib/http";
import type { Adapter, Playback, RawMedia } from "./types";

export const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export abstract class BaseAdapter implements Adapter {
  abstract id: string;
  abstract name: string;
  homepage?: string;

  abstract list(opts?: { limit?: number }): Promise<RawMedia[]>;
  abstract resolve(externalId: string): Promise<Playback>;

  protected async fetchText(url: string, init?: RequestInit): Promise<string> {
    const res = await upstreamFetch(url, {
      ...init,
      headers: {
        "user-agent": DEFAULT_UA,
        ...(this.homepage ? { referer: this.homepage } : {}),
        ...(init?.headers as Record<string, string> | undefined),
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${this.id}: GET ${url} -> ${res.status}`);
    return res.text();
  }

  /**
   * 需要真浏览器（重 JS 渲染 / 要监听 XHR 拿真实清单）的站点走这里。
   * playwright 是可选依赖：没装就明确报错，而不是甩一个看不懂的堆栈给调用方。
   * 装好之后把 BrowserContextLike 换成 `import("playwright").BrowserContext` 即可。
   */
  protected async withBrowser<T>(fn: (ctx: BrowserContextLike) => Promise<T>): Promise<T> {
    let chromium: { launch(opts: { headless: boolean }): Promise<BrowserLike> };
    try {
      // 用 Function 包一层：playwright 没装时，打包器不会因为解析不到而报错。
      const importModule = new Function("m", "return import(m)") as (
        m: string,
      ) => Promise<{ chromium: typeof chromium }>;
      ({ chromium } = await importModule("playwright"));
    } catch {
      throw new Error(
        `adapter "${this.id}" 需要 playwright：npm i playwright && npx playwright install chromium`,
      );
    }
    const browser = await chromium.launch({ headless: true });
    try {
      return await fn(await browser.newContext({ userAgent: DEFAULT_UA }));
    } finally {
      await browser.close();
    }
  }
}

/** playwright 没装时也能过类型检查的最小结构类型。 */
export interface BrowserContextLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}
export interface PageLike {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  content(): Promise<string>;
  waitForResponse(
    predicate: (res: { url(): string; status(): number }) => boolean,
    opts?: { timeout?: number },
  ): Promise<{ url(): string; text(): Promise<string> }>;
  close(): Promise<void>;
}
interface BrowserLike {
  newContext(opts: { userAgent: string }): Promise<BrowserContextLike>;
  close(): Promise<void>;
}
