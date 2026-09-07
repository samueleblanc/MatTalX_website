#!/usr/bin/env python3
"""Builds the home page slideshow from images/screenshot/.

The captures come in two shapes and neither is a slide on its own:

  <name>_<theme>_pre.png / _conv.png   the same text before and after converting
  subset_<theme>.webm                  a recording of a command being suggested

A pair becomes one picture with the shortcut drawn between its two halves, so a
still can show something that happens in place. The recording becomes one
picture with three of its frames down the left and the two shortcuts named down
the right. Every slide is padded to the same 1280x680, so the page does not
change height as you click through, and each takes its ground and its ink from
the capture itself.

Needs gst-launch-1.0 for the recording. Run: python3 tools/build-slides.py
"""

from PIL import Image, ImageDraw, ImageFont
import os, shutil, subprocess, sys, tempfile

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS  = os.path.join(ROOT, "images/screenshot")
IMAGES = os.path.join(ROOT, "images")
BOLD   = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SANS   = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

SLIDE_W, SLIDE_H = 1280, 680
GREEN = {"light": (10, 101, 77), "dark": (34, 185, 141)}

# Which frames of the recording to use, and where the text box and the open
# suggestion list sit inside a 840x305 frame
FRAMES   = {"typing": 18, "chosen": 45, "converted": 58}
BOX      = (0, 30, 840, 132)
BOX_LIST = (0, 30, 840, 298)


def palette(im):
    """Ground, ink and keycap colours, read off the capture's own background."""
    ground = im.convert("RGB").getpixel((im.width - 3, im.height - 3))
    dark = sum(ground) / 3 < 128
    return {
        "ground":  ground,
        "ink":     (235, 240, 238) if dark else (22, 33, 29),
        "soft":    (150, 162, 157) if dark else (92, 107, 100),
        "cap":     (43, 48, 56)    if dark else (255, 255, 255),
        "capEdge": (72, 80, 90)    if dark else (176, 187, 182),
        "capShad": (10, 12, 16)    if dark else (206, 214, 210),
        "accent":  GREEN["dark" if dark else "light"],
    }


def keycap(d, xy, label, p, fh=21):
    f = ImageFont.truetype(BOLD, fh)
    px, py = 13, 8
    x, y = xy
    w, h = d.textlength(label, font=f) + 2 * px, fh + 2 * py
    d.rounded_rectangle([x, y + 3, x + w, y + h + 3], 7, fill=p["capShad"])
    d.rounded_rectangle([x, y, x + w, y + h], 7, fill=p["cap"], outline=p["capEdge"])
    d.text((x + px, y + py - 3), label, font=f, fill=p["ink"])
    return w, h


def shortcut(d, xy, keys, note, p, wrap=None):
    """The keys, then what they do. Wrapped under the keys when wrap is given."""
    x0, y = xy
    x, h = x0, 0
    fplus, fnote = ImageFont.truetype(SANS, 19), ImageFont.truetype(SANS, 19)
    for i, k in enumerate(keys):
        w, h = keycap(d, (x, y), k, p)
        x += w
        if i < len(keys) - 1:
            d.text((x + 5, y + 7), "+", font=fplus, fill=p["soft"])
            x += 21
    if wrap is None:
        d.text((x + 22, y + 9), note, font=fnote, fill=p["accent"])
        return
    line, lines = "", []
    for word in note.split():
        trial = (line + " " + word).strip()
        if d.textlength(trial, font=fnote) > wrap:
            lines.append(line); line = word
        else:
            line = trial
    lines.append(line)
    ty = y + h + 12
    for l in lines:
        d.text((x0, ty), l, font=fnote, fill=p["accent"])
        ty += 26


def measure(note, keys):
    """Width of a one-line shortcut, so it can be centred."""
    d = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    fb, fn = ImageFont.truetype(BOLD, 21), ImageFont.truetype(SANS, 19)
    return (sum(d.textlength(k, font=fb) + 26 for k in keys)
            + (len(keys) - 1) * 21 + 22 + d.textlength(note, font=fn))


