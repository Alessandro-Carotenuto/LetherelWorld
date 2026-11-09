from pathlib import Path
import json
import shutil
import subprocess
import sys
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BASE_PATH = ROOT / 'mapmaker' / 'assets' / 'territori-base.png'
NEUTRAL_PATH = ROOT / 'mapmaker' / 'assets' / 'territori-neutral.png'
WORK = HERE / '.work'
WORK.mkdir(exist_ok=True)
base = Image.open(BASE_PATH).convert('RGBA')
width, height = base.size
neutral_source = Image.open(NEUTRAL_PATH).convert('RGBA')
neutral_aligned = Image.new('RGBA', (width, height), (180, 210, 243, 255))
neutral_aligned.paste(neutral_source, (0, -22))
(WORK / 'neutral.rgba').write_bytes(neutral_aligned.tobytes())
(WORK / 'base.rgba').write_bytes(base.tobytes())
(WORK / 'base-meta.json').write_text(json.dumps({'width': width, 'height': height}), encoding='utf-8')
command = ['node', str(HERE / 'run-probes.cjs')]
if len(sys.argv) > 1:
    command.append(sys.argv[1])
run = subprocess.run(command, cwd=ROOT, check=True, text=True, capture_output=True)
print(run.stdout)

def read_raw(name):
    return Image.frombytes('RGBA', (width, height), (WORK / f'{name}.rgba').read_bytes())

source = Image.open(BASE_PATH).convert('RGBA')
edges = read_raw('base-edges')
river_overlay = Image.alpha_composite(source, read_raw('river-candidates')).convert('RGB')
river_overlay.save(HERE / 'river-pixel-diagnostic.png', optimize=True)

def composite(name):
    erase_alpha = read_raw(f'{name}-erase').getchannel('A')
    keep_alpha = ImageOps.invert(erase_alpha)
    paint = read_raw(f'{name}-paint')
    base_fill = read_raw('base-state-fill')
    base_alpha = ImageChops.multiply(base_fill.getchannel('A'), keep_alpha)
    base_alpha = ImageChops.multiply(base_alpha, ImageOps.invert(paint.getchannel('A')))
    base_fill.putalpha(base_alpha.point(lambda value: round(value * .7)))
    result = Image.alpha_composite(read_raw('neutral-map'), base_fill)
    paint.putalpha(paint.getchannel('A').point(lambda value: round(value * .7)))
    result = Image.alpha_composite(result, paint)
    result = Image.alpha_composite(result, read_raw(f'{name}-preserved-edges'))
    result = Image.alpha_composite(result, read_raw(f'{name}-border'))
    return result.convert('RGB')

results = {name: composite(name) for name in ('untouchedPreset', 'separated', 'merged', 'river', 'sameColorRiver', 'sameColorIgglopoltEdge', 'igglopoltEdgeExtension', 'igglopoltWideExtension', 'erasePreset', 'eraseAntialias', 'eraseBlankNearState', 'eraseAcrossBoundary', 'eraseSharedBoundary', 'repaintErased')}
if not np.array_equal(np.asarray(results['untouchedPreset']), np.asarray(results['eraseBlankNearState'])):
    raise AssertionError('Erasing unpainted land changed the visible preset map')
results['erasePreset'].save(HERE / 'erase-preset-full.png', optimize=True)
results['eraseAntialias'].save(HERE / 'erase-antialias-full.png', optimize=True)
results['eraseBlankNearState'].save(HERE / 'erase-blank-near-state-full.png', optimize=True)
results['eraseAcrossBoundary'].save(HERE / 'erase-boundary-full.png', optimize=True)
results['eraseSharedBoundary'].save(HERE / 'erase-shared-boundary-full.png', optimize=True)
results['repaintErased'].save(HERE / 'repaint-erased-full.png', optimize=True)
if len(sys.argv) > 1:
    results['projectReplay'] = composite('projectReplay')
    results['projectReplay'].save(HERE / 'project-replay-full.png', optimize=True)
    results['projectReplayFringe'] = composite('projectReplayFringe')
    results['projectReplayFringe'].save(HERE / 'project-replay-fringe-full.png', optimize=True)
    results['erasePaintedExtension'] = composite('erasePaintedExtension')
    results['erasePaintedExtension'].save(HERE / 'erase-painted-extension-full.png', optimize=True)
    neutral_pixels = np.asarray(read_raw('neutral-map'))[:, :, :3].astype(np.float32)
    fill_pixels = np.asarray(read_raw('base-state-fill'))
    paint_pixels = np.asarray(read_raw('projectReplay-paint'))
    border_alpha = np.asarray(read_raw('projectReplay-border'))[:, :, 3]
    preserved_alpha = np.asarray(read_raw('projectReplay-preserved-edges'))[:, :, 3]
    rendered_pixels = np.asarray(results['projectReplay']).astype(np.float32)
    overlap = (fill_pixels[:, :, 3] == 255) & (paint_pixels[:, :, 3] == 255)
    overlap &= (border_alpha == 0) & (preserved_alpha == 0)
    expected_overlap = np.rint(neutral_pixels * .3 + paint_pixels[:, :, :3] * .7)
    overlap_error = np.abs(rendered_pixels[overlap] - expected_overlap[overlap])
    if int(overlap.sum()) < 100 or float(overlap_error.max()) > 1:
        raise AssertionError('Overlapping state and brush did not retain fixed 70% opacity')
    river = (fill_pixels[:, :, 0] == 246) & (fill_pixels[:, :, 1] == 171) & (fill_pixels[:, :, 2] == 175)
    river &= (fill_pixels[:, :, 3] == 255) & (paint_pixels[:, :, 3] == 0)
    river &= (neutral_pixels[:, :, 0] < 220) & (border_alpha == 0) & (preserved_alpha == 0)
    if int(river.sum()) < 100:
        raise AssertionError('The neutral map lost the rivers beneath preset states')
    print(f'70% overlap pixels checked: {int(overlap.sum())}; visible river pixels under Igglopolt: {int(river.sum())}')
