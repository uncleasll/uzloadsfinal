"""Burn the who/when/where stamp into a photo so it survives forwarding and screenshots."""
from __future__ import annotations
import io

from PIL import Image, ImageDraw, ImageFont, ImageOps

MAX_SIDE = 1600


def stamp_photo(data: bytes, lines: list[str]) -> tuple[bytes, int, int]:
    """Returns JPEG bytes with a dark band at the bottom carrying the stamp text, plus width and height."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("RGB")
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    w, h = img.size
    font_size = max(14, w // 48)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", font_size)
    except OSError:
        font = ImageFont.load_default()
    pad = font_size // 2
    line_h = font_size + pad // 2
    band_h = pad * 2 + line_h * len(lines)
    out = Image.new("RGB", (w, h + band_h), (15, 23, 42))
    out.paste(img, (0, 0))
    draw = ImageDraw.Draw(out)
    y = h + pad
    for i, line in enumerate(lines):
        draw.text((pad, y), line, fill=(255, 255, 255) if i == 0 else (203, 213, 225), font=font)
        y += line_h
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=82, optimize=True)
    return buf.getvalue(), w, h
