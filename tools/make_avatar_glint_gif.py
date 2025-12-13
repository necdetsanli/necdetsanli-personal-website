from __future__ import annotations

from pathlib import Path
from typing import Tuple

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter


INPUT = "me.jpg"
OUTPUT = "me_glint.gif"


MAX_HEIGHT_PX = 180  

FRAMES = 20
DURATION_MS = 60  
ANGLE_DEG = -25

BAND_WIDTH_RATIO = 0.12  
BLUR_RADIUS = 8
INTENSITY = 0.55 


def resize_keep_aspect(img: Image.Image, max_h: int) -> Image.Image:
    w, h = img.size
    if h <= max_h:
        return img
    scale = max_h / float(h)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return img.resize((new_w, new_h), Image.LANCZOS)


def make_glint_mask(size: Tuple[int, int], x: int, band_w: int) -> Image.Image:
    w, h = size
    pad = max(w, h)
    W, H = w + pad * 2, h + pad * 2

    mask_big = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask_big)

    bx = x + pad
    d.rectangle([bx, 0, bx + band_w, H], fill=255)

    mask_big = mask_big.filter(ImageFilter.GaussianBlur(radius=BLUR_RADIUS))
    mask_big = mask_big.rotate(ANGLE_DEG, resample=Image.BICUBIC, expand=False)

    mask = mask_big.crop((pad, pad, pad + w, pad + h))
    mask = ImageEnhance.Brightness(mask).enhance(INTENSITY)
    return mask


def main() -> None:
    base_rgba = Image.open(Path(INPUT)).convert("RGBA")
    base_rgba = resize_keep_aspect(base_rgba, MAX_HEIGHT_PX)

    w, h = base_rgba.size

    bg = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    bg.alpha_composite(base_rgba)
    base_rgba = bg

    base_rgb = base_rgba.convert("RGB")

    band_w = max(10, int(round(w * BAND_WIDTH_RATIO)))
    start = -int(w * 0.6) - band_w
    end = int(w * 1.6)

    frames = []
    for i in range(FRAMES):
        t = i / max(1, (FRAMES - 1))
        x = int(round(start + (end - start) * t))

        mask = make_glint_mask((w, h), x=x, band_w=band_w)

        glint_rgb = Image.merge("RGB", (mask, mask, mask))

        frame_rgb = ImageChops.screen(base_rgb, glint_rgb)
        frames.append(frame_rgb)

    frames[0].save(
        Path(OUTPUT),
        save_all=True,
        append_images=frames[1:],
        duration=DURATION_MS,
        loop=0,
        optimize=True,
    )

    print(f"Wrote {OUTPUT} ({w}x{h}, {FRAMES} frames)")


if __name__ == "__main__":
    main()