editable_maps = {
    'Preset': Image.alpha_composite(read_raw('neutral-map'), read_raw('base-state-fill')),
    'Colore modificato': Image.alpha_composite(read_raw('neutral-map'), read_raw('edited-state-fill')),
    'Stato eliminato': Image.alpha_composite(read_raw('deleted-state-neutral'), read_raw('deleted-state-fill')),
}
editable_maps['Stato eliminato'].convert('RGB').save(HERE / 'deleted-state-full.png', optimize=True)
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
    make_card('Unione attraverso il fiume', 'Il bordo segue la zona unita, non il corso d’acqua', results['river'], (260, 390, 600, 555)),
    make_card('Stesso colore dentro la Casata', 'La pennellata attraversa il fiume senza creare un nuovo bordo', results['sameColorRiver'], (100, 390, 440, 500)),
]
sheet = Image.new('RGB', (1560, 1220), '#e8edf2')
positions = [(10, 10), (790, 10), (10, 620), (790, 620)]
for card, position in zip(cards, positions):
    sheet.paste(card, position)
sheet.save(HERE / 'border-probes.png', optimize=True)
results['merged'].save(HERE / 'merged-full.png', optimize=True)

roughness_cards = []
for value, label in ((0, '0% — bordo liscio'), (35, '35% — irregolarità leggera'), (100, '100% — bordo molto frastagliato')):
    key = str(value).zfill(3)
    underlay = results['untouchedPreset'].crop((130, 425, 430, 495)).convert('RGBA')
    mask = read_raw(f'brush-roughness-{key}').getchannel('A').crop((130, 425, 430, 495))
    stroke = Image.new('RGBA', underlay.size, '#387ca8')
    stroke.putalpha(mask.point(lambda alpha: round(alpha * .7)))
    underlay.alpha_composite(stroke)
    edge = mask.filter(ImageFilter.MaxFilter(3))
    edge = ImageChops.subtract(edge, mask)
    outline = Image.new('RGBA', underlay.size, '#263238')
    outline.putalpha(edge)
    underlay.alpha_composite(outline)
    roughness_cards.append(make_card(f'Frastagliazione {value}%', label, underlay.convert('RGB')))
roughness_sheet = Image.new('RGB', (2340, 620), '#e8edf2')
for card, position in zip(roughness_cards, ((10, 10), (790, 10), (1570, 10))):
    roughness_sheet.paste(card, position)
roughness_sheet.save(HERE / 'brush-roughness-probes.png', optimize=True)

eraser_cards = []
for value, label in ((0, '0% — cancellatura regolare'), (35, '35% — bordo mosso'), (100, '100% — bordo molto frastagliato')):
    key = str(value).zfill(3)
    crop = (130, 425, 430, 495)
    mask = read_raw(f'eraser-roughness-{key}').getchannel('A')
    fill = read_raw('base-state-fill').crop(crop)
    erased_alpha = ImageChops.multiply(fill.getchannel('A'), ImageOps.invert(mask.crop(crop)))
    fill.putalpha(erased_alpha.point(lambda alpha: round(alpha * .7)))
    erased_map = Image.alpha_composite(read_raw('neutral-map').crop(crop), fill)
    cropped_mask = mask.crop(crop)
    edge = ImageChops.subtract(cropped_mask.filter(ImageFilter.MaxFilter(3)), cropped_mask)
    outline = Image.new('RGBA', erased_map.size, '#263238')
    outline.putalpha(edge)
    erased_map = Image.alpha_composite(erased_map, outline)
    eraser_cards.append(make_card(f'Gomma {value}%', label, erased_map.convert('RGB')))
eraser_sheet = Image.new('RGB', (2340, 620), '#e8edf2')
for card, position in zip(eraser_cards, ((10, 10), (790, 10), (1570, 10))):
    eraser_sheet.paste(card, position)
