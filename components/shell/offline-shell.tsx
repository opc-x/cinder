"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export function OfflineShell() {
  const [retrying, setRetrying] = useState(false);
  // null = 还在查，"none" = 浏览器压根不支持，数字 = 缓存里的页数
  const [cachedPages, setCachedPages] = useState<number | "none" | null>(null);

  // 缓存里有多少页能翻，如实告诉你，不要让离线页变成一句空话
  useEffect(() => {
    if (!("caches" in window)) {
      // 同步 setState 会触发级联渲染，推到微任务里
      queueMicrotask(() => setCachedPages("none"));
      return;
    }
    caches
      .keys()
      .then(async (keys) => {
        let n = 0;
        for (const key of keys.filter((k) => k.includes("pages"))) {
          const cache = await caches.open(key);
          n += (await cache.keys()).length;
        }
        setCachedPages(n);
      })
      .catch(() => setCachedPages("none"));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-7 pt-[env(safe-area-inset-top)] text-center">
        <div className="bg-secondary text-muted-foreground flex size-22 items-center justify-center rounded-full">
          <WifiOff className="size-9" strokeWidth={1.6} />
        </div>
        <h1 className="mt-1 text-[19px] font-semibold tracking-tight">连不上家里那台 Mac</h1>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Cinder 只在你的 Tailnet 里跑。
          <br />
          检查一下 Tailscale 是不是断了。
        </p>
        <button
          onClick={() => {
            setRetrying(true);
            location.reload();
          }}
          disabled={retrying}
          className="bg-primary text-primary-foreground mt-1.5 h-12 w-full rounded-xl text-[15px] font-medium disabled:opacity-60"
        >
          {retrying ? "重试中…" : "重试"}
        </button>
      </div>

      <div className="flex shrink-0 flex-col gap-3 px-5 pb-[calc(40px+env(safe-area-inset-bottom))]">
        <div className="bg-card border-border flex flex-col gap-2 rounded-2xl border p-3.5">
          <h2 className="text-sm font-medium">离线能翻已经看过的页</h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {cachedPages === null
              ? "正在看缓存里有什么…"
              : cachedPages === "none"
                ? "这个浏览器查不了缓存，离线内容可能有限。"
                : cachedPages > 0
                  ? `缓存里有 ${cachedPages} 个页面，可以翻。播放要等连上 —— 视频从来不落本地。`
                  : "还没有缓存的页面。连上以后浏览过的页，下次断网就能翻。"}
          </p>
          <button
            onClick={() => history.back()}
            className="border-border mt-1 h-11 rounded-xl border text-sm"
          >
            返回上一页
          </button>
        </div>
      </div>
    </div>
  );
}
