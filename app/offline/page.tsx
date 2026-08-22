import { OfflineShell } from "@/components/shell/offline-shell";

export const metadata = { title: "离线 · Cinder" };

/**
 * 离线壳。Service Worker 在网络挂掉时兜到这一页。
 * 必须是纯静态的 —— 这页渲染的时候，后端按定义是连不上的。
 */
export default function OfflinePage() {
  return <OfflineShell />;
}
