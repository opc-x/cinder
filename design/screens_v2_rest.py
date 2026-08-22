# -*- coding: utf-8 -*-
from build import *

# ---------- Main：网格库（右上角渠道切换）----------
search = ('<div style="position:relative;">'
  '<span style="position:absolute;left:12px;top:22px;color:var(--muted-fg);">' + svg(I["search"], 17, 1.8) + '</span>'
  '<div style="height:44px;border:1px solid var(--input);background:oklch(0.2 0.01 60 / 60%);'
  'border-radius:12px;padding-left:38px;display:flex;align-items:center;color:var(--muted-fg);font-size:14px;">'
  '搜标题、简介…</div></div>')

sorts = ""
for i, s in enumerate(["评分", "最新", "时长", "标题"]):
    on = i == 0
    sorts += ('<div style="flex:1;height:32px;border-radius:9px;display:flex;align-items:center;'
      'justify-content:center;font-size:13px;font-weight:' + ("500" if on else "400")
      + ';background:' + ("var(--primary)" if on else "transparent")
      + ';color:' + ("var(--primary-fg)" if on else "var(--muted-fg)") + ';">' + s + '</div>')
sortbar = ('<div style="display:flex;gap:2px;background:var(--card);border:1px solid var(--border);'
           'border-radius:12px;padding:3px;">' + sorts + '</div>')

chips = ""
for t, n, on in [("4K", 12, True), ("科幻", 31, False), ("1080p", 44, False),
                 ("动画", 18, False), ("hls", 96, False)]:
    chips += ('<div style="flex-shrink:0;border-radius:999px;padding:5px 11px;font-size:12px;'
      'border:1px solid ' + ("transparent" if on else "var(--border)")
      + ';background:' + ("oklch(0.72 0.19 45 / 15%)" if on else "transparent")
      + ';color:' + ("var(--primary)" if on else "var(--muted-fg)") + ';">'
      + t + ' <span style="opacity:.6;">' + str(n) + '</span></div>')
tagrow = '<div style="display:flex;gap:6px;overflow:hidden;">' + chips + '</div>'

items = [
  ("Big Buck Bunny 4K", "14:48", 40, ["4K", "multi-bitrate"]),
  ("深海之下 第 4 集", "24:11", 40, ["剧情", "4K"]),
  ("Tears of Steel", "12:14", 25, ["科幻", "hls"]),
  ("Apple BipBop fMP4", "30:00", 25, ["fmp4", "字幕"]),
  ("Unified Streaming", "12:14", 10, ["科幻", "hls"]),
  ("Jellyfish 1080p", "0:10", -5, ["mp4", "1080p"]),
]
grid = ('<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">'
        + "".join(mediacard(t, d, s, g) for t, d, s, g in items) + '</div>')

right = ('<div style="display:flex;align-items:center;gap:8px;">'
  '<span style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;'
  'color:var(--muted-fg);">' + svg(I["refresh"], 19, 1.9) + '</span>' + chip("全部渠道") + '</div>')

body = (header("", right=right, sub="133 条 · 收藏 6 · 3 个渠道")
  + '<div style="height:14px;"></div>'
  + scroll(search + sortbar + tagrow + grid)
  + tabbar("库"))
write("Main.dc.html", body)

# ---------- ChannelAdd：录入 root + 探测 ----------
def probe(state, label, value):
    ico = {"ok": svg(I["check"], 16, 2.2, "var(--primary)"),
           "no": svg(I["x"], 16, 2.2, "var(--muted-fg)"),
           "run": svg(I["refresh"], 16, 2, "var(--muted-fg)")}[state]
    col = "var(--foreground)" if state == "ok" else "var(--muted-fg)"
    return ('<div style="display:flex;align-items:center;gap:10px;padding:11px 0;'
      'border-bottom:1px solid var(--border);">' + ico
      + '<span style="flex:1;font-size:13px;color:' + col + ';">' + label + '</span>'
      + '<span class="mono" style="font-size:11px;color:var(--muted-fg);">' + value + '</span></div>')

probes = (probe("ok", "sitemap.xml", "1,284 个页面")
        + probe("no", "RSS / Atom", "没有")
        + probe("ok", "列表页规律", "/videos?page=N · 43 页")
        + probe("run", "抽样解析", "2 / 3").replace('border-bottom:1px solid var(--border);', 'border-bottom:none;'))

