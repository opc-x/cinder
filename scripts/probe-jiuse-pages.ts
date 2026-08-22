import { DEFAULT_UA } from "../lib/adapters/base";
import { upstreamFetch } from "../lib/http";

const urls = [
  "https://jiuse.io/videos",
  "https://www.jiuse.io/videos",
  "https://91porny.com/videos",
  "https://www.91porny.com/videos",
  "https://91porn.com/videos",
];

async function main() {
  for (const url of urls) {
    try {
      const res = await upstreamFetch(url, {
        headers: { "user-agent": DEFAULT_UA, referer: new URL(url).origin + "/" },
        cache: "no-store",
      });
      const html = await res.text();
      const cards = new Set([...html.matchAll(/\/videos\/view\/\d+\//g)].map((m) => m[0])).size;
      const pages = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1]));
      console.log(url, {
        status: res.status,
        bytes: html.length,
        cards,
        last: pages.length ? Math.max(...pages) : 0,
        head: html.slice(0, 80).replace(/\s+/g, " "),
      });
    } catch (e) {
      console.log(url, "ERR", (e as Error).message);
    }
  }
}

main();
