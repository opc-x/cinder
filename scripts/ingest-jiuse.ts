import { sql } from "drizzle-orm";
import { runIngest } from "../lib/ingest";
import { db, ready } from "../lib/db";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await ready();
  console.log("[ingest] jiuse 全站翻页，源站挂了就等，不设条数上限");
  for (;;) {
    try {
      const results = await runIngest({ channelId: "jiuse" });
      if (results[0]?.error) {
        console.warn("[ingest] 本轮失败，60s 后再扫", results[0].error);
        await sleep(60_000);
        continue;
      }
      console.log(JSON.stringify(results, null, 2));
      const rows = await db.all<{ n: number }>(
        sql`SELECT COUNT(*) AS n FROM media WHERE channel_id = 'jiuse'`,
      );
      console.log("jiuse total", rows[0]?.n, "60s 后再扫，直到源站真没页");
      await sleep(60_000);
    } catch (err) {
      console.warn("[ingest] 异常，60s 后再扫", err);
      await sleep(60_000);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
