import { eq } from "drizzle-orm";
import type { Media } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { buildTaste, generateTasteAi } from "@/lib/taste";

export async function ensureTaste(item: Media): Promise<Media> {
  const heuristic = buildTaste({ ...item, coreTags: item.coreTags });
  const ai = await generateTasteAi({
    title: item.title,
    tags: item.coreTags ?? item.tags ?? [],
    durationSec: item.durationSec,
  });
  const portrait = {
    ...heuristic,
    ...(ai ?? {}),
    traits: heuristic.traits,
    heat: heuristic.heat,
    length: heuristic.length,
  };
  await db.update(media).set({ portrait }).where(eq(media.id, item.id));
  return { ...item, portrait };
}
