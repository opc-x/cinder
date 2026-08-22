# -*- coding: utf-8 -*-
"""
生成 PWA 图标。机器上没有 ImageMagick / PIL，所以直接算像素 + zlib 写 PNG。
图案：深色圆角底 + 余烬橙的火苗，跟 app 主色一致。
"""
import math, struct, zlib, os

BG = (0x29, 0x1B, 0x14)
FLAME_HOT = (0xFF, 0xB0, 0x5E)
FLAME_MID = (0xF9, 0x73, 0x16)
FLAME_DEEP = (0xC2, 0x41, 0x0C)
CORE = (0x2A, 0x14, 0x08)


def lerp(a, b, t):
    t = min(max(t, 0.0), 1.0)
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def smooth(d, w):
    if d >= w:
        return 1.0
    if d <= -w:
        return 0.0
    return (d + w) / (2 * w)


def taper(x, y, top, waist, half_width, power):
    """一段从 top 收到尖、到 waist 处张到 half_width 的舌形。上下都封口。"""
    t = (y - top) / (waist - top)
    if t <= 0.0:
        # 尖端以上要用到顶点的真实距离；用半平面会在整幅图上留一条横向接缝
        return math.hypot(x, y - top)
    w = half_width * (min(t, 1.0) ** power)
    return max(abs(x) - w, top - y, y - waist)


def flame_sdf(x, y):
    """火苗 = 底部圆润的主体 + 一路收窄到顶点的舌尖。y = -1 是上方。"""
    lobe = math.hypot(x, (y - 0.30) * 1.05) - 0.46
    return min(lobe, taper(x, y, -0.92, 0.30, 0.46, 0.72))


def inner_sdf(x, y):
    """内焰：主体下部挖掉一小块，火苗才有层次而不是一坨橙色。"""
    lobe = math.hypot(x, (y - 0.46) * 1.15) - 0.20
    return min(lobe, taper(x, y, 0.00, 0.46, 0.20, 0.70))


def rounded_box_sdf(x, y, half, radius):
    dx = abs(x) - (half - radius)
    dy = abs(y) - (half - radius)
    return math.hypot(max(dx, 0.0), max(dy, 0.0)) + min(max(dx, dy), 0.0) - radius


def render(size, maskable=False):
    px = bytearray()
    scale = 0.58 if maskable else 0.76   # maskable 要留 safe zone
    aa = 1.6 / size

    for row in range(size):
        px.append(0)  # PNG 每行的 filter byte
        for col in range(size):
            u = (col + 0.5) / size * 2 - 1
            v = (row + 0.5) / size * 2 - 1

            if maskable:
                r, g, b = map(float, BG)
                a = 255
            else:
                cover = smooth(-rounded_box_sdf(u, v, 1.0, 0.44), aa)
                if cover <= 0:
                    px.extend((0, 0, 0, 0))
                    continue
                r, g, b = map(float, BG)
                a = round(255 * cover)

            fx, fy = u / scale, v / scale

            c = smooth(-flame_sdf(fx, fy), aa / scale)
            if c > 0:
                t = (0.55 - fy) / 1.15
                col = lerp(FLAME_DEEP, FLAME_MID, t * 1.6)
                col = lerp(col, FLAME_HOT, (t - 0.55) / 0.45)
                r, g, b = lerp((r, g, b), col, c)

            ci = smooth(-inner_sdf(fx, fy), aa / scale)
            if ci > 0:
                r, g, b = lerp((r, g, b), CORE, ci)

            px.extend((round(r), round(g), round(b), a))
    return bytes(px)


def write_png(path, size, raw):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)
    print(f"{path}  {size}x{size}  {len(png) // 1024} KB")


os.makedirs("public/icons", exist_ok=True)
for size in (192, 512):
    write_png(f"public/icons/icon-{size}.png", size, render(size))
write_png("public/icons/maskable-512.png", 512, render(512, maskable=True))
write_png("public/icons/apple-touch-icon.png", 180, render(180, maskable=True))
