# -*- coding: utf-8 -*-
import io, os

HEAD = '''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">
  <style>
    :root{
      --background: oklch(0.16 0.008 60);
      --foreground: oklch(0.95 0.008 60);
      --card: oklch(0.2 0.01 60);
      --primary: oklch(0.72 0.19 45);
      --primary-fg: oklch(0.17 0.02 45);
      --secondary: oklch(0.26 0.012 60);
      --muted: oklch(0.25 0.01 60);
      --muted-fg: oklch(0.68 0.012 60);
      --accent: oklch(0.3 0.03 45);
      --destructive: oklch(0.65 0.2 25);
      --border: oklch(0.3 0.01 60 / 70%);
      --input: oklch(0.3 0.01 60);
    }
    *{box-sizing:border-box;}
    body{margin:0;background:var(--background);color:var(--foreground);
      font-family:"Geist",system-ui,-apple-system,"PingFang SC","Hiragino Sans GB",sans-serif;
      -webkit-font-smoothing:antialiased;}
    a{color:oklch(0.72 0.19 45);text-decoration:none;}
    a:hover{color:oklch(0.79 0.17 45);}
    .mono{font-family:"Geist Mono",ui-monospace,SFMono-Regular,monospace;}
  </style>
</helmet>
'''

FOOT = '''</x-dc>
<script data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
'''

def svg(paths, size=20, sw=1.75, color="currentColor", extra=""):
    return ('<svg width="%d" height="%d" viewBox="0 0 24 24" fill="none" stroke="%s" '
            'stroke-width="%s" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;%s">%s</svg>'
            ) % (size, size, color, sw, extra, paths)

I = {
 "flame": '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
 "grid": '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
 "sliders": '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
 "globe": '<circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z"/><path d="M3 12h18"/>',
 "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
 "refresh": '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/>',
 "back": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
 "plus": '<path d="M5 12h14"/><path d="M12 5v14"/>',
 "check": '<path d="M20 6 9 17l-5-5"/>',
 "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
 "alert": '<path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
 "star": '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6L3.2 9.4l6.1-.9z"/>',
 "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 1.6"/>',
 "ext": '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
 "chev": '<path d="m9 18 6-6-6-6"/>',
 "play": '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
 "wifioff": '<path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.7"/><path d="M19 12.9a10 10 0 0 0-2-1.5"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8a15 15 0 0 0-11.3-3.8"/><path d="m2 2 20 20"/>',
 "trash": '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
 "expand": '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
 "dots": '<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
}

ROOT_OPEN = ('<div style="width:390px;height:844px;overflow:hidden;position:relative;'
             'display:flex;flex-direction:column;background:var(--background);">')

def tabbar(active):
    items = [("库","grid"),("规则","sliders")]
    cells = []
    for label, ico in items:
        on = (label == active)
        col = "var(--primary)" if on else "var(--muted-fg)"
        cells.append(
          '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;'
          'padding:10px 0;color:%s;">%s<span style="font-size:11px;font-weight:%s;">%s</span></div>'
          % (col, svg(I[ico], 22, 1.75, col), "500" if on else "400", label))
    return ('<div style="flex-shrink:0;border-top:1px solid var(--border);background:oklch(0.18 0.009 60);'
            'padding-bottom:24px;display:flex;">%s</div>' % "".join(cells))

def chip(name):
    """右上角渠道切换器 —— 跟多语言选择一个位置、一个手感。"""
    return ('<div style="display:flex;align-items:center;gap:5px;height:34px;padding:0 10px 0 11px;'
            'border:1px solid var(--border);background:var(--card);border-radius:999px;">'
            + svg(I["globe"], 14, 1.8, "var(--primary)")
            + '<span style="font-size:13px;font-weight:500;max-width:96px;overflow:hidden;'
              'white-space:nowrap;text-overflow:ellipsis;">' + name + '</span>'
            + '<span style="color:var(--muted-fg);transform:rotate(90deg);display:flex;">'
            + svg(I["chev"], 13, 2.1) + '</span></div>')

def poster(label, h=97, fs=13):
    return ('<div style="height:%dpx;background:oklch(0.235 0.013 60);display:flex;align-items:center;'
            'justify-content:center;padding:8px;"><span style="color:var(--primary);font-size:%dpx;'
            'font-weight:600;text-align:center;line-height:1.15;">%s</span></div>' % (h, fs, label))

def pill(text, bg="rgba(0,0,0,0.75)", col="#fff"):
    return ('<span class="mono" style="position:absolute;right:6px;bottom:6px;background:%s;color:%s;'
            'font-size:10px;padding:2px 5px;border-radius:4px;">%s</span>' % (bg, col, text))

