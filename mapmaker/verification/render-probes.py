from pathlib import Path
import json
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BASE_PATH = ROOT / 'mapmaker' / 'assets' / 'territori-base.png'
base = Image.open(BASE_PATH).convert('RGBA')
width, height = base.size
(HERE / 'base.rgba').write_bytes(base.tobytes())
(HERE / 'base-meta.json').write_text(json.dumps({'width': width, 'height': height}), encoding='utf-8')
run = subprocess.run(['node', str(HERE / 'run-probes.cjs')], cwd=ROOT, check=True, text=True, capture_output=True)
print(run.stdout)

def read_raw(name):
    return Image.frombytes('RGBA', (width, height), (HERE / f'{name}.rgba').read_bytes())

source = Image.open(BASE_PATH).convert('RGBA')
clean = read_raw('clean-map')
edges = read_raw('base-edges')
river_overlay = Image.alpha_composite(source, read_raw('river-candidates')).convert('RGB')
river_overlay.save(HERE / 'river-pixel-diagnostic.png', optimize=True)

def composite(name):
    mask = read_raw(f'{name}-mask').getchannel('A')
    underpaint = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    underpaint.paste(clean, (0, 0), mask)
    result = Image.alpha_composite(source, underpaint)
    result = Image.alpha_composite(result, read_raw(f'{name}-paint'))
    result = Image.alpha_composite(result, read_raw(f'{name}-preserved-edges'))
    result = Image.alpha_composite(result, read_raw(f'{name}-border'))
    return result.convert('RGB')

results = {name: composite(name) for name in ('separated', 'merged', 'river')}
try:
    title_font = ImageFont.truetype('arial.ttf', 30)
    body_font = ImageFont.truetype('arial.ttf', 19)
except OSError:
    title_font = ImageFont.load_default()
    body_font = ImageFont.load_default()

summary = json.loads((HERE / 'probe-summary.json').read_text(encoding='utf-8'))
bx, by = summary['sharedBoundary']
zoom_box = (max(0, bx - 170), max(0, by - 110), min(width, bx + 240), min(height, by + 160))

def make_card(title, body, image, crop=None):
    if crop:
        image = image.crop(crop)
    image.thumbnail((720, 520), Image.Resampling.LANCZOS)
    card = Image.new('RGB', (760, 590), '#f5f7fa')
    draw = ImageDraw.Draw(card)
    draw.text((22, 18), title, font=title_font, fill='#14222c')
    draw.text((22, 58), body, font=body_font, fill='#40515d')
    x = (760 - image.width) // 2
    card.paste(image, (x, 92))
    return card

cards = [
    make_card('Prima: due pezzi separati', 'Stesso Stato, due pennellate non collegate', results['separated'], zoom_box),
    make_card('Dopo: un solo blocco', 'Il raccordo attraversa il confine originale', results['merged'], zoom_box),
    make_card('Pennellata sul fiume', 'La pennellata resta continua; il fiume non diventa un bordo', results['river'], (960, 170, 1530, 620)),
]
sheet = Image.new('RGB', (1560, 1220), '#e8edf2')
positions = [(10, 10), (790, 10), (400, 620)]
for card, position in zip(cards, positions):
    sheet.paste(card, position)
sheet.save(HERE / 'border-probes.png', optimize=True)
results['merged'].save(HERE / 'merged-full.png', optimize=True)
print(f'Wrote {HERE / "border-probes.png"}')
print(f'Wrote {HERE / "merged-full.png"}')
print(f'Wrote {HERE / "river-pixel-diagnostic.png"}')
