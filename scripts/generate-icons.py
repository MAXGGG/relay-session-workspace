"""Regenerate committed desktop icons: python -m pip install Pillow; python scripts/generate-icons.py."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "assets"
scale = 2
image = Image.new("RGBA", (1024 * scale, 1024 * scale))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle(tuple(v * scale for v in (24, 24, 1000, 1000)), radius=224 * scale, fill="#14201d")
points = [(270, 280), (754, 280), (754, 392), (438, 632), (754, 632), (754, 744), (270, 744), (270, 632), (586, 392), (270, 392)]
draw.polygon([(x * scale, y * scale) for x, y in points], fill="#c7ef78")
draw.ellipse(tuple(v * scale for v in (752, 162, 864, 274)), fill="#c7ef78")
image = image.resize((1024, 1024), Image.Resampling.LANCZOS)
image.save(root / "icon.png")
image.save(root / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
tray = Image.new("RGBA", (64, 64))
draw = ImageDraw.Draw(tray)
draw.polygon([(10, 14), (54, 14), (54, 23), (24, 42), (54, 42), (54, 51), (10, 51), (10, 42), (40, 23), (10, 23)], fill="#c7ef78")
tray.resize((32, 32), Image.Resampling.LANCZOS).save(root / "tray.png")
