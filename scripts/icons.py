# Génère les icônes PWA de PEAnalyze (pictogramme « trending-up » blanc sur vert #007461)
from PIL import Image, ImageDraw
import sys, os
out = sys.argv[1]
GREEN = (0, 116, 97, 255)
def draw(size, pad_ratio, radius_ratio, path):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(S * radius_ratio)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=GREEN)
    pad = S * pad_ratio
    scale = (S - 2 * pad) / 24
    w = max(2, int(2.2 * scale))
    def P(x, y): return (pad + x * scale, pad + y * scale)
    for line in ([(22, 7), (13.5, 15.5), (8.5, 10.5), (2, 17)], [(16, 7), (22, 7), (22, 13)]):
        pts = [P(*p) for p in line]
        d.line(pts, fill='white', width=w, joint='curve')
        for p in pts:
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill='white')
    img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(out, path))
os.makedirs(out, exist_ok=True)
draw(512, 0.22, 0.0, 'icon-maskable-512.png')   # adaptative Android (zone sûre ~80 %)
draw(192, 0.22, 0.0, 'icon-maskable-192.png')
draw(512, 0.16, 0.22, 'icon-512.png')
draw(192, 0.16, 0.22, 'icon-192.png')
draw(180, 0.18, 0.0, 'apple-touch-icon.png')
draw(32, 0.12, 0.22, 'favicon-32.png')
print('ok')
