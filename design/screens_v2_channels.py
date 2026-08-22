# -*- coding: utf-8 -*-
from build import *

def dot(color):
    return '<span style="width:7px;height:7px;border-radius:999px;background:' + color + ';flex-shrink:0;"></span>'

# ---------- Channels：渠道切换（bottom sheet，压在库上面）----------
def sheetrow(name, meta, state, active=False):
    col = {"ok": "var(--primary)", "err": "var(--destructive)", "idle": "var(--muted-fg)"}[state]
    check = (svg(I["check"], 18, 2.4, "var(--primary)") if active
             else '<span style="width:18px;"></span>')
    return ('<div style="display:flex;align-items:center;gap:11px;height:56px;'
      'border-bottom:1px solid var(--border);">'
      + dot(col)
      + '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">'
        '<div style="font-size:15px;font-weight:' + ("600" if active else "400") + ';">' + name + '</div>'
        '<div style="font-size:11px;color:var(--muted-fg);">' + meta + '</div></div>'
      + check + '</div>')

def sheetaction(label, ico):
    return ('<div style="display:flex;align-items:center;gap:11px;height:52px;color:var(--muted-fg);">'
      + svg(I[ico], 19, 1.8) + '<span style="flex:1;font-size:14px;color:var(--foreground);">' + label + '</span>'
      + svg(I["chev"], 16, 2) + '</div>')

sheet = ('<div style="position:absolute;left:0;right:0;bottom:0;background:oklch(0.21 0.01 60);'
  'border-top:1px solid var(--border);border-radius:22px 22px 0 0;padding:10px 16px 30px;'
  'display:flex;flex-direction:column;box-shadow:0 -18px 40px rgba(0,0,0,.45);">'
  '<div style="width:38px;height:4px;border-radius:999px;background:var(--input);align-self:center;'
  'margin-bottom:14px;"></div>'
  '<div style="font-size:12px;color:var(--muted-fg);margin-bottom:2px;">切换渠道</div>'
  + sheetrow("全部渠道", "133 条 · 3 个源", "ok", active=True)
  + sheetrow("Demo（公开测试流）", "5 条 · 上次 06:00", "ok")
  + sheetrow("某视频站", "128 条 · 上次抓取失败", "err")
  + sheetrow("第三个渠道", "还没抓过", "idle")
  + '<div style="height:6px;"></div>'
  + sheetaction("接入新渠道", "plus")
  + sheetaction("管理渠道", "sliders")
  + '</div>')

# 背后压着的库（变暗）
dimmed = ('<div style="position:absolute;inset:0;background:rgba(0,0,0,.55);"></div>')

bg = (header("", right=chip("全部渠道"), sub="133 条 · 收藏 6 · 3 个渠道")
  + '<div style="height:14px;"></div>'
  + '<div style="flex:1;padding:0 16px;display:flex;flex-direction:column;gap:14px;overflow:hidden;">'
    '<div style="height:44px;border:1px solid var(--input);background:oklch(0.2 0.01 60 / 60%);'
    'border-radius:12px;"></div>'
    '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">'
    + mediacard("Big Buck Bunny 4K", "14:48", 40, ["4K"])
    + mediacard("Tears of Steel", "12:14", 25, ["科幻"])
    + '</div></div>')

write("Channels.dc.html", bg + dimmed + sheet)

# ---------- ChannelManage：渠道管理 ----------
def chcard(name, root, ok, stats, err=None):
    top = row_between(
        '<div style="display:flex;align-items:center;gap:8px;min-width:0;">'
        + dot("var(--primary)" if ok else "var(--destructive)")
        + '<span style="font-size:15px;font-weight:600;">' + name + '</span></div>',
        '<span style="color:var(--muted-fg);">' + svg(I["chev"], 18, 1.9) + '</span>')
    body = ('<div class="mono" style="font-size:12px;color:var(--muted-fg);margin-top:6px;">' + root + '</div>'
      '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap;">' + stats + '</div>')
    if err:
        body += ('<div style="margin-top:10px;display:flex;align-items:flex-start;gap:6px;'
          'color:var(--destructive);font-size:12px;line-height:1.5;">'
          + svg(I["alert"], 14, 1.8, "var(--destructive)") + '<span>' + err + '</span></div>'
          '<div style="margin-top:10px;">' + btn("重新抓取", "outline", 38) + '</div>')
    return card(top + body)

body = (header("渠道", back=True,
        right='<span style="width:44px;height:44px;display:flex;align-items:center;justify-content:flex-end;color:var(--muted-fg);">' + svg(I["plus"], 22, 1.9) + '</span>')
  + '<div style="height:12px;"></div>'
  + scroll(
      '<div style="font-size:12px;color:var(--muted-fg);line-height:1.6;">'
      '规则是全库共用的，切渠道只换数据源。<br>要让某条规则只管一个渠道，去规则里单独标。</div>'
      + chcard("Demo（公开测试流）", "test-streams.mux.dev", True,
          badge("5 条", "secondary") + badge("上次 06:00") + badge("自动 · 每 6 小时", "primary"))
      + chcard("某视频站", "example-site.com", False,
          badge("128 条", "secondary") + badge("上次 昨天 22:00"),
          err="抓取失败：列表页结构变了，标题选择器没匹配到（3 个样本全空）")
      + chcard("第三个渠道", "another-site.net", True,
          badge("0 条", "secondary") + badge("还没抓过"))
    ))
write("ChannelManage.dc.html", body)
