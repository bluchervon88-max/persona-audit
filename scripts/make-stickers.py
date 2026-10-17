#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make-stickers — 把一组角色图批量做成聊天表情包

流程: 去白底 -> 裁切 -> 统一尺寸 -> 加文字条 -> 输出透明 PNG

适合: 一批"纯白背景、角色居中"的插画（AI 生图或画师交付都行），
     批量变成可以直接发微信/飞书的表情包。

用法:
    python make-stickers.py --src ./raw --out ./stickers --manifest manifest.txt

manifest.txt 格式（一行一张，制表符或 ||| 分隔）:
    文件名.png ||| 文字

可选:
    --size 512          输出边长
    --color "#2F4A7A"   文字条颜色
    --font "C:/Windows/Fonts/msyhbd.ttc"
    --no-band           不要文字条，只加描边文字
"""
import argparse, os, re, sys
from PIL import Image, ImageDraw, ImageFont

DEFAULT_FONTS = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
]

def hex_rgb(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))

def cutout_white(img, thresh=32):
    """从四周 flood fill 掉白底。只吃掉连通的背景，不会吃白衣服。"""
    img = img.convert("RGBA")
    w, h = img.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (0, h // 2), (w - 1, h // 2), (w // 2, h - 1)]
    for xy in seeds:
        try:
            ImageDraw.floodfill(img, xy, (255, 255, 255, 0), thresh=thresh)
        except Exception:
            pass
    bb = img.getbbox()
    return img.crop(bb) if bb else img

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--color", default="#2F4A7A")
    ap.add_argument("--font", default=None)
    ap.add_argument("--no-band", action="store_true")
    args = ap.parse_args()

    font_path = args.font or next((p for p in DEFAULT_FONTS if os.path.exists(p)), None)
    if not font_path:
        sys.exit("找不到中文字体，请用 --font 指定")
    accent = hex_rgb(args.color)
    os.makedirs(args.out, exist_ok=True)
    S = args.size

    entries = []
    # utf-8-sig 会自动吃掉 BOM —— Windows 下用 PowerShell 写出来的文件常有 BOM
    for line in open(args.manifest, encoding="utf-8-sig"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in re.split(r"\|\|\||\t", line)]
        if len(parts) >= 2:
            entries.append((parts[0], parts[1]))

    ok = 0
    for name, text in entries:
        src = os.path.join(args.src, name)
        if not os.path.exists(src):
            print("跳过（找不到）: " + name)
            continue
        art = cutout_white(Image.open(src))
        canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))

        art_h = int(S * 0.75)
        sc = art_h / art.height
        art = art.resize((max(1, int(art.width * sc)), art_h), Image.LANCZOS)
        if art.width > S - 8:
            art = art.resize((S - 8, max(1, int(art.height * (S - 8) / art.width))), Image.LANCZOS)
        canvas.alpha_composite(art, ((S - art.width) // 2, max(0, (art_h - art.height) // 2)))

        d = ImageDraw.Draw(canvas)
        fsize = int(S * 0.12) if len(text) <= 4 else int(S * 0.10)
        font = ImageFont.truetype(font_path, fsize)
        tb = d.textbbox((0, 0), text, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]

        if args.no_band:
            x = (S - tw) // 2 - tb[0]
            y = int(S * 0.82) - tb[1]
            d.text((x, y), text, font=font, fill=(20, 20, 20, 255),
                   stroke_width=max(2, S // 60), stroke_fill=(255, 255, 255, 255))
        else:
            pw, ph = min(tw + int(S * 0.14), S - 16), th + int(S * 0.09)
            px, py = (S - pw) // 2, int(S * 0.78)
            d.rounded_rectangle([px, py, px + pw, py + ph], radius=ph // 2, fill=accent + (255,))
            d.text((px + (pw - tw) // 2 - tb[0], py + (ph - th) // 2 - tb[1]),
                   text, font=font, fill=(255, 255, 255, 255))

        out_name = re.sub(r"[^\w.\-\u4e00-\u9fff]", "_", name)
        canvas.save(os.path.join(args.out, out_name))
        ok += 1
        print("OK  " + out_name + "   " + text)

    print("\n完成 %d / %d" % (ok, len(entries)))

if __name__ == "__main__":
    main()