def badge(text, kind="outline"):
    styles = {
      "outline": "border:1px solid var(--border);color:var(--muted-fg);background:transparent;",
      "primary": "border:1px solid transparent;color:var(--primary);background:oklch(0.72 0.19 45 / 15%);",
      "secondary": "border:1px solid transparent;color:oklch(0.93 0.008 60);background:var(--secondary);",
      "destructive": "border:1px solid transparent;color:var(--destructive);background:oklch(0.65 0.2 25 / 15%);",
    }[kind]
    return ('<span style="%sfont-size:11px;font-weight:500;padding:2px 8px;border-radius:999px;'
            'white-space:nowrap;">%s</span>' % (styles, text))

def mediacard(title, dur, score, tags, w=None):
    tagrow = "".join(badge(t) for t in tags)
    width = ("width:%dpx;" % w) if w else ""
    return ('<div style="%sbackground:var(--card);border:1px solid var(--border);border-radius:16px;'
            'overflow:hidden;display:flex;flex-direction:column;">'
            '<div style="position:relative;">%s%s</div>'
            '<div style="padding:10px;display:flex;flex-direction:column;gap:6px;">'
            '<div style="font-size:13px;font-weight:500;line-height:1.3;">%s</div>'
            '<div style="display:flex;align-items:center;gap:8px;color:var(--muted-fg);font-size:11px;">'
            '<span style="display:flex;align-items:center;gap:3px;color:%s;">%s%s</span>'
            '<span style="display:flex;align-items:center;gap:3px;">%sdemo</span></div>'
            '<div style="display:flex;gap:4px;flex-wrap:wrap;">%s</div>'
            '</div></div>'
            ) % (width, poster(title.split(" (")[0]), pill(dur), title,
                 "var(--primary)" if score > 0 else "var(--muted-fg)",
                 svg(I["flame"], 12, 2, "var(--primary)" if score > 0 else "var(--muted-fg)"),
                 score, svg(I["clock"], 12, 1.6), tagrow)

def btn(text, kind="primary", h=44, full=True, icon=None):
    st = {
      "primary": "background:var(--primary);color:var(--primary-fg);border:1px solid transparent;",
      "outline": "background:transparent;color:var(--foreground);border:1px solid var(--border);",
      "ghost": "background:transparent;color:var(--muted-fg);border:1px solid transparent;",
      "secondary": "background:var(--secondary);color:oklch(0.93 0.008 60);border:1px solid transparent;",
    }[kind]
    ic = (svg(I[icon], 18, 1.9) + " ") if icon else ""
    return ('<div style="%sheight:%dpx;%sborder-radius:12px;display:flex;align-items:center;'
            'justify-content:center;gap:8px;font-size:15px;font-weight:500;">%s%s</div>'
            ) % (st, h, "width:100%;" if full else "padding:0 20px;", ic, text)

def header(title, back=False, right=None, sub=None):
    left = (svg(I["back"], 22, 1.9) if back
            else '<span style="display:flex;align-items:center;gap:8px;">%s<span style="font-size:19px;font-weight:600;letter-spacing:-0.01em;">Cinder</span></span>' % svg(I["flame"], 22, 1.9, "var(--primary)"))
    titlebit = ('<span style="font-size:17px;font-weight:600;">%s</span>' % title) if back else ""
    rightbit = right or '<span style="width:22px;"></span>'
    sub_html = ('<div style="color:var(--muted-fg);font-size:12px;margin-top:2px;">%s</div>' % sub) if sub else ""
    return ('<div style="flex-shrink:0;padding:44px 16px 0;">'
            '<div style="height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
            '<div style="display:flex;align-items:center;gap:10px;min-width:0;">%s%s</div>%s</div>%s</div>'
            ) % (left, titlebit, rightbit, sub_html)

def scroll(inner, pad="0 16px"):
    return ('<div style="flex:1;overflow:hidden;padding:%s;display:flex;flex-direction:column;gap:14px;">%s</div>'
            % (pad, inner))

def section(label, inner, gap=8):
    return ('<div style="display:flex;flex-direction:column;gap:%dpx;">'
            '<div style="font-size:12px;font-weight:500;color:var(--muted-fg);">%s</div>%s</div>'
            ) % (gap, label, inner)

def card(inner, pad=14, extra=""):
    return ('<div style="background:var(--card);border:1px solid var(--border);border-radius:16px;'
            'padding:%dpx;%s">%s</div>' % (pad, extra, inner))

def row_between(a, b):
    return ('<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">%s%s</div>' % (a, b))

def write(name, body):
    with io.open(name, "w", encoding="utf-8") as f:
        f.write(HEAD + ROOT_OPEN + body + "</div>\n" + FOOT)
    print("wrote", name)
