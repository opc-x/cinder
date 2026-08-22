import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import path from "node:path";
import * as schema from "./schema";

/**
 * 单用户单机：一个本地文件就是全部数据库。没有连接池、没有网络往返。
 * 建表用手写 SQL，不引 drizzle-kit —— 这个规模上 migration 工具链的成本
 * 高于收益，schema 变了直接改下面的 DDL + migrate()。
 */

const dbFile = process.env.CINDER_DB_FILE ?? "./data/cinder.db";
// turbopackIgnore：路径运行时才定，不希望打包器因此把整个仓库 trace 进产物
const dbUrl = `file:${path.resolve(/* turbopackIgnore: true */ process.cwd(), dbFile)}`;

// dev 下 HMR 会重复求值模块，用 globalThis 兜住，避免开一堆句柄。
const g = globalThis as typeof globalThis & {
  __cinderClient?: Client;
  __cinderReady?: Promise<void>;
};

const client = (g.__cinderClient ??= createClient({ url: dbUrl }));

export const db = drizzle(client, { schema });

const PRAGMAS = [`PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`];

/** 新库直接建；老库先走 migrate() 把表结构搬过来，再补这些。 */
const DDL_TABLES = [
  `CREATE TABLE IF NOT EXISTS channels (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     root_url TEXT NOT NULL,
     kind TEXT NOT NULL DEFAULT 'probed',
     adapter TEXT,
     profile TEXT,
     enabled INTEGER NOT NULL DEFAULT 1,
     last_run_at INTEGER,
     last_error TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS media (
     id TEXT PRIMARY KEY,
     channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
     external_id TEXT NOT NULL,
     title TEXT NOT NULL,
     description TEXT,
     poster_url TEXT,
     source_url TEXT,
     duration_sec INTEGER,
     published_at INTEGER,
     tags TEXT NOT NULL DEFAULT '[]',
     core_tags TEXT NOT NULL DEFAULT '[]',
     comments TEXT NOT NULL DEFAULT '[]',
     portrait TEXT,
     stream_type TEXT NOT NULL DEFAULT 'hls',
     score INTEGER NOT NULL DEFAULT 0,
     watchability INTEGER NOT NULL DEFAULT 0,
     excluded INTEGER NOT NULL DEFAULT 0,
     matched_rules TEXT NOT NULL DEFAULT '[]',
     favorite INTEGER NOT NULL DEFAULT 0,
     watched_at INTEGER,
     first_seen_at INTEGER NOT NULL,
     last_seen_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS rules (
     id TEXT PRIMARY KEY,
     said TEXT NOT NULL,
     summary TEXT NOT NULL,
     definition TEXT NOT NULL,
     score INTEGER NOT NULL DEFAULT 0,
     exclude INTEGER NOT NULL DEFAULT 0,
     channel_id TEXT,
     enabled INTEGER NOT NULL DEFAULT 1,
     origin TEXT NOT NULL DEFAULT 'ai',
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS ingest_runs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     channel_id TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     finished_at INTEGER,
     added INTEGER NOT NULL DEFAULT 0,
     updated INTEGER NOT NULL DEFAULT 0,
     error TEXT
   )`,
];

const DDL_INDEXES = [
  `CREATE INDEX IF NOT EXISTS media_channel_idx ON media(channel_id)`,
  `CREATE INDEX IF NOT EXISTS media_score_idx ON media(score)`,
  `CREATE INDEX IF NOT EXISTS media_last_seen_idx ON media(last_seen_at)`,
  `CREATE INDEX IF NOT EXISTS media_watchability_idx ON media(watchability)`,
  `CREATE INDEX IF NOT EXISTS rules_enabled_idx ON rules(enabled)`,
];

async function tableExists(name: string): Promise<boolean> {
  const r = await client.execute({
    sql: `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`,
    args: [name],
  });
  return r.rows.length > 0;
}

/**
 * 从「站点(sources)」那版结构迁过来。旧库里 media.source_id 指向 sources，
 * 新库是 media.channel_id 指向 channels —— 表名和列名都变了，所以要搬一次。
 */
async function hasColumn(table: string, column: string): Promise<boolean> {
  try {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    return info.rows.some((r) => r.name === column);
  } catch {
    return false;
  }
}

/**
 * 从「站点(sources)」那版结构迁过来：表名 sources → channels，
 * media.source_id → media.channel_id。老库里有数据，不能直接删了重建。
 */
async function migrate() {
  // 老的 media 表带 source_id：改名 → 建新表 → 倒数据 → 删老表
  if (await hasColumn("media", "source_id")) {
    if (await tableExists("sources")) {
      await client.execute(`INSERT OR IGNORE INTO channels
          (id, name, root_url, kind, adapter, enabled, last_run_at, last_error, created_at)
        SELECT id, name, COALESCE(homepage, ''), 'builtin', id, enabled, last_run_at, last_error,
               CAST(strftime('%s','now') AS INTEGER)
        FROM sources`);
    }

    await client.execute(`ALTER TABLE media RENAME TO media_legacy`);
    for (const stmt of DDL_TABLES) {
      if (stmt.includes("CREATE TABLE IF NOT EXISTS media ")) await client.execute(stmt);
    }
    await client.execute(`INSERT OR IGNORE INTO media
        (id, channel_id, external_id, title, description, poster_url, source_url, duration_sec,
         published_at, tags, stream_type, score, excluded, matched_rules, favorite, watched_at,
         first_seen_at, last_seen_at)
      SELECT id, source_id, external_id, title, description, poster_url, source_url, duration_sec,
             published_at, tags, stream_type, score, excluded, matched_rules, favorite, watched_at,
             first_seen_at, last_seen_at
      FROM media_legacy`);
    await client.execute(`DROP TABLE media_legacy`);
    console.log("[cinder] media 已从 source_id 迁到 channel_id");
  }

  // ingest_runs 只是抓取日志，结构变了直接重建，不值得搬
  if (await hasColumn("ingest_runs", "source_id")) {
    await client.execute(`DROP TABLE ingest_runs`);
    for (const stmt of DDL_TABLES) {
      if (stmt.includes("CREATE TABLE IF NOT EXISTS ingest_runs")) await client.execute(stmt);
    }
  }

  await client.execute(`DROP TABLE IF EXISTS sources`);

  if (!(await hasColumn("media", "comments"))) {
    await client.execute(`ALTER TABLE media ADD COLUMN comments TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!(await hasColumn("media", "portrait"))) {
    await client.execute(`ALTER TABLE media ADD COLUMN portrait TEXT`);
  }
  if (!(await hasColumn("media", "core_tags"))) {
    await client.execute(`ALTER TABLE media ADD COLUMN core_tags TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!(await hasColumn("media", "watchability"))) {
    await client.execute(`ALTER TABLE media ADD COLUMN watchability INTEGER NOT NULL DEFAULT 0`);
  }
}

/** 建表 + 迁移 + 把内置 adapter 和 rules/*.md 同步进库。整个进程只跑一次。 */
export function ready(): Promise<void> {
  return (g.__cinderReady ??= (async () => {
    for (const stmt of PRAGMAS) await client.execute(stmt);
    for (const stmt of DDL_TABLES) await client.execute(stmt);
    await migrate();
    for (const stmt of DDL_INDEXES) await client.execute(stmt);
    const { seedBuiltins } = await import("./seed");
    await seedBuiltins();
  })());
}

export { schema };
