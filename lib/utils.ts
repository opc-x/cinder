import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 596 -> "9:56"，3700 -> "1:01:40" */
export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds < 0) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatDate(date?: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}
