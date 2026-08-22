"use client";

import { useEffect } from "react";

/**
 * 装 Service Worker。失败不影响用，只是没有离线能力。
 *
 * 注意别只挂 window 的 load 监听：React 水合完的时候页面早就 load 过了，
 * 那个事件不会再来第二次，SW 就永远装不上（这个坑踩过）。
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // dev 下 SW 会缓存住 HMR，纯添乱

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[cinder] Service Worker 没装上，离线功能不可用:", err);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
