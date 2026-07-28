"""Render the extension icon (concept 1, variant B) to PNG at 16/48/128.

The artwork is a filled job-application form: a solid black page with a red
folded corner, three paper-coloured field bars, and a green confirmation check.
Drawn as plain geometry rather than from an SVG, since no SVG rasteriser is
available here. Everything is drawn at 8x and downsampled, which is what gives
the curves and the diagonal fold their antialiasing.
"""

from PIL import Image, ImageDraw

BLACK = (0x16, 0x13, 0x0F, 255)
RED = (0xC4, 0x29, 0x2F, 255)
PAPER = (0xF5, 0xF2, 0xEC, 255)
GREEN = (0x27, 0xA9, 0x71, 255)

SS = 8  # supersample factor


def rounded_page_mask(draw, box, r, cut):
    """Page silhouette: a rounded rect with its top-right corner cut away."""
    x0, y0, x1, y1 = box
    draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=255)
    if cut:
        cx, cy = cut  # the diagonal runs from (cx, y0) to (x1, cy)
        draw.polygon([(cx, y0), (x1 + 1, y0), (x1 + 1, cy)], fill=0)


def stroke(draw, points, width, colour):
    """Polyline with round caps and joins."""
    draw.line(points, fill=colour, width=int(round(width)))
    r = width / 2
    for x, y in points:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=colour)


def render(target, spec):
    canvas = target * SS
    s = canvas / 128.0  # design units -> device pixels

    def P(*vals):
        return [v * s for v in vals]

    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))

    # --- page silhouette, via a mask so the corner can be cut away ---
    mask = Image.new("L", (canvas, canvas), 0)
    mdraw = ImageDraw.Draw(mask)
    x0, y0, x1, y1 = P(*spec["page"])
    rounded_page_mask(mdraw, (x0, y0, x1, y1), spec["radius"] * s, P(*spec["cut"]))
    page = Image.new("RGBA", (canvas, canvas), BLACK)
    img.paste(page, (0, 0), mask)

    draw = ImageDraw.Draw(img)

    # --- red folded corner ---
    fx, fy = spec["cut"]
    draw.polygon([(fx * s, y0), (x1, fy * s), (fx * s, fy * s)], fill=RED)

    # --- paper field bars ---
    for bx, by, bw, bh in spec["bars"]:
        draw.rounded_rectangle(
            P(bx, by, bx + bw, by + bh), radius=(bh / 2) * s, fill=PAPER
        )

    # --- green confirmation check ---
    stroke(draw, [(x * s, y * s) for x, y in spec["check"]], spec["check_w"] * s, GREEN)

    return img.resize((target, target), Image.LANCZOS)


# Geometry is tuned per size: at 16px the third bar and the thinner strokes
# turn to mush, so that version drops to a single bar and a heavier check.
FULL = {
    "page": (30, 14, 98, 114),
    "radius": 10,
    "cut": (78, 34),
    "bars": [(42, 54, 44, 7), (42, 70, 44, 7), (42, 86, 24, 7)],
    "check": [(70, 88), (78, 96), (94, 78)],
    "check_w": 8,
}

SMALL = {
    "page": (36, 8, 102, 118),
    "radius": 12,
    "cut": (76, 34),
    "bars": [(40, 56, 48, 11)],
    "check": [(60, 88), (72, 100), (102, 70)],
    "check_w": 14,
}

OUT = "/Users/harshitadidwania/application-extension/icons"

if __name__ == "__main__":
    import os

    os.makedirs(OUT, exist_ok=True)
    for size, spec in ((128, FULL), (48, FULL), (16, SMALL)):
        path = f"{OUT}/icon{size}.png"
        render(size, spec).save(path)
        print("wrote", path)
