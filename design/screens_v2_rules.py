# -*- coding: utf-8 -*-
from build import *

def toggle(on=True):
    return ('<div style="width:44px;height:26px;border-radius:999px;background:'
      + ("var(--primary)" if on else "var(--input)") + ';position:relative;flex-shrink:0;">'
      '<div style="position:absolute;top:3px;left:' + ("22px" if on else "3px") + ';width:20px;height:20px;'
      'border-radius:999px;background:oklch(0.98 0 0);"></div></div>')

def head2(title, chipname="全部渠道"):
    return ('<div style="flex-shrink:0;padding:44px 16px 0;">'
      '<div style="height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
      '<span style="font-size:19px;font-weight:600;letter-spacing:-0.01em;">' + title + '</span>'
      + chip(chipname) + '</div></div>')

# ---------- Rules：打字说偏好 ----------
composer = ('<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;'
  'padding:14px;display:flex;flex-direction:column;gap:12px;">'
  '<div style="font-size:15px;color:var(--muted-fg);line-height:1.6;">'
  '说说你想看什么，或者不想看什么…</div>'
  + row_between(
      '<span style="font-size:11px;color:var(--muted-fg);display:flex;align-items:center;gap:5px;">'
      + svg(I["flame"], 12, 2, "var(--primary)") + '本地模型推理，这句话不出内网</span>',
      '<div style="width:40px;height:40px;border-radius:999px;background:var(--primary);color:var(--primary-fg);'
      'display:flex;align-items:center;justify-content:center;">'
      + svg(I["back"], 19, 2.2).replace('m12 19-7-7 7-7', 'm12 5 7 7-7 7').replace('M19 12H5', 'M5 12h14')
      + '</div>')
  + '</div>')

ex = ""
for t in ["只要 4K", "别给我预告片", "科幻优先", "太短的不要"]:
    ex += ('<div style="flex-shrink:0;border:1px solid var(--border);border-radius:999px;'
      'padding:6px 12px;font-size:12px;color:var(--muted-fg);">' + t + '</div>')
examples = '<div style="display:flex;gap:6px;overflow:hidden;">' + ex + '</div>'

def rulecard(said, meant, effect, kind, hits, on=True, scope=None):
    scopebit = ('<div style="margin-top:2px;">' + badge(scope) + '</div>') if scope else ''
    return card(
      '<div style="display:flex;align-items:flex-start;gap:12px;">'
      '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;">'
      '<div style="font-size:14px;font-weight:500;line-height:1.5;">「' + said + '」</div>'
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
      + badge(effect, kind)
      + '<span style="font-size:11px;color:var(--muted-fg);">' + hits + '</span></div>'
      '<div style="font-size:12px;color:var(--muted-fg);line-height:1.55;">' + meant + '</div>'
      + scopebit +
      '</div>' + toggle(on) + '</div>', 14)

rules = (rulecard("只要 4K 的，别的往后排", "标题或标签里有 4K、2160p", "往前排 +30", "primary", "命中 2 条")
  + '<div style="height:10px;"></div>'
  + rulecard("预告片一律别给我", "标签含「预告」", "直接不进库", "destructive", "这轮挡掉 1 条")
  + '<div style="height:10px;"></div>'
  + rulecard("十分钟以下的基本是切片", "时长短于 10 分钟", "往后排 −20", "secondary", "命中 1 条", on=False))

body = (head2("规则")
  + '<div style="height:12px;"></div>'
  + scroll(composer + examples
      + section("你说过的 3 条", rules, gap=10))
  + tabbar("规则"))
write("Rules.dc.html", body)

# ---------- RuleConfirm：确认 AI 理解得对不对 ----------
said = ('<div style="display:flex;flex-direction:column;gap:6px;">'
  '<div style="font-size:12px;color:var(--muted-fg);">你说的</div>'
  + card('<div style="font-size:15px;line-height:1.65;">只要 4K 的，别的往后排</div>', 14) + '</div>')

understood = ('<div style="display:flex;flex-direction:column;gap:6px;">'
  '<div style="font-size:12px;color:var(--muted-fg);display:flex;align-items:center;gap:6px;">'
  '本地模型理解成了这样' + badge("2.1 秒", "outline") + '</div>'
  + card(
      '<div style="font-size:15px;font-weight:500;line-height:1.6;">'
      '标题或标签里出现 <span class="mono" style="color:var(--primary);">4K</span> / '
      '<span class="mono" style="color:var(--primary);">2160p</span> 的，往前排 +30 分。</div>'
      '<div style="height:12px;"></div>'
      '<div style="border-top:1px solid var(--border);padding-top:11px;display:flex;'
      'align-items:center;justify-content:space-between;color:var(--muted-fg);font-size:12px;">'
      '<span>看它实际写的条件</span>'
      '<span style="display:flex;">' + svg(I["chev"], 15, 2) + '</span></div>', 14) + '</div>')

def mini(title, dur, dim=False):
    return ('<div style="width:98px;flex-shrink:0;opacity:' + ("0.4" if dim else "1") + ';">'
      '<div style="position:relative;border-radius:9px;overflow:hidden;">'
      + poster(title, 55, 10) + pill(dur) + '</div>'
      '<div style="font-size:10px;margin-top:5px;line-height:1.3;color:var(--muted-fg);">' + title + '</div></div>')

preview = ('<div style="display:flex;flex-direction:column;gap:6px;">'
  '<div style="font-size:12px;color:var(--muted-fg);">拿现在库里的 133 条跑了一遍</div>'
  + '<div style="background:oklch(0.3 0.03 45 / 55%);border:1px solid oklch(0.72 0.19 45 / 35%);'
    'border-radius:16px;padding:13px;display:flex;flex-direction:column;gap:11px;">'
    + row_between('<span style="font-size:14px;font-weight:500;">命中 2 条</span>',
                  '<span class="mono" style="font-size:12px;color:var(--primary);">10 → 40</span>')
    + '<div style="display:flex;gap:8px;overflow:hidden;">'
      + mini("Big Buck Bunny 4K", "14:48") + mini("Sintel 4K", "14:48") + mini("Tears of Steel", "12:14", dim=True)
    + '</div>'
    '<div style="font-size:11px;color:var(--muted-fg);line-height:1.55;">'
    '灰掉那条没命中：它标签里只有 <span class="mono">1080p</span>。<br>'
    '不是你要的结果就重说一遍，别硬改条件。</div></div></div>')

redo = ('<div style="display:flex;gap:10px;">'
  '<div style="flex:1;">' + btn("重说一遍", "outline", 44) + '</div>'
  '<div style="flex:1;">' + btn("手动改条件", "ghost", 44).replace('border:1px solid transparent',
      'border:1px solid var(--border)') + '</div></div>')

body = (header("确认规则", back=True)
  + '<div style="height:10px;"></div>'
  + scroll(said + understood + preview + redo)
  + '<div style="flex-shrink:0;padding:12px 16px 28px;border-top:1px solid var(--border);'
    'background:oklch(0.18 0.009 60);">' + btn("加上这条规则", "primary") + '</div>')
write("RuleConfirm.dc.html", body)
