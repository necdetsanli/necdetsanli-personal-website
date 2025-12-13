from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageSequence


def make_seamless_frame(frame: Image.Image) -> Image.Image:
    rgba = frame.convert("RGBA")
    w, h = rgba.size

    big = Image.new("RGBA", (w * 2, h * 2), (0, 0, 0, 0))

    big.paste(rgba, (0, 0))
    big.paste(rgba.transpose(Image.Transpose.FLIP_LEFT_RIGHT), (w, 0))
    big.paste(rgba.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, h))
    big.paste(rgba.transpose(Image.Transpose.ROTATE_180), (w, h))

    left = w // 2
    top = h // 2
    return big.crop((left, top, left + w, top + h))


def is_animated(img: Image.Image) -> bool:
    try:
        return bool(getattr(img, "is_animated", False)) and int(getattr(img, "n_frames", 1)) > 1
    except Exception:
        return False


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: py make_tile_seamless.py <input.gif/png> <output.gif/png>")
        raise SystemExit(2)

    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()

    if not input_path.exists():
        raise FileNotFoundError(f"Input not found: {input_path}")

    img = Image.open(input_path)

    if is_animated(img):
        frames: List[Image.Image] = []
        durations: List[int] = []

        for f in ImageSequence.Iterator(img):
            frames.append(make_seamless_frame(f))
            durations.append(int(f.info.get("duration", img.info.get("duration", 80))))

        loop = int(img.info.get("loop", 0))

        frames[0].save(
            output_path,
            save_all=True,
            append_images=frames[1:],
            duration=durations,
            loop=loop,
            optimize=True,
            disposal=2,
        )
    else:
        out = make_seamless_frame(img)
        out.save(output_path)

    print(f"Wrote: {output_path}")


if __name__ == "__main__":
    main()
