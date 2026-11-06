"""Klatki z filmów YouTube (miniatury generowane przez YouTube: 25/50/75% filmu) w jednym obrazie.
Użycie: python3 -I kod/klatki.py wyjscie.jpg YT_ID [YT_ID ...]   (do 4 filmów)
Potem obejrzyj wyjscie.jpg narzędziem Read. Bez pobierania samego filmu."""
import sys, urllib.request, io
from PIL import Image, ImageDraw
wyj, ids = sys.argv[1], sys.argv[2:6]
W, H = 320, 180
m = Image.new("RGB", (W * 3, H * len(ids)), "white")
for r, yt in enumerate(ids):
    for c, n in enumerate(("hq1", "hq2", "hq3")):
        try:
            dane = urllib.request.urlopen(f"https://i.ytimg.com/vi/{yt}/{n}.jpg", timeout=20).read()
            im = Image.open(io.BytesIO(dane)).convert("RGB").resize((W, H))
        except Exception as e:
            im = Image.new("RGB", (W, H), "gray")
        d = ImageDraw.Draw(im); d.rectangle([0, 0, 150, 14], fill="yellow"); d.text((3, 2), f"{yt} {n}", fill="black")
        m.paste(im, (c * W, r * H))
m.save(wyj, quality=75)
print(wyj)