def from_pair(name, note, theme):
    a = Image.open(f"{SHOTS}/{name}_{theme}_pre.png").convert("RGB")
    b = Image.open(f"{SHOTS}/{name}_{theme}_conv.png").convert("RGB")
    p = palette(a)
    band = 74
    im = Image.new("RGB", (a.width, a.height + band + b.height), p["ground"])
    im.paste(a, (0, 0)); im.paste(b, (0, a.height + band))
    keys = ["Alt", "Shift", "W"]
    shortcut(ImageDraw.Draw(im),
             (int((a.width - measure(note, keys)) // 2), a.height + (band - 37) // 2),
             keys, note, p)
    return im


def from_recording(theme, frames_dir):
    stages = [
        Image.open(f"{frames_dir}/f{FRAMES['typing']:04d}.png").convert("RGB").crop(BOX_LIST),
        Image.open(f"{frames_dir}/f{FRAMES['chosen']:04d}.png").convert("RGB").crop(BOX),
        Image.open(f"{frames_dir}/f{FRAMES['converted']:04d}.png").convert("RGB").crop(BOX),
    ]
    p = palette(stages[1])
    gap, right, padx, pady = 10, 400, 26, 26
    height = sum(s.height for s in stages) + gap * (len(stages) - 1)
    im = Image.new("RGB", (stages[0].width + right + padx, height + 2 * pady), p["ground"])
    d = ImageDraw.Draw(im)
    tops, y = [], pady
    for s in stages:
        im.paste(s, (0, y)); tops.append(y); y += s.height + gap
    x = stages[0].width + padx - 14
    shortcut(d, (x, tops[0] + 40), ["Alt", "Shift", "C"],
             "suggests commands as you write", p, wrap=right - 30)
    shortcut(d, (x, tops[2] + 8), ["Alt", "Shift", "W"],
             "converts where you are writing", p, wrap=right - 30)
    return im


def to_slide(im, out):
    """Same canvas for every slide, and never enlarged: a screenshot scaled up is a
       blurred screenshot."""
    ground = im.getpixel((im.width - 3, im.height - 3))
    if im.width > SLIDE_W or im.height > SLIDE_H:
        r = min(SLIDE_W / im.width, SLIDE_H / im.height)
        im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
    canvas = Image.new("RGB", (SLIDE_W, SLIDE_H), ground)
    canvas.paste(im, ((SLIDE_W - im.width) // 2, (SLIDE_H - im.height) // 2))
    canvas.save(out, optimize=True)
    return os.path.getsize(out)


def frames_of(webm, into):
    os.makedirs(into, exist_ok=True)
    subprocess.run(["gst-launch-1.0", "-q", "filesrc", "location=" + webm,
                    "!", "decodebin", "!", "videoconvert", "!", "pngenc",
                    "!", "multifilesink", "location=" + into + "/f%04d.png"],
                   check=True, capture_output=True, timeout=120)


PAIRS = [
    ("alpha", "converts where you are writing"),
    ("oint",  "converts where you are writing"),
    ("built", "build your own commands easily"),
    ("chess", "850 commands, more than just math"),
]

def main():
    total = 0
    with tempfile.TemporaryDirectory() as tmp:
        for theme in ("light", "dark"):
            for name, note in PAIRS:
                out = f"{IMAGES}/slide_{name}_{theme}.png"
                total += to_slide(from_pair(name, note, theme), out)
                print(f"  {os.path.basename(out):32} {os.path.getsize(out)/1024:6.0f} KB")
            frames_of(f"{SHOTS}/subset_{theme}.webm", f"{tmp}/{theme}")
            out = f"{IMAGES}/slide_completion_{theme}.png"
            total += to_slide(from_recording(theme, f"{tmp}/{theme}"), out)
            print(f"  {os.path.basename(out):32} {os.path.getsize(out)/1024:6.0f} KB")
            # the popup needs no drawing on, only the same canvas as the rest
            out = f"{IMAGES}/slide_popup_{theme}.png"
            total += to_slide(Image.open(f"{SHOTS}/popup_{theme}.png").convert("RGB"), out)
            print(f"  {os.path.basename(out):32} {os.path.getsize(out)/1024:6.0f} KB")
    print(f"\n  {total/1024:.0f} KB for all twelve; a visit fetches one")

if __name__ == "__main__":
    main()
