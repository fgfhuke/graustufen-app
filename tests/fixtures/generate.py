"""Erzeugt alle Testbilder und App-Symbole reproduzierbar. Aufruf: .venv/bin/python tests/fixtures/generate.py"""
import os, random, subprocess
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
def out(n): return os.path.join(HERE, n)

# 1. Grauverlauf 256x64, Pixel x hat Grauwert x
g = Image.new("RGB", (256, 64))
for x in range(256):
    for y in range(64): g.putpixel((x, y), (x, x, x))
g.save(out("gradient-256.png"))

# 2. Grundfarben
p = Image.new("RGB", (4, 1))
for i, c in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)]): p.putpixel((i, 0), c)
p.resize((64, 16), Image.NEAREST).save(out("color-patches.png"))

# 3. EXIF-Ausrichtung: Rohpixel 400x300, links dunkel -> rechts hell, roter Block oben links
def oriented(name, orientation):
    im = Image.new("RGB", (400, 300))
    for x in range(400):
        for y in range(300): im.putpixel((x, y), (x * 255 // 399,) * 3)
    ImageDraw.Draw(im).rectangle([0, 0, 40, 40], fill=(255, 0, 0))
    ex = im.getexif(); ex[0x0112] = orientation
    im.save(out(name), quality=95, exif=ex)
oriented("portrait-exif6.jpg", 6)
oriented("landscape-exif8.jpg", 8)

# 4. Klein, transparent
Image.new("RGB", (16, 16), (120, 120, 120)).save(out("small-16x16.png"))
t = Image.new("RGBA", (32, 32), (0, 0, 0, 0)); ImageDraw.Draw(t).rectangle([0, 0, 15, 31], fill=(0, 0, 0, 255)); t.save(out("transparent.png"))

# 5. Sehr gross: 9000x6700 = 60,3 MP (nur wenn nicht vorhanden)
if not os.path.exists(out("huge-9000x6700.jpg")):
    random.seed(1)
    small = Image.new("RGB", (900, 670))
    px = small.load()
    for x in range(900):
        for y in range(670): px[x, y] = (x * 255 // 899, y * 255 // 669, (x + y) * 255 // 1568)
    small.resize((9000, 6700), Image.BICUBIC).save(out("huge-9000x6700.jpg"), quality=85)

# 6. Defekt / falsche Endung
data = open(out("portrait-exif6.jpg"), "rb").read()
open(out("truncated.jpg"), "wb").write(data[: len(data) // 3])
open(out("fake.heic"), "w").write("Das ist kein Bild.")

# 7. HEIC mit macOS-Bordmittel
for src, name in [("portrait-exif6.jpg", "sample-portrait.heic"), ("landscape-exif8.jpg", "sample-landscape.heic")]:
    subprocess.run(["sips", "-s", "format", "heic", out(src), "--out", out(name)], check=False, capture_output=True)

# 8. App-Symbole: Vier Graustufen-Balken
icons = os.path.join(ROOT, "public", "icons"); os.makedirs(icons, exist_ok=True)
def icon(size, path, pad=0.0):
    im = Image.new("RGB", (size, size), (43, 43, 43)); d = ImageDraw.Draw(im)
    m = int(size * (0.18 + pad)); w = (size - 2 * m) // 4
    for i in range(4):
        v = round(255 * i / 3); d.rectangle([m + i * w, m, m + (i + 1) * w - 1, size - m], fill=(v, v, v))
    im.save(path)
icon(192, os.path.join(icons, "icon-192.png")); icon(512, os.path.join(icons, "icon-512.png"), 0.06)
icon(180, os.path.join(icons, "apple-touch-icon.png"))
print("fertig")