inputbox = ('<div class="mono" style="height:48px;border:1px solid var(--primary);'
  'background:oklch(0.2 0.01 60 / 60%);border-radius:12px;padding:0 14px;display:flex;'
  'align-items:center;font-size:14px;">https://example-site.com</div>')

body = (header("接入新渠道", back=True)
  + '<div style="height:10px;"></div>'
  + scroll(
      section("渠道首页地址", inputbox
        + '<div style="font-size:12px;color:var(--muted-fg);line-height:1.6;margin-top:2px;">'
        '只要首页，不用找列表页。剩下的探测来猜。</div>')
      + section("探测中…", card(probes, 14)
        + '<div style="font-size:12px;color:var(--muted-fg);line-height:1.6;margin-top:2px;">'
        '没有 sitemap 也不影响，探测会退回去猜列表页的翻页规律。</div>'))
  + '<div style="flex-shrink:0;padding:12px 16px 28px;border-top:1px solid var(--border);'
    'background:oklch(0.18 0.009 60);">' + btn("下一步：确认字段", "primary") + '</div>')
write("ChannelAdd.dc.html", body)

# ---------- ChannelMap：点选确认映射 ----------
def field(name, value, state, note):
    cfg = {"ok": ("var(--primary)", svg(I["check"], 13, 2.4, "var(--primary)")),
           "warn": ("var(--destructive)", svg(I["alert"], 13, 2, "var(--destructive)"))}[state]
    return ('<div style="display:flex;align-items:center;gap:10px;padding:12px 0;'
      'border-bottom:1px solid var(--border);">'
      '<div style="width:56px;flex-shrink:0;font-size:12px;color:var(--muted-fg);">' + name + '</div>'
      '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">'
      '<div style="font-size:13px;font-weight:500;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">' + value + '</div>'
      '<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:' + cfg[0] + ';">' + cfg[1] + note + '</div></div>'
      '<div style="flex-shrink:0;height:34px;padding:0 12px;border:1px solid var(--border);border-radius:9px;'
      'display:flex;align-items:center;font-size:12px;color:var(--muted-fg);">重选</div></div>')

fields = (field("标题", "深海之下 第 4 集", "ok", "3 / 3 个样本一致")
        + field("封面", "og:image", "ok", "3 / 3 个样本一致")
        + field("时长", "24:11", "warn", "只有 2 / 3 命中，第 3 个是直播页")
        + field("发布", "2026-08-19", "ok", "3 / 3 个样本一致")
        + field("标签", "剧情 · 4K", "warn", "只在 1 个样本里找到，可能不稳").replace(
            'border-bottom:1px solid var(--border);', 'border-bottom:none;'))

preview = ('<div style="display:flex;gap:12px;align-items:flex-start;">'
  + mediacard("深海之下 第 4 集", "24:11", 40, ["剧情", "4K"], w=150)
  + '<div style="flex:1;display:flex;flex-direction:column;gap:6px;padding-top:2px;">'
    '<div style="font-size:12px;color:var(--muted-fg);line-height:1.6;">'
    '这是按左边映射抓出来的效果。<br>不对就点「重选」，去页面上直接点那块内容。</div></div></div>')

body = (header("确认字段", back=True,
        right='<span class="mono" style="font-size:12px;color:var(--muted-fg);">2 / 2</span>')
  + '<div style="height:10px;"></div>'
  + scroll(
      '<div style="font-size:13px;color:var(--muted-fg);line-height:1.6;">'
      '从 1,284 个页面里抽了 3 个样本。下面是猜的结果，'
      '<span style="color:var(--foreground);">两处不确定</span>建议你确认一下。</div>'
      + section("预览效果", card(preview, 12))
      + section("字段映射", card(fields, 14)))
  + '<div style="flex-shrink:0;padding:12px 16px 28px;border-top:1px solid var(--border);'
    'background:oklch(0.18 0.009 60);display:flex;flex-direction:column;gap:10px;">'
    + btn("确认并抓取全渠道", "primary")
    + '<div style="text-align:center;font-size:13px;color:var(--muted-fg);">先只抓 50 条试试</div></div>')
write("ChannelMap.dc.html", body)
