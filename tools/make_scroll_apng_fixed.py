from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def pick_font(paths: list[str], size: int) -> ImageFont.FreeTypeFont:
    for p in paths:
        fp = Path(p)
        if fp.exists():
            return ImageFont.truetype(str(fp), size=size)
    raise RuntimeError(f"Font not found. Tried: {paths}")


def text_bbox(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int, int, int]:
    return draw.textbbox((0, 0), text, font=font)


def draw_with_effects(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    text: str,
    font: ImageFont.ImageFont,
    fill_rgba: tuple[int, int, int, int],
    stroke_rgba: tuple[int, int, int, int],
    stroke_px: int,
    shadow_rgba: tuple[int, int, int, int],
    shadow_dx: int,
    shadow_dy: int,
) -> None:
    
    draw.text((x + shadow_dx, y + shadow_dy), text, font=font, fill=shadow_rgba)

    for ox in range(-stroke_px, stroke_px + 1):
        for oy in range(-stroke_px, stroke_px + 1):
            if ox == 0 and oy == 0:
                continue
            if (ox * ox + oy * oy) > (stroke_px * stroke_px):
                continue
            draw.text((x + ox, y + oy), text, font=font, fill=stroke_rgba)

    # Fill
    draw.text((x, y), text, font=font, fill=fill_rgba)


def main() -> None:
    view_w, view_h = 306, 45

    scale = 3

    step_px = 2  
    frame_ms = 40 

    blue = (0, 0, 255, 255)  # #0000FF
    white = (255, 255, 255, 255)
    shadow = (0, 0, 0, 180)

    # Fonts (Windows)
    main_font = pick_font(
        [
            r"C:\Windows\Fonts\arialbd.ttf",  # Arial Bold
            r"C:\Windows\Fonts\segoeuib.ttf",  # Segoe UI Bold
            r"C:\Windows\Fonts\trebucbd.ttf",  # Trebuchet Bold
        ],
        size=30 * scale,
    )
    symbol_font = pick_font(
        [
            r"C:\Windows\Fonts\seguisym.ttf",  # Segoe UI Symbol (✦)
        ],
        size=30 * scale,
    )

    tokens_one_unit: list[tuple[str, ImageFont.ImageFont]] = [
        ("Necdet Şanlı", main_font),
        ("  ", main_font),
        ("✦", symbol_font),
        ("  ", main_font),
    ]

    tmp = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    dtmp = ImageDraw.Draw(tmp)

    unit_w_hi = 0
    max_ascent = 0
    max_descent = 0

    for t, f in tokens_one_unit:
        b = text_bbox(dtmp, t, f)
        unit_w_hi += (b[2] - b[0])

        ascent, descent = f.getmetrics()
        if ascent > max_ascent:
            max_ascent = ascent
        if descent > max_descent:
            max_descent = descent

    line_h_hi = max_ascent + max_descent

    needed_hi = (view_w * scale) + unit_w_hi + 200
    repeats = max(6, math.ceil(needed_hi / max(1, unit_w_hi)) + 2)

    tokens = tokens_one_unit * repeats

    strip_w_hi = unit_w_hi * repeats
    strip_h_hi = view_h * scale

    strip_hi = Image.new("RGBA", (strip_w_hi, strip_h_hi), (0, 0, 0, 0))
    d = ImageDraw.Draw(strip_hi)

    baseline_y_hi = (strip_h_hi - line_h_hi) // 2 + max_ascent

    symbol_y_adjust_hi = 0  # try: -1 * scale

    x_hi = 0
    for t, f in tokens:
        ascent, _descent = f.getmetrics()
        y_token_hi = baseline_y_hi - ascent

        if t == "✦":
            y_token_hi += symbol_y_adjust_hi

        draw_with_effects(
            draw=d,
            x=x_hi,
            y=y_token_hi,
            text=t,
            font=f,
            fill_rgba=blue,
            stroke_rgba=white,
            stroke_px=2 * scale,
            shadow_rgba=shadow,
            shadow_dx=2 * scale,
            shadow_dy=2 * scale,
        )

        b = text_bbox(d, t, f)
        x_hi += (b[2] - b[0])

    strip_w = strip_w_hi // scale
    strip = strip_hi.resize((strip_w, view_h), Image.LANCZOS)

    strip2 = Image.new("RGBA", (strip_w * 2, view_h), (0, 0, 0, 0))
    strip2.paste(strip, (0, 0))
    strip2.paste(strip, (strip_w, 0))

    unit_w = unit_w_hi // scale
    offsets = list(range(0, unit_w, step_px))

    frames: list[Image.Image] = []
    for off in offsets:
        frames.append(strip2.crop((off, 0, off + view_w, view_h)))

    # Save APNG
    out = Path("necdet_scroll.png")
    frames[0].save(
        out,
        save_all=True,
        append_images=frames[1:],
        duration=frame_ms,
        loop=0,
        optimize=False,
    )

    print(f"Wrote {out} with {len(frames)} frames.")


if __name__ == "__main__":
    main()