eraser_sheet.save(HERE / 'eraser-roughness-probes.png', optimize=True)
edge_metrics = summary['igglopoltEdgeStroke']
edge_crop = (55, 350, 510, 490)
edge_before = make_card('Prima della pennellata', 'Contorno originale di Casata Igglopolt', source.convert('RGB'), edge_crop)
edge_after = make_card(
    'Dopo la pennellata interna',
    f"Contorno originale unico · {edge_metrics['generatedOutlinePixels']} px di bordo aggiunto",
    results['sameColorIgglopoltEdge'], edge_crop,
)
edge_sheet = Image.new('RGB', (1540, 610), '#e8edf2')
edge_sheet.paste(edge_before, (10, 10))
edge_sheet.paste(edge_after, (780, 10))
edge_sheet.save(HERE / 'igglopolt-edge-probe.png', optimize=True)
extension_metrics = summary['igglopoltEdgeExtension']
extension_before = make_card('Prima', 'Contorno nord originale di Casata Igglopolt', source.convert('RGB'), edge_crop)
extension_after = make_card(
    'Dopo la pennellata sul bordo',
    f"Contorno nuovo limitato al tratto dipinto · {extension_metrics['untouchedSouthBoundaryRedrawn']} px lontani ridisegnati",
    results['igglopoltEdgeExtension'], edge_crop,
)
extension_sheet = Image.new('RGB', (1540, 610), '#e8edf2')
extension_sheet.paste(extension_before, (10, 10))
extension_sheet.paste(extension_after, (780, 10))
extension_sheet.save(HERE / 'igglopolt-edge-extension.png', optimize=True)
results['igglopoltWideExtension'].save(HERE / 'igglopolt-wide-extension-full.png', optimize=True)
state_sheet = Image.new('RGB', (2340, 610), '#e8edf2')
state_crops = [make_card(title, body, image, (40, 340, 520, 620)) for (title, image), body in zip(editable_maps.items(), ('Riempimenti iniziali degli Stati', 'Il colore cambia anche sul territorio base', 'La regione resta neutra e modificabile'))]
for card, position in zip(state_crops, ((0, 10), (780, 10), (1560, 10))):
    state_sheet.paste(card, position)
state_sheet.save(HERE / 'state-editability-probes.png', optimize=True)
eraser_sheet = Image.new('RGB', (2340, 610), '#e8edf2')
eraser_views = [
    ('Preset iniziale', 'Il territorio rosa è modificabile', source.convert('RGB')),
    ('Gomma dentro Igglopolt', 'La zona cancellata diventa neutra', results['erasePreset']),
    ('Gomma sul confine', 'Il vecchio bordo viene sostituito', results['eraseAcrossBoundary']),
]
for position, (title, body, view) in zip(((0, 10), (780, 10), (1560, 10)), eraser_views):
    eraser_sheet.paste(make_card(title, body, view, (70, 335, 510, 590)), position)
eraser_sheet.save(HERE / 'eraser-probes.png', optimize=True)
review_sheet = Image.new('RGB', (2340, 1220), '#e8edf2')
review_cases = [
    ('Preset senza modifiche', 'Confine e fiumi iniziali', 'untouchedPreset', (70, 335, 510, 590)),
    ('Gomma su terra vuota', 'Il confine resta identico', 'eraseBlankNearState', (70, 335, 510, 590)),
    ('Bordo sfumato della gomma', 'Nessuna linea dentro il rosa intatto', 'eraseAntialias', (70, 335, 510, 590)),
    ('Confine condiviso', 'Vecchia linea rimossa nella zona vuota', 'eraseSharedBoundary', (300, 420, 650, 670)),
    ('Colore dopo la gomma', 'Il territorio torna un blocco unico', 'repaintErased', (70, 335, 510, 590)),
    ('Gomma su una pennellata', 'Bordo ricalcolato sul colore rimasto', 'erasePaintedExtension' if len(sys.argv) > 1 else 'eraseAcrossBoundary', (70, 335, 510, 590)),
]
for index, (title, body, case, crop) in enumerate(review_cases):
    review_sheet.paste(make_card(title, body, results[case], crop), ((index % 3) * 780, (index // 3) * 610 + 10))
review_sheet.save(HERE / 'eraser-review-probes.png', optimize=True)
print(f'Wrote {HERE / "border-probes.png"}')
print(f'Wrote {HERE / "merged-full.png"}')
print(f'Wrote {HERE / "igglopolt-edge-probe.png"}')
print(f'Wrote {HERE / "igglopolt-edge-extension.png"}')
print(f'Wrote {HERE / "igglopolt-wide-extension-full.png"}')
print(f'Wrote {HERE / "river-pixel-diagnostic.png"}')
print(f'Wrote {HERE / "state-editability-probes.png"}')
print(f'Wrote {HERE / "eraser-probes.png"}')
print(f'Wrote {HERE / "eraser-review-probes.png"}')
shutil.rmtree(WORK)
