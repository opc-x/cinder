import { eq } from "drizzle-orm";
import { extractFeatures } from "@/lib/features";
import { buildTaste } from "@/lib/taste";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";

/** 重打核心标签、画像，观赏性按片本身打 1–100。 */
export async function retagLibrary() {
  const rows = await db.select().from(media);
  for (const row of rows) {
    const pack = extractFeatures(row);
    const taste = buildTaste({ ...row, coreTags: pack.coreTags });
    await db
      .update(media)
      .set({
        coreTags: pack.coreTags,
        watchability: pack.watchability,
        portrait: taste,
      })
      .where(eq(media.id, row.id));
  }
  return rows.length;
}
