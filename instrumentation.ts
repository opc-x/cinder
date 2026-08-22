/** 常驻进程启动时跑一次：建表 + 挂定时抓取。serverless 上这套是不成立的，这也是选常驻 Node 的原因之一。 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ready } = await import("@/lib/db");
  await ready();

  const expr = process.env.CINDER_INGEST_CRON?.trim();
  if (!expr) return;

  const cron = await import("node-cron");
  if (!cron.validate(expr)) {
    console.warn(`[cinder] CINDER_INGEST_CRON 不是合法的 cron 表达式，已跳过: ${expr}`);
    return;
  }

  const g = globalThis as typeof globalThis & { __cinderCron?: boolean };
  if (g.__cinderCron) return; // dev 下 HMR 会重跑 register
  g.__cinderCron = true;

  cron.schedule(expr, async () => {
    const { runIngest } = await import("@/lib/ingest");
    const results = await runIngest();
    console.log("[cinder] 定时抓取完成", results);
  });
  console.log(`[cinder] 定时抓取已挂上: ${expr}`);
}
