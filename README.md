# Cinder

个人向多源视频聚合器 — 多站接入 · 规则引擎筛选 · 统一内嵌播放。

**单用户、局域网/Tailnet 内自用，不公开分发、不对外提供服务。** 这个前提决定了下面所有选型：不做多租户、不做鉴权体系、不上公网 CDN、不考虑水平扩展。

跟 `../Scraper` 是同一套方法论的另一个内容域：**渠道 adapter 抓元数据 → 规则引擎打分筛选 → 前端消费**。Scraper 挖职位，Cinder 挖视频。能抄的架构直接抄，别重新发明。

---

## 技术选型

| 层 | 选型 | 为什么是它 |
|---|---|---|
| 框架 | Next.js 16 (App Router) + TypeScript | Server Components 直连 DB，省掉一整层 API；`route.ts` 天然能写流式代理 |
| 运行时 | **Node.js 常驻进程**（`next start`），非 serverless | 播放代理必须长连接流式转发，serverless 的执行时长和出站带宽会直接把这条路堵死 |
| 样式 | Tailwind CSS v4 | 无运行时、无类名冲突，改视觉不用来回跳文件 |
| UI 组件 | **shadcn/ui** | 组件代码直接进仓库（不是 npm 依赖），想改就改。Next.js 本身不带任何 UI 组件，这层必须单独选 |
| 图标 | lucide-react | shadcn 默认搭档 |
| 播放器 | **Vidstack** (`@vidstack/react@1`) + hls.js | 原生支持 HLS/m3u8，UI 可完全自定义，比 Video.js 现代、比裸 `<video>` 省事 |
| DB | **SQLite (libSQL) + Drizzle ORM** | 单用户场景 Postgres 是过度设计，一个库文件搞定，零网络往返 |
| 抓取 | Playwright (Node) | 目标站重 JS 渲染 + 需要监听 XHR 拿真实播放清单，`fetch` + cheerio 拿不到 |
| 任务调度 | node-cron（进程内） | 单机常驻，不需要独立 worker/队列 |
| 部署 | **本机 Mac 常驻**（同 Scraper）+ Tailscale | 只有自己的设备能连，不暴露公网、无平台 AUP 风险、手机端直接可看 |

### 被否掉的选项

- **Vercel** — 平台 AUP 禁止此类内容；且 serverless 架构与「常驻流式代理」根本冲突。这不是配置问题，是选型错误。
- **Neon / 任何托管 Postgres 作为默认** — 单用户单机，网络往返比查询本身还贵。Drizzle 已把 schema 和 driver 解耦，真要多设备写入再切，一天的工作量。
- **Cloudflare Tunnel 挂公网域名** — Scraper 用它是因为要给下游 app 提供 API。Cinder 没有下游，挂公网只增加暴露面，且会把「自用」变成「对外提供服务」，性质完全不同。要多设备访问用 Tailscale，效果一样、风险为零。
- **media-chrome** — Vidstack 够用就没必要再引一套。注意 `npm i @vidstack/react` 会装到 **0.6.15**：它的 `latest` tag 是旧的，peer 锁 React 18，会跟本项目的 React 19 冲突。必须显式装 `@vidstack/react@1.15.6`（1.x 的 peer 是 `^18 || ^19`），别用 `--legacy-peer-deps` 硬顶 0.6.15。
- **Video.js** — 能用，但主题系统是 jQuery 时代的产物，跟 React/Tailwind 拧着来。
- **Electron 桌面端** — 浏览器 + Tailscale 已经覆盖 Mac/iPhone/iPad 全部场景，多一个壳只多一份维护。

---

## 架构

```
┌──────────────┐   元数据    ┌──────────┐   规则   ┌──────────┐
│ adapters/    │ ─────────→ │  SQLite  │ ───────→ │ 规则引擎  │
│ 各站抓取器    │             │  媒体库   │          │ 打分/筛选 │
└──────────────┘             └──────────┘          └────┬─────┘
                                                        │
                                                        ↓
┌──────────────┐   流式转发   ┌──────────────────────────────┐
│ 源站 CDN      │ ←────────→ │  Next.js  (Server Components) │
│ 签名 URL      │            │  /api/stream  代理  +  播放页   │
└──────────────┘            └──────────────────────────────┘
```

**两条链路必须分开**：元数据链路可以离线批跑、可以缓存、可以慢；播放链路必须实时、低延迟、每次重新解析。混在一起就会拿着过期的签名 URL 去播。

### 目录

