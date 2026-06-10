"""Slice Via character poses from asset2.webp and remove the cream background.

Poses (from the 포즈 모음 row of the character sheet):
  - idle: 기본(팔짱)  arms crossed
  - jump: 신나서 점프  excited jump
"""
import sys
from collections import deque
from PIL import Image, ImageFilter

SRC = r"C:\DevWork\GodotGame\SpiritForest\asset2.webp"
OUT_DIR = r"C:\DevWork\GodotGame\SpiritForest\assets\via"

# crop boxes (left, top, right, bottom) at 1254x1254
BOXES = {
    "idle": (262, 462, 412, 700),
    "jump": (730, 448, 916, 700),
}


def flood_remove_bg(img, tol=26):
    """Remove background by flood-filling from the border pixels."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()

    # sample border color (corners average)
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def is_bg(p):
        return all(abs(p[i] - bg[i]) <= tol for i in range(3))

    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y][x] and is_bg(px[x, y]):
                seen[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y][x] and is_bg(px[x, y]):
                seen[y][x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and is_bg(px[nx, ny]):
                seen[ny][nx] = True
                q.append((nx, ny))
    return img


def clean_edges(img, erode=2, blur=0.8):
    """Erode the alpha mask to eat the leftover cream halo, then soften."""
    a = img.getchannel("A")
    for _ in range(erode):
        a = a.filter(ImageFilter.MinFilter(3))
    a = a.filter(ImageFilter.GaussianBlur(blur))
    img.putalpha(a)
    return img


def autocrop(img):
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def main():
    import os
    os.makedirs(OUT_DIR, exist_ok=True)
    src = Image.open(SRC)
    for name, box in BOXES.items():
        crop = src.crop(box)
        out = autocrop(clean_edges(flood_remove_bg(crop, tol=26), erode=1, blur=0.6))
        path = os.path.join(OUT_DIR, f"{name}.png")
        out.save(path)
        print(name, out.size, "->", path)


if __name__ == "__main__":
    main()
