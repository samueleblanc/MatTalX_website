#!/usr/bin/env python3
"""Builds images/og-card.png, the picture shown when a link to the site is pasted.

A card is drawn at 1200x630 and shown at about 500 wide, so it is a poster rather than a
screenshot: at that size the text in a screenshot of a text box cannot be read, and
nothing in it says whose the link is. This one carries the wordmark, the line the home
page leads with, one conversion large enough to survive the shrinking, and the two things
a stranger wants to know before installing an extension.

The mathematics is set in FreeSerif because it is the only face installed here that
covers the whole of it -- the Mathematical Alphanumerics, the sum, the double arrow and
the subscript n. Run: python3 tools/build-card.py
"""

from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, "images/og-card.png")

W, H = 1200, 630
INK, SOFT, GREEN, PAPER = (22, 33, 29), (92, 107, 100), (10, 101, 77), (255, 255, 255)
CAP, CAP_EDGE, CAP_SHADOW, RULE = PAPER, (176, 187, 182), (206, 214, 210), (228, 234, 231)

MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MATH = "/usr/share/fonts/truetype/freefont/FreeSerif.ttf"

TAGLINE = "Write math anywhere"
WRITTEN = r"\sum_n a_n \to c \implies (a_n)_n \to 0"
GIVEN   = "∑ₙ𝑎ₙ → 𝑐 ⟹ (𝑎ₙ)ₙ → 0"
KEYS    = ["Alt", "Shift", "W"]
FOOTER  = "Free and open source  ·  Chrome and Firefox  ·  mattalx.org"


def build():
    im = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(im)
    centre = lambda text, font: (W - d.textlength(text, font=font)) // 2

    mark = Image.open(os.path.join(ROOT, "images/mattalx_logo_nobg_light.png")).convert("RGBA")
    mw = 300
    mark = mark.resize((mw, round(mark.height * mw / mark.width)), Image.LANCZOS)
    im.paste(mark, ((W - mw) // 2, 54), mark)

    f_tag = ImageFont.truetype(SANS, 26)
    d.text((centre(TAGLINE, f_tag), 54 + mark.height + 6), TAGLINE, font=f_tag, fill=GREEN)

    # a rule, so the demonstration reads as its own thing
    d.line([(320, 232), (W - 320, 232)], fill=RULE, width=1)

    f_written = ImageFont.truetype(MONO, 28)
    d.text((centre(WRITTEN, f_written), 286), WRITTEN, font=f_written, fill=SOFT)

    def keycap(x, y, label, fh=20):
        f = ImageFont.truetype(BOLD, fh)
        px, py = 12, 7
        w, h = d.textlength(label, font=f) + 2 * px, fh + 2 * py
        d.rounded_rectangle([x, y + 3, x + w, y + h + 3], 6, fill=CAP_SHADOW)
        d.rounded_rectangle([x, y, x + w, y + h], 6, fill=CAP, outline=CAP_EDGE)
        d.text((x + px, y + py - 3), label, font=f, fill=INK)
        return w

    fb, fp = ImageFont.truetype(BOLD, 20), ImageFont.truetype(SANS, 18)
    total = sum(d.textlength(k, font=fb) + 24 for k in KEYS) + (len(KEYS) - 1) * 20
    x, ky = (W - total) // 2, 342
    for i, k in enumerate(KEYS):
        x += keycap(x, ky, k)
        if i < len(KEYS) - 1:
            d.text((x + 4, ky + 6), "+", font=fp, fill=SOFT)
            x += 20

    f_given = ImageFont.truetype(MATH, 48)
    d.text((centre(GIVEN, f_given), ky + 62), GIVEN, font=f_given, fill=INK)

    f_foot = ImageFont.truetype(SANS, 24)
    d.text((centre(FOOTER, f_foot), 532), FOOTER, font=f_foot, fill=SOFT)

    im.save(OUT, optimize=True)
    print(f"  {os.path.relpath(OUT, ROOT)}  {im.size[0]}x{im.size[1]}  "
          f"{os.path.getsize(OUT)/1024:.0f} KB")


if __name__ == "__main__":
    build()