```
cinder/
├── app/
│   ├── page.tsx             # 库：网格 / 搜索 / 标签 / 排序 / 只看收藏
│   ├── watch/[id]/          # 播放页
│   ├── rules/               # 规则列表 + confirm/（模型翻译结果确认屏）
│   ├── channels/            # 渠道管理 + new/（录 root → 探测 → 确认字段）
│   ├── offline/             # 离线壳，Service Worker 兜底到这儿
│   ├── manifest.ts          # PWA manifest
│   ├── actions.ts           # 所有写操作（Server Actions）
│   └── api/
│       ├── stream/[id]/     # 播放入口：现场解析 → 交给代理
│       ├── stream/p/        # 清单改写后的目的地：分片 / 子清单 / 密钥
│       └── ingest/          # 手动触发抓取（给 curl 和 cron 用）
├── lib/
│   ├── adapters/            # base（手写站点）+ config（探测出来的渠道）
│   ├── channels/            # probe（探测 root）+ extract（从 HTML 抽字段）
│   ├── rules/               # infer（自然语言→规则）+ engine + preview
│   ├── stream/              # 代理核心：签名、清单改写、字节流转发
│   ├── db/                  # Drizzle schema + libSQL client + 建表迁移
│   ├── ingest.ts            # 抓取 → 打分 → upsert → 清理下架条目
│   └── queries.ts           # 各页面的读查询
├── components/
│   ├── ui/                  # 设计 token 之上的基础组件
│   ├── shell/               # 顶栏、渠道切换器、底部 tab、离线壳、SW 注册
│   ├── rules/  channels/    # 两条主流程各自的界面
│   └── player/              # Vidstack 封装
├── public/
│   ├── sw.js                # Service Worker
│   └── icons/               # PWA 图标（scripts/make-icons.py 生成）
├── rules/                   # *.md 规则种子，首次启动导进库，之后以库为准
└── data/                    # SQLite 文件（.gitignore 掉）
```

---

## 真正的难点：播放代理

不是「内嵌一个 iframe」就完事。这层是整个项目的成败所在：

1. **播放地址是短时效签名 URL** — 抓的时候拿到的链接几分钟就失效，所以**绝对不能把播放地址存进 DB**。DB 只存页面 ID，播放时现场解析。
2. **CDN 校验 Referer / Origin** — 浏览器 `<video>` 直连必然 403。必须由服务端代理请求、注入正确请求头、再把字节流转发给前端。
3. **HLS 是分片的** — 代理不只要转发 `.m3u8`，还要改写清单里每个 `.ts` 分片的地址指回自己，否则播两秒就断。
4. **Range 请求要透传** — 否则拖进度条直接废掉。

这四条决定了运行时必须常驻。先把这条链路打通再写任何 UI，否则 UI 做得再漂亮也是个不能播的壳子。

---

## 开发

```bash
npm install
```

```bash
npm run dev
```

打开 http://localhost:3000 ，右上角「抓取」拉一次数据，点任意一条即可播放。
不想开界面就直接 `curl -X POST localhost:3000/api/ingest`。

配置全在 `.env.local`（照着 `.env.example` 抄）：

| 变量 | 作用 |
|---|---|
| `CINDER_DB_FILE` | SQLite 文件位置，默认 `./data/cinder.db`，首次启动自动建表 |
| `CINDER_PROXY_SECRET` | 代理链接的签名密钥。**换了会让已发出的分片链接立刻失效**，正在播的会断一下 |
| `CINDER_INGEST_CRON` | 定时抓取表达式，留空就只手动抓 |
| `CINDER_AI_CMD` | 规则推理用的本地 CLI，prompt 走 stdin、JSON 走 stdout |
| `CINDER_OLLAMA_MODEL` | 装了 ollama 就自动走它，这里只是换模型 |

### 加渠道

界面上「接入新渠道」录个首页地址就行，不用写代码。

探测走不通的站（重 JS 渲染、要登录、播放地址靠接口拿）才需要手写 adapter：
在 `lib/adapters/` 里写个 `BaseAdapter` 子类实现 `list()` 和 `resolve()`，
注册进 `lib/adapters/index.ts`，重启即可。要真浏览器就用 `this.withBrowser()`
（需先 `npm i playwright && npx playwright install chromium`）。

`resolve()` 的返回值**绝对不要落库** —— 那是短时效签名地址。

### 改规则

在「规则」页打字。没配本地模型也能用，内置的启发式解析认时长、画质词和否定句，
只是不如模型准 —— 确认屏的命中预览就是用来发现它翻错了的。

`rules/*.md` 只是首次启动的种子，之后以库为准。

### 换图标

`python3 scripts/make-icons.py` —— 纯 stdlib 算像素写 PNG，机器上不用装 ImageMagick。

## 三条流程

**渠道** 是全局作用域，右上角切换，跟切语言一个位置。切了只换数据源，规则和界面不变。

1. **接入** — 录一个首页地址 → 探测 sitemap / RSS / 列表页 → 抽 3 个样本猜字段 →
   把不确定的标红让你确认 → 落库开抓。加站点不用写代码。
   探测不到播放清单地址的站（地址是 JS 调接口拿的），会当场说清「元数据能抓但播不了」。
2. **规则** — 你打一句话（「只要 4K 的」「预告片别给我」），本地模型翻成规则，
   立刻拿库里现有的条目跑一遍给你看命中了哪几条、分数怎么变，你确认才生效。
   规则的身份是你说的那句话，不是一个 id；条件树折叠着，不对的时候才展开。
3. **浏览** — 网格库 → 播放页。底部只有「库 / 规则」两个 tab。

## 现状

跑通并实测过：

- 抓取 → 规则打分 → SQLite → 播放代理（清单三层改写 / Range 透传）→ 前端播放
- 探测接入：拿 framatube.org 真跑过，sitemap 960 页、字段 4/6 满命中、20 条真数据入库
- 自然语言规则：没有本地模型时走内置启发式，中文数字、否定句、画质词都认
- PWA：装得上、离线壳在服务器停掉时确实顶上来了

还没做：播放进度记忆、字幕外挂、点选模式改字段映射（现在只能删了重来）、多设备同步。

## 边界

自用工具。不部署到公网、不提供给他人访问、不做任何形式的分发。所有内容来自源站实时代理，本地只保存元数据，不落任何媒体文件。
