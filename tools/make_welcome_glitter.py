from __future__ import annotations

import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageDraw, ImageFont


@dataclass(frozen=True)
class Sparkle:
    x: int
    y: int
    r: int
    phase: int


def pick_font(paths: List[str], size: int) -> ImageFont.FreeTypeFont:
    for p in paths:
        fp = Path(p)
        if fp.exists():
            return ImageFont.truetype(str(fp), size=size)
    raise RuntimeError(f"Font not found. Tried: {paths}")


def binary_mask_multiline(w: int, h: int, text: str, font: ImageFont.ImageFont) -> Image.Image:
    """
    Crisp (binary) text mask: no antialias => GIF won’t speckle/dither.
    """
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)

    bbox = d.multiline_textbbox((0, 0), text, font=font, spacing=2, align="left")
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    tx = 0
    ty = (h - th) // 2

    d.multiline_text((tx, ty), text, font=font, fill=255, spacing=2, align="left")

    return mask.point(lambda p: 255 if p >= 110 else 0)


def draw_star(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, color: Tuple[int, int, int]) -> None:
    draw.line((cx - r, cy, cx + r, cy), fill=color, width=1)
    draw.line((cx, cy - r, cx, cy + r), fill=color, width=1)
    rr = max(1, r - 1)
    draw.line((cx - rr, cy - rr, cx + rr, cy + rr), fill=color, width=1)
    draw.line((cx - rr, cy + rr, cx + rr, cy - rr), fill=color, width=1)
    draw.rectangle((cx, cy, cx, cy), fill=(255, 255, 255))


def main() -> None:
    text = "Welcome to My\nPersonal Website!"
    out = Path("welcome_glitter.gif")

    w, h = 260, 96

    red = (255, 0, 0)
    sparkle_a = (255, 255, 255)
    sparkle_b = (220, 230, 255)

    key = (255, 0, 255)  

    frames_n = 16
    frame_ms = 80

    font = pick_font(
        [
            r"C:\Windows\Fonts\arialbd.ttf",
            r"C:\Windows\Fonts\trebucbd.ttf",
            r"C:\Windows\Fonts\segoeuib.ttf",
        ],
        size=28,
    )

    mask = binary_mask_multiline(w, h, text, font)
    mask_px = mask.load()

    base = Image.new("RGB", (w, h), key)
    base.paste(Image.new("RGB", (w, h), red), mask=mask)

    rng = random.Random(1337)
    sparkles: List[Sparkle] = []
    target = 20
    tries = 0
    while len(sparkles) < target and tries < 200000:
        tries += 1
        x = rng.randrange(0, w)
        y = rng.randrange(0, h)
        if mask_px[x, y] > 0:
            sparkles.append(Sparkle(x=x, y=y, r=rng.choice([2, 3, 4]), phase=rng.randrange(0, frames_n)))

    palette = []
    palette += [key[0], key[1], key[2]]        # 0
    palette += [red[0], red[1], red[2]]        # 1
    palette += [sparkle_a[0], sparkle_a[1], sparkle_a[2]]  # 2
    palette += [sparkle_b[0], sparkle_b[1], sparkle_b[2]]  # 3

    palette += [0, 0, 0] * (256 - 4)

    pal_img = Image.new("P", (1, 1))
    pal_img.putpalette(palette)

    frames_p: List[Image.Image] = []
    for i in range(frames_n):
        fr = base.copy()
        d = ImageDraw.Draw(fr)

        for sp in sparkles:
            t = (i - sp.phase) % frames_n
            if t in (0, 1, 2, frames_n - 1):
                color = sparkle_a if t in (0, frames_n - 1) else sparkle_b
                draw_star(d, sp.x, sp.y, sp.r, color)

        p = fr.quantize(palette=pal_img, dither=Image.Dither.NONE)
        frames_p.append(p)

    frames_p[0].save(
        out,
        save_all=True,
        append_images=frames_p[1:],
        duration=frame_ms,
        loop=0,
        optimize=False,      
        disposal=2,
        transparency=0,      
    )

    print(f"Wrote {out} ({frames_n} frames) size {w}x{h}.")


if __name__ == "__main__":
    main()
