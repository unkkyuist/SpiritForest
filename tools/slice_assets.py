"""Slice the 11 tile/special-item sprites out of asset.webp.

Detects bright connected regions on the black background, keeps the
large square-ish ones (the tiles; text labels get filtered out), then
crops each and applies a rounded-rect alpha mask.
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "asset.webp")
OUT_TILES = os.path.join(ROOT, "assets", "tiles")
OUT_SPECIAL = os.path.join(ROOT, "assets", "specials")

TILE_NAMES = ["suseu", "sweetbee", "nyangure", "reure", "neutinamu", "myangi", "ryangryang"]
SPECIAL_NAMES = ["rainbow", "wind", "blessing", "burst"]

img = Image.open(SRC).convert("RGB")
W, H = img.size
print(f"source: {W}x{H}")

# Downscale for fast connected-component labeling
SCALE = 4
small = img.resize((W // SCALE, H // SCALE))
sw, sh = small.size
px = small.load()

THRESH = 35  # brightness above which a pixel counts as "tile"
mask = [[(px[x, y][0] + px[x, y][1] + px[x, y][2]) / 3 > THRESH for x in range(sw)] for y in range(sh)]

visited = [[False] * sw for _ in range(sh)]
boxes = []
for y0 in range(sh):
    for x0 in range(sw):
        if mask[y0][x0] and not visited[y0][x0]:
            stack = [(x0, y0)]
            visited[y0][x0] = True
            minx = maxx = x0
            miny = maxy = y0
            area = 0
            while stack:
                x, y = stack.pop()
                area += 1
                minx, maxx = min(minx, x), max(maxx, x)
                miny, maxy = min(miny, y), max(maxy, y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < sw and 0 <= ny < sh and mask[ny][nx] and not visited[ny][nx]:
                        visited[ny][nx] = True
                        stack.append((nx, ny))
            w = maxx - minx + 1
            h = maxy - miny + 1
            if w > 25 and h > 25 and 0.75 < w / h < 1.33 and area > 0.6 * w * h:
                boxes.append((minx * SCALE, miny * SCALE, (maxx + 1) * SCALE, (maxy + 1) * SCALE))

print(f"detected {len(boxes)} tile boxes")
if len(boxes) != 11:
    for b in boxes:
        print(b)
    sys.exit("expected 11 boxes, aborting")

# Split into the two rows by vertical midpoint, sort each left-to-right
boxes.sort(key=lambda b: b[1])
top = sorted(boxes[:7], key=lambda b: b[0])
bottom = sorted(boxes[7:], key=lambda b: b[0])
assert len(top) == 7 and len(bottom) == 4, "row split failed"

os.makedirs(OUT_TILES, exist_ok=True)
os.makedirs(OUT_SPECIAL, exist_ok=True)

def save_crop(box, path):
    crop = img.crop(box).convert("RGBA")
    cw, ch = crop.size
    radius = int(cw * 0.16)
    m = Image.new("L", (cw, ch), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, cw - 1, ch - 1], radius=radius, fill=255)
    crop.putalpha(m)
    crop.save(path)
    print(f"saved {path} ({cw}x{ch})")

for box, name in zip(top, TILE_NAMES):
    save_crop(box, os.path.join(OUT_TILES, f"{name}.png"))
for box, name in zip(bottom, SPECIAL_NAMES):
    save_crop(box, os.path.join(OUT_SPECIAL, f"{name}.png"))
print("done")
