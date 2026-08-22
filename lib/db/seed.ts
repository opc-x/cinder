import { eq, like, sql } from "drizzle-orm";
import { adapters } from "@/lib/adapters";
import { loadFileRules } from "@/lib/rules/load";
import { db } from "./index";
import { channels, rules } from "./schema";

/**
 * 内置 adapter 和 rules/*.md 是「代码里的事实」，每次启动同步进库一次。
 * 探测出来的渠道和你自己说出来的规则不在这里，它们只活在库里。
 */
export async function seedBuiltins() {
  for (const adapter of Object.values(adapters)) {
    await db
      .insert(channels)
      .values({
        id: adapter.id,
        name: adapter.name,
        rootUrl: adapter.homepage ?? "",
        kind: "builtin",
        adapter: adapter.id,
        enabled: true,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: channels.id,
        set: {
          name: adapter.name,
          rootUrl: adapter.homepage ?? "",
          kind: "builtin",
          adapter: adapter.id,
        },
      });
  }

  await db
    .update(channels)
    .set({ lastError: null })
    .where(like(channels.lastError, "%没注册%"));

  const { retagLibrary } = await import("@/lib/retag");
  await retagLibrary();

  // rules/*.md 只在库里没有同 id 规则时导入一次，之后以库为准（你在界面上改的算数）。
  const fileRules = await loadFileRules();
  for (const r of fileRules) {
    const [existing] = await db.select({ id: rules.id }).from(rules).where(eq(rules.id, r.id));
    if (existing) continue;
    await db.insert(rules).values({ ...r, createdAt: new Date() });
  }
}

export async function countRules(): Promise<number> {
  const [row] = await db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rules`);
  return row?.n ?? 0;
}
