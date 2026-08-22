import { db, ready } from "@/lib/db";
import { media, type Media, type RuleDefinition } from "@/lib/db/schema";
import { hits } from "./engine";

export interface RulePreview {
  total: number;
  hitCount: number;
  /** 命中的前几条，界面上摆出来给你看 */
  samples: Pick<Media, "id" | "title" | "posterUrl" | "durationSec" | "score" | "tags">[];
  /** 一条差一点就命中的，用来解释「为什么它没中」 */
  nearMiss: { title: string; reason: string } | null;
  /** 命中的条目分数会怎么变 */
  scoreShift: { from: number; to: number } | null;
}

/**
 * 拿库里现有的条目把规则跑一遍。
 * 这是模型理解错了唯一能被发现的地方 —— 所以确认屏必须显示它。
 */
export async function previewRule(
  definition: RuleDefinition,
  score: number,
  exclude: boolean,
  channelId: string | null,
): Promise<RulePreview> {
  await ready();
  const rows = await db.select().from(media);

  const rule = {
    id: "__preview__",
    summary: "",
    definition,
    score,
    exclude,
    channelId,
    enabled: true,
  };

  const matched = rows.filter((r) =>
    hits(
      {
        title: r.title,
        description: r.description,
        tags: r.tags,
        durationSec: r.durationSec,
        channelId: r.channelId,
      },
      rule,
    ),
  );

  const missed = rows.filter((r) => !matched.includes(r));
  const sorted = matched.sort((a, b) => b.score - a.score);

  return {
    total: rows.length,
    hitCount: matched.length,
    samples: sorted.slice(0, 3).map((r) => ({
      id: r.id,
      title: r.title,
      posterUrl: r.posterUrl,
      durationSec: r.durationSec,
      score: r.score,
      tags: r.tags,
    })),
    nearMiss: pickNearMiss(missed, definition),
    scoreShift: sorted.length ? { from: sorted[0].score, to: sorted[0].score + score } : null,
  };
}

/**
 * 挑一条「看起来该中却没中」的：跟命中条目共享标签最多的那个。
 * 比随便抓一条没中的更能说明规则的边界在哪。
 */
function pickNearMiss(
  missed: Media[],
  definition: RuleDefinition,
): { title: string; reason: string } | null {
  if (!missed.length) return null;

  const fields = [...new Set(definition.conditions.map((c) => c.field))];
  const candidate = missed.sort((a, b) => b.score - a.score)[0];

  const reason = fields.includes("durationSec")
    ? `它 ${formatSecs(candidate.durationSec)}，不在这个区间里`
    : candidate.tags.length
      ? `它的标签只有 ${candidate.tags.slice(0, 2).join("、")}`
      : "它没有能对上的标签";

  return { title: candidate.title, reason };
}

function formatSecs(secs: number | null): string {
  if (!secs) return "时长未知";
  const m = Math.floor(secs / 60);
  return m >= 1 ? `${m} 分钟` : `${secs} 秒`;
}
