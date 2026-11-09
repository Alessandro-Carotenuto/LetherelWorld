const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const verification = __dirname;
const work = path.join(verification, '.work');
const source = fs.readFileSync(path.join(root, 'mapmaker', 'mapmaker.js'), 'utf8');
const pngMeta = JSON.parse(fs.readFileSync(path.join(work, 'base-meta.json'), 'utf8'));
const rgba = new Uint8ClampedArray(fs.readFileSync(path.join(work, 'base.rgba')));
const presetMatch = source.match(/const presetStates = (\[[\s\S]*?\n  \]);/);
if (!presetMatch) throw new Error('Could not read presetStates from mapmaker.js');
const presetStates = new Function(`${presetMatch[0]}; return presetStates;`)();
const states = presetStates.map(([key, name, color], index) => ({ id: `base-${key}`, name, color, baseColor: color, code: index + 1 }));

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name} in mapmaker.js`);
  const open = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let index = open; index < source.length; index++) {
    const char = source[index], next = source[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index++; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index++; continue; }
    if (char === '/' && next === '*') { blockComment = true; index++; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not parse ${name} from mapmaker.js`);
}
const drawProductionStroke = new Function(`${extractFunction('randomAt')}; ${extractFunction('strokeSegments')}; ${extractFunction('drawRoughStroke')}; return drawRoughStroke;`)();
const drawProductionEraser = new Function(`${extractFunction('randomAt')}; ${extractFunction('strokeSegments')}; ${extractFunction('drawRoughStroke')}; ${extractFunction('drawEraseStroke')}; return drawEraseStroke;`)();

class MemoryCanvas {
  constructor() { this.width = 0; this.height = 0; this.pixels = null; this.context = new MemoryContext(this); }
  getContext() { return this.context; }
}
class MemoryContext {
  constructor(canvas) { this.canvas = canvas; this.globalCompositeOperation = 'source-over'; }
  createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; }
  getImageData() { return { data: new Uint8ClampedArray(this.canvas.pixels || this.canvas.width * this.canvas.height * 4) }; }
  putImageData(image) { this.canvas.pixels = new Uint8ClampedArray(image.data); }
  clearRect() { this.canvas.pixels = new Uint8ClampedArray(this.canvas.width * this.canvas.height * 4); }
  fillRect() { /* drawImage replaces the full aligned neutral image in this probe */ }
  drawImage(image) {
    const src = image.pixels || image.rgba;
    if (!src) return;
    if (this.globalCompositeOperation === 'destination-out') {
      if (!this.canvas.pixels) this.canvas.pixels = new Uint8ClampedArray(src.length);
      for (let index = 0; index < src.length; index += 4) this.canvas.pixels[index + 3] *= 1 - src[index + 3] / 255;
    } else this.canvas.pixels = new Uint8ClampedArray(src);
  }
}
class MemoryImageData { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } }

const env = {
  project: { map: 'preset-map', width: pngMeta.width, height: pngMeta.height, states }, presetStates,
  image: { complete: true, naturalWidth: pngMeta.width, rgba },
  neutralImage: { complete: true, naturalWidth: 2324, rgba: new Uint8ClampedArray(fs.readFileSync(path.join(work, 'neutral.rgba'))) },
  document: { createElement: () => new MemoryCanvas() },
  ImageData: MemoryImageData,
  say: () => {}, renderStrokes: () => {},
  paintCanvas: { width: pngMeta.width, height: pngMeta.height },
  paintPixels: new Uint8ClampedArray(rgba.length),
  paintHistoryPixels: new Uint8ClampedArray(rgba.length),
  erasePixels: new Uint8ClampedArray(rgba.length),
};
env.paintCtx = { getImageData: () => ({ data: env.paintPixels }) };
env.paintHistoryCtx = { getImageData: () => ({ data: env.paintHistoryPixels }) };
env.eraseCtx = { getImageData: () => ({ data: env.erasePixels }) };
const code = [
  'isSeaPixel', 'colorParts', 'buildBaseOwnerLookup', 'buildEditableBaseLayers', 'buildLandMask',
].map(extractFunction).join('\n');
const zoneFunction = extractFunction('buildZoneBorder');
const instrumentedZoneFunction = zoneFunction.slice(0, -1) + `
  env.debug = { finalOwner, changed, erased, activeZone, internalEdges, border, expanded, clearMask: maskPixels.data };
}`;
const runtime = new Function('env', `
  const { project, presetStates, image, neutralImage, document, ImageData, say, renderStrokes, paintCanvas, paintCtx, paintHistoryCtx, eraseCtx } = env;
  const BASE_MAP = 'preset-map';
  let landMask = null, landPixels = null, baseOwnerPixels = null, baseEdgePixels = null,
      baseEdgeLayer = null, preservedEdgeLayer = null,
      baseSourcePixels = null, neutralMapLayer = null, baseFillLayer = null,
      zoneMaskLayer = null, zoneBorderLayer = null;
  ${code}
  ${instrumentedZoneFunction}
  return {
    prepare: () => { buildLandMask(); return { landPixels, baseOwnerPixels, baseEdgePixels, neutralMapLayer, baseFillLayer, seaMask: landMask.getContext('2d').canvas.pixels }; },
    rebuildEditable: () => { buildEditableBaseLayers(); return { neutralMapLayer, baseFillLayer }; },
    baseOwnerLookup: () => buildBaseOwnerLookup(),
    render: () => { buildZoneBorder(); return { zoneMaskLayer, zoneBorderLayer, preservedEdgeLayer, debug: env.debug }; },
  };
`)(env);

const base = runtime.prepare();
function colorBytes(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
function paintStroke(points, radius, color, targetCode) {
  const rgb = colorBytes(color), data = new Uint8ClampedArray(rgba.length), { width, height } = pngMeta;
  const minX = Math.max(0, Math.floor(Math.min(...points.map(point => point[0])) - radius - 1));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...points.map(point => point[0])) + radius + 1));
  const minY = Math.max(0, Math.floor(Math.min(...points.map(point => point[1])) - radius - 1));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...points.map(point => point[1])) + radius + 1));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const index = y * width + x;
    if (!base.landPixels[index]) continue;
    let distance = Infinity;
    for (let segment = 0; segment < points.length - 1; segment++) {
      const [ax, ay] = points[segment], [bx, by] = points[segment + 1], dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      distance = Math.min(distance, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
    if (points.length === 1) distance = Math.hypot(x - points[0][0], y - points[0][1]);
    if (distance <= radius) { const offset = index * 4; data[offset] = rgb[0]; data[offset + 1] = rgb[1]; data[offset + 2] = rgb[2]; data[offset + 3] = 255; }
  }
  return data;
}
function paintProductionStroke(points, size, color, seed = 701, roughness = .35, tool = 'brush') {
  const { width, height } = pngMeta, rgb = colorBytes(color), data = new Uint8ClampedArray(rgba.length);
  const target = {
    fillStyle: color, paths: [], currentPath: null,
    beginPath() { this.paths = []; this.currentPath = null; },
    moveTo(x, y) { this.currentPath = [[x, y]]; this.paths.push(this.currentPath); },
    lineTo(x, y) { this.currentPath?.push([x, y]); },
    closePath() { this.currentPath = null; },
    fill() {
      for (const polygon of this.paths) {
        if (polygon.length < 3) continue;
        let minY = height, maxY = -1;
        for (const point of polygon) { minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]); }
        for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(height - 1, Math.ceil(maxY)); y++) {
          const scanY = y + .5, intersections = [];
          for (let index = 0; index < polygon.length; index++) {
            const [x1, y1] = polygon[index], [x2, y2] = polygon[(index + 1) % polygon.length];
            if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) intersections.push(x1 + (scanY - y1) * (x2 - x1) / (y2 - y1));
          }
          intersections.sort((a, b) => a - b);
          for (let pair = 0; pair + 1 < intersections.length; pair += 2) {
            const left = Math.max(0, Math.ceil(intersections[pair] - .5)), right = Math.min(width - 1, Math.floor(intersections[pair + 1] - .5));
            for (let x = left; x <= right; x++) { const offset = (y * width + x) * 4; data[offset] = rgb[0]; data[offset + 1] = rgb[1]; data[offset + 2] = rgb[2]; data[offset + 3] = 255; }
          }
        }
      }
    },
  };
  const stroke = { tool, size, color, roughness, seed, segments: [points.map(([x, y]) => ({ x, y }))] };
  if (tool === 'erase') drawProductionEraser(stroke, target); else drawProductionStroke(stroke, target);
  for (let index = 0; index < base.landPixels.length; index++) if (!base.landPixels[index]) data[index * 4 + 3] = 0;
  return data;
}
function paintInsideIgglopoltNorthEdge(color, targetCode) {
  const { width, height } = pngMeta, layer = new Uint8ClampedArray(rgba.length), rgb = colorBytes(color), axes = [[1, 0], [0, 1], [1, 1], [1, -1]];
  let edgeSamples = 0, paintedPixels = 0;
  for (let y = 365; y <= 430; y++) for (let x = 80; x <= 480; x++) {
    const index = y * width + x;
    if (!base.baseEdgePixels[index]) continue;
    let normal = axes[0], lowestRun = Infinity;
    for (const axis of axes) {
      let run = 0;
      for (let distance = -3; distance <= 3; distance++) {
        const nx = x + axis[0] * distance, ny = y + axis[1] * distance;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && base.baseEdgePixels[ny * width + nx]) run++;
      }
      if (run < lowestRun) { lowestRun = run; normal = axis; }
    }
    const sides = [0, 0];
    for (let side = 0; side < 2; side++) {
      const direction = side === 0 ? -1 : 1;
      for (let distance = 2; distance <= 8; distance++) {
        const nx = x + normal[0] * direction * distance, ny = y + normal[1] * direction * distance;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && base.baseOwnerPixels[ny * width + nx]) { sides[side] = base.baseOwnerPixels[ny * width + nx]; break; }
      }
    }
    if ((sides[0] === targetCode) === (sides[1] === targetCode)) continue;
    edgeSamples++;
    const direction = sides[0] === targetCode ? -1 : 1;
    for (let distance = 2; distance <= 15; distance++) {
      const nx = x + normal[0] * direction * distance, ny = y + normal[1] * direction * distance;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const paintIndex = ny * width + nx;
      if (base.baseOwnerPixels[paintIndex] !== targetCode) continue;
      const offset = paintIndex * 4; layer[offset] = rgb[0]; layer[offset + 1] = rgb[1]; layer[offset + 2] = rgb[2]; layer[offset + 3] = 255; paintedPixels++;
    }
  }
  return { layer, edgeSamples, paintedPixels };
}
function saveLayer(name, pixels) { fs.writeFileSync(path.join(work, `${name}.rgba`), Buffer.from(pixels)); }
function countOutlineComponents(debug) {
  const seen = new Uint8Array(debug.border.length), queue = new Int32Array(debug.border.length), { width, height } = pngMeta;
  const components = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || (!debug.border[start] && !debug.expanded[start])) continue;
    let head = 0, tail = 0, minX = width, minY = height, maxX = 0, maxY = 0; queue[tail++] = start; seen[start] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = (index / width) | 0;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (!seen[neighbor] && (debug.border[neighbor] || debug.expanded[neighbor])) { seen[neighbor] = 1; queue[tail++] = neighbor; }
      }
    }
    components.push({ size: tail, bounds: [minX, minY, maxX, maxY] });
  }
  components.sort((a, b) => b.size - a.size);
  return { count: components.length, largest: components.slice(0, 20) };
}
function ownerBounds(code) {
  let minX = pngMeta.width, minY = pngMeta.height, maxX = -1, maxY = -1, count = 0;
  for (let index = 0; index < base.baseOwnerPixels.length; index++) if (base.baseOwnerPixels[index] === code) {
    const x = index % pngMeta.width, y = (index / pngMeta.width) | 0;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count++;
  }
  return { minX, minY, maxX, maxY, count };
}
function neighboringBoundary(codeA, codeB) {
  const { width, height } = pngMeta, pairs = [];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const index = y * width + x;
    if (base.baseOwnerPixels[index] !== codeA) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      if (base.baseOwnerPixels[(y + dy) * width + x + dx] === codeB) pairs.push([x, y]);
    }
  }
  if (!pairs.length) throw new Error('No adjacent boundary found for test states');
  pairs.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return pairs[Math.floor(pairs.length / 2)];
}

const summary = {
  width: pngMeta.width, height: pngMeta.height,
  bounds: { igglopolt: ownerBounds(1), likari: ownerBounds(2), whiteflower: ownerBounds(12) },
  sharedBoundary: neighboringBoundary(1, 2),
  riverLandPixels: 0,
  sourceEdgePixels: base.baseEdgePixels.reduce((sum, value) => sum + value, 0),
};
const roughnessLayers = new Map();
const eraserRoughnessLayers = new Map();
for (const roughness of [0, .35, 1]) {
  const key = String(Math.round(roughness * 100)).padStart(3, '0');
  const layer = paintProductionStroke([[175, 460], [385, 460]], 42, '#387ca8', 701, roughness);
  roughnessLayers.set(roughness, layer);
  saveLayer(`brush-roughness-${key}`, layer);
  const eraserLayer = paintProductionStroke([[175, 460], [385, 460]], 42, '#000000', 701, roughness, 'erase');
  eraserRoughnessLayers.set(roughness, eraserLayer);
  saveLayer(`eraser-roughness-${key}`, eraserLayer);
}
const roughnessPixelDifference = (left, right) => {
  let count = 0;
  for (let index = 3; index < left.length; index += 4) if (left[index] !== right[index]) count++;
  return count;
};
summary.brushRoughness = {
  changedPixels35vs0: roughnessPixelDifference(roughnessLayers.get(.35), roughnessLayers.get(0)),
  changedPixels100vs35: roughnessPixelDifference(roughnessLayers.get(1), roughnessLayers.get(.35)),
};
summary.eraserRoughness = {
  changedPixels35vs0: roughnessPixelDifference(eraserRoughnessLayers.get(.35), eraserRoughnessLayers.get(0)),
  changedPixels100vs35: roughnessPixelDifference(eraserRoughnessLayers.get(1), eraserRoughnessLayers.get(.35)),
};
const firstState = states[0], firstStateColor = firstState.color;
let stateSample = base.baseOwnerPixels[490 * pngMeta.width + 230] === firstState.code ? 490 * pngMeta.width + 230 : -1;
for (let index = 0; index < base.baseOwnerPixels.length; index++) {
  if (stateSample >= 0) break;
  const offset = index * 4;
  const water = Math.abs(rgba[offset] - 180) + Math.abs(rgba[offset + 1] - 210) + Math.abs(rgba[offset + 2] - 243) < 39;
  if (base.baseOwnerPixels[index] === firstState.code && !base.baseEdgePixels[index] && !water) { stateSample = index; break; }
}
if (stateSample < 0) throw new Error('Could not find an interior pixel for the first preset state');
const sampleRgb = layer => Array.from(layer.subarray(stateSample * 4, stateSample * 4 + 4));
saveLayer('neutral-map', base.neutralMapLayer.pixels);
saveLayer('base-state-fill', base.baseFillLayer.pixels);
const initialFill = sampleRgb(base.baseFillLayer.pixels);
firstState.color = '#ff00ff';
const editedLayers = runtime.rebuildEditable();
const editedFill = sampleRgb(editedLayers.baseFillLayer.pixels);
saveLayer('edited-state-fill', editedLayers.baseFillLayer.pixels);
states.splice(states.indexOf(firstState), 1);
const deletedLayers = runtime.rebuildEditable();
const deletedFill = sampleRgb(deletedLayers.baseFillLayer.pixels);
const deletedNeutral = sampleRgb(deletedLayers.neutralMapLayer.pixels);
saveLayer('deleted-state-fill', deletedLayers.baseFillLayer.pixels);
saveLayer('deleted-state-neutral', deletedLayers.neutralMapLayer.pixels);
states.splice(0, 0, firstState);
firstState.color = firstStateColor;
runtime.rebuildEditable();
summary.stateEditability = {
  initialColor: firstStateColor,
  initialFill: initialFill.slice(0, 3),
  editedColor: '#ff00ff',
  editedFill: editedFill.slice(0, 3),
  deletedFillAlpha: deletedFill[3],
  deletedRegionColor: deletedNeutral.slice(0, 3),
  ownershipRetainedAfterDelete: base.baseOwnerPixels[stateSample] === firstState.code
    && runtime.baseOwnerLookup().get((parseInt(firstState.baseColor.slice(1, 3), 16) << 16) | (parseInt(firstState.baseColor.slice(3, 5), 16) << 8) | parseInt(firstState.baseColor.slice(5, 7), 16)) === firstState.code,
};
if (initialFill[3] !== 255 || initialFill.slice(0, 3).map((v, i) => v === colorBytes(firstStateColor)[i]).some(v => !v)) throw new Error('Preset state fill does not use its editable state color');
if (editedFill[3] !== 255 || editedFill[0] !== 255 || editedFill[1] !== 0 || editedFill[2] !== 255) throw new Error('Editing a preset state color did not recolor its base territory');
if (deletedFill[3] !== 0 || deletedNeutral.slice(0, 3).join(',') !== '238,246,251' || !summary.stateEditability.ownershipRetainedAfterDelete) throw new Error('Deleting a preset state did not remove its fill while preserving map ownership geometry');
const riverCandidates = new Uint8Array(base.landPixels.length), riverImage = new Uint8ClampedArray(rgba.length);
for (let index = 0; index < base.landPixels.length; index++) {
  const o = index * 4;
  const isWaterColor = Math.abs(rgba[o] - 180) + Math.abs(rgba[o + 1] - 210) + Math.abs(rgba[o + 2] - 243) < 39;
  if (isWaterColor && base.landPixels[index]) {
    summary.riverLandPixels++; riverCandidates[index] = 1;
    riverImage[o] = 239; riverImage[o + 1] = 45; riverImage[o + 2] = 136; riverImage[o + 3] = 255;
  }
}
const seenRiver = new Uint8Array(riverCandidates.length), riverQueue = new Int32Array(riverCandidates.length), rivers = [];
for (let start = 0; start < riverCandidates.length; start++) {
  if (!riverCandidates[start] || seenRiver[start]) continue;
  let head = 0, tail = 0, minX = pngMeta.width, minY = pngMeta.height, maxX = 0, maxY = 0, sumX = 0, sumY = 0;
  riverQueue[tail++] = start; seenRiver[start] = 1;
  while (head < tail) {
    const index = riverQueue[head++], x = index % pngMeta.width, y = (index / pngMeta.width) | 0;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); sumX += x; sumY += y;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= pngMeta.width || ny >= pngMeta.height) continue;
      const neighbor = ny * pngMeta.width + nx;
      if (riverCandidates[neighbor] && !seenRiver[neighbor]) { seenRiver[neighbor] = 1; riverQueue[tail++] = neighbor; }
    }
  }
  if (tail >= 12) rivers.push({ size: tail, minX, minY, maxX, maxY, center: [Math.round(sumX / tail), Math.round(sumY / tail)] });
}
rivers.sort((a, b) => b.size - a.size);
summary.largestRiverCandidates = rivers.slice(0, 20);
fs.writeFileSync(path.join(verification, 'probe-summary.json'), JSON.stringify(summary, null, 2));
saveLayer('river-candidates', riverImage);
saveLayer('base-edges', (() => { const p = new Uint8ClampedArray(rgba.length); for (let i = 0; i < base.baseEdgePixels.length; i++) if (base.baseEdgePixels[i]) { const o = i * 4; p[o] = rgba[o]; p[o + 1] = rgba[o + 1]; p[o + 2] = rgba[o + 2]; p[o + 3] = 255; } return p; })());

const target = states[0], [bx, by] = summary.sharedBoundary;
const cases = {
  untouchedPreset: [],
  separated: [
    [[bx + 75, by - 25], [bx + 75, by + 25]],
    [[bx + 145, by - 15], [bx + 145, by + 35]],
  ],
  merged: [
    [[bx - 80, by], [bx - 30, by], [bx + 25, by], [bx + 75, by - 25], [bx + 75, by + 25], [bx + 145, by - 15], [bx + 145, by + 35]],
  ],
  igglopoltEdgeExtension: [
    [[110, 393], [150, 416], [200, 447], [260, 450], [320, 440], [390, 438], [440, 436]],
  ],
  igglopoltWideExtension: [
    [[130, 430], [200, 430], [280, 430], [360, 430], [430, 430]],
  ],
  river: [
    [[330, 445], [380, 445], [430, 458], [475, 475], [520, 480]],
  ],
  sameColorIgglopoltEdge: [],
  sameColorRiver: [
    [[165, 460], [220, 460], [280, 460], [335, 460]],
  ],
  erasePreset: [],
  eraseAntialias: [],
  eraseBlankNearState: [],
  eraseAcrossBoundary: [],
  eraseSharedBoundary: [],
  repaintErased: [],
};
const replayPath = process.argv[2];
let replayStrokes = [];
if (replayPath) {
  const replayProject = JSON.parse(fs.readFileSync(replayPath, 'utf8'));
  if (replayProject.width !== pngMeta.width || replayProject.height !== pngMeta.height) throw new Error('The exported project uses different map dimensions');
  replayStrokes = replayProject.strokes.flatMap(stroke => stroke.segments.map((segment, segmentIndex) => ({
    points: segment.map(point => [point.x, point.y]), size: stroke.size, color: stroke.color,
    seed: stroke.seed + segmentIndex * 1009, roughness: stroke.roughness,
  })));
  if (replayStrokes.some(stroke => stroke.roughness !== .35)) throw new Error('The replay rasterizer currently expects 35% roughness');
  cases.projectReplay = replayStrokes.map(stroke => stroke.points);
  cases.projectReplayFringe = replayStrokes.map(stroke => stroke.points);
  cases.erasePaintedExtension = replayStrokes.map(stroke => stroke.points);
}
for (const [name, strokes] of Object.entries(cases)) {
  let layer;
  if (name === 'sameColorIgglopoltEdge') {
    const painted = paintInsideIgglopoltNorthEdge(target.color, target.code);
    layer = painted.layer;
    summary.igglopoltEdgeStroke = { sameColorPaintedPixels: painted.paintedPixels, adjacentOriginalEdgeSamples: painted.edgeSamples };
  } else {
    layer = new Uint8ClampedArray(rgba.length);
    for (let strokeIndex = 0; strokeIndex < strokes.length; strokeIndex++) {
      const points = strokes[strokeIndex];
      const projectCase = name === 'projectReplay' || name === 'projectReplayFringe' || name === 'erasePaintedExtension';
      const size = projectCase ? replayStrokes[strokeIndex].size : name === 'sameColorRiver' ? 24 : name === 'river' ? 48 : name === 'igglopoltEdgeExtension' ? 36 : name === 'igglopoltWideExtension' ? 80 : 52;
      const color = projectCase ? replayStrokes[strokeIndex].color : target.color;
      const seed = projectCase ? replayStrokes[strokeIndex].seed : 701;
      const stroke = paintProductionStroke(points, size, color, seed);
      for (let i = 0; i < layer.length; i += 4) if (stroke[i + 3]) layer.set(stroke.subarray(i, i + 4), i);
    }
  }
  if (name === 'projectReplayFringe') {
    const originalAlpha = new Uint8Array(base.landPixels.length);
    for (let index = 0; index < originalAlpha.length; index++) originalAlpha[index] = layer[index * 4 + 3];
    for (let y = 1; y < pngMeta.height - 1; y++) for (let x = 1; x < pngMeta.width - 1; x++) {
      const index = y * pngMeta.width + x, offset = index * 4;
      if (!originalAlpha[index]) continue;
      let touchesClear = false;
      for (let dy = -1; dy <= 1 && !touchesClear; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!originalAlpha[(y + dy) * pngMeta.width + x + dx]) { touchesClear = true; break; }
      }
      if (touchesClear) { layer[offset] = Math.min(255, layer[offset] + 1); layer[offset + 3] = 160; }
    }
  }
  if (name === 'repaintErased') layer = paintStroke([[240, 490]], 30, target.color, target.code);
  const eraseLayer = new Uint8ClampedArray(rgba.length);
  if (['erasePreset', 'eraseAntialias', 'eraseBlankNearState', 'eraseAcrossBoundary', 'eraseSharedBoundary', 'repaintErased', 'erasePaintedExtension'].includes(name)) {
    const [centerX, centerY, radius] = name === 'erasePreset' ? [250, 465, 35]
      : name === 'eraseAntialias' ? [250, 465, 35]
      : name === 'eraseBlankNearState' ? [240, 412, 26]
      : name === 'eraseAcrossBoundary' ? [250, 415, 28]
      : name === 'eraseSharedBoundary' ? [bx, by, 30]
      : name === 'repaintErased' ? [240, 490, 24] : [240, 390, 28];
    for (let y = centerY - radius; y <= centerY + radius; y++) for (let x = centerX - radius; x <= centerX + radius; x++) {
      const index = y * pngMeta.width + x;
      const distance = Math.hypot(x + .5 - centerX, y + .5 - centerY);
      if (base.landPixels[index] && (name !== 'eraseBlankNearState' || !base.baseOwnerPixels[index]) && distance <= radius + .5) eraseLayer[index * 4 + 3] = name === 'eraseAntialias'
        ? Math.round(Math.max(0, Math.min(1, radius + .5 - distance)) * 255) : distance <= radius ? 255 : 0;
    }
  }
  const historyLayer = new Uint8ClampedArray(layer);
  if (name === 'erasePaintedExtension') for (let index = 0; index < base.landPixels.length; index++) {
    if (eraseLayer[index * 4 + 3]) layer[index * 4 + 3] = 0;
  }
  env.paintPixels = layer;
  env.paintHistoryPixels = historyLayer;
  env.erasePixels = eraseLayer;
  const output = runtime.render();
  if (eraseLayer.some((value, index) => index % 4 === 3 && value > 0)) {
    let clearedPresetPixels = 0, repaintedPresetPixels = 0, generatedOutlinePixels = 0, generatedOutlineOnNearlyOpaqueState = 0, originalEdgesStillVisible = 0;
    for (let index = 0; index < base.baseOwnerPixels.length; index++) {
      if (!eraseLayer[index * 4 + 3]) continue;
      if (base.baseOwnerPixels[index] === target.code && output.debug.finalOwner[index] === 0) clearedPresetPixels++;
      if (base.baseOwnerPixels[index] === target.code && output.debug.finalOwner[index] === target.code && layer[index * 4 + 3]) repaintedPresetPixels++;
      if (output.debug.border[index] || output.debug.expanded[index]) generatedOutlinePixels++;
      if ((output.debug.border[index] || output.debug.expanded[index]) && eraseLayer[index * 4 + 3] < 64 && base.baseOwnerPixels[index] === target.code) generatedOutlineOnNearlyOpaqueState++;
      if (output.debug.erased[index] && base.baseEdgePixels[index] && output.preservedEdgeLayer.pixels?.[index * 4 + 3]) originalEdgesStillVisible++;
    }
    summary[name] = { clearedPresetPixels, repaintedPresetPixels, generatedOutlinePixels, generatedOutlineOnNearlyOpaqueState, originalEdgesStillVisible };
  }
  summary[`${name}OutlineComponents`] = countOutlineComponents(output.debug);
  if (name === 'river') {
    let riverPixelsInsidePaintedZone = 0, generatedOutlinePixelsOnRivers = 0;
    for (let index = 0; index < riverCandidates.length; index++) {
      if (!riverCandidates[index] || output.debug.activeZone[index] !== target.code) continue;
      riverPixelsInsidePaintedZone++;
      if (output.debug.border[index] || output.debug.expanded[index]) generatedOutlinePixelsOnRivers++;
    }
    summary.riverGeometry = { riverPixelsInsidePaintedZone, generatedOutlinePixelsOnRivers };
  }
  if (name === 'merged') {
    let active = 0, changed = 0, internal = 0, retainedInternal = 0, generated = 0, sourceEdgesInside = 0, sourceEdgesStillVisibleInside = 0, northBoundaryRedrawn = 0;
    const leftoverImage = new Uint8ClampedArray(rgba.length);
    for (let index = 0; index < base.baseOwnerPixels.length; index++) {
      const x = index % pngMeta.width, y = (index / pngMeta.width) | 0;
      if (output.debug.activeZone[index] === target.code) active++;
      if (output.debug.changed[index]) changed++;
      if (x >= 80 && x <= 480 && y < 440 && base.baseEdgePixels[index] && (output.debug.border[index] || output.debug.expanded[index])) northBoundaryRedrawn++;
      if (base.baseEdgePixels[index] && output.debug.activeZone[index] === target.code) {
        sourceEdgesInside++;
        if (!output.debug.clearMask[index * 4 + 3]) {
          sourceEdgesStillVisibleInside++;
          const offset = index * 4; leftoverImage[offset] = 40; leftoverImage[offset + 1] = 255; leftoverImage[offset + 2] = 40; leftoverImage[offset + 3] = 255;
        }
      }
      if (output.debug.internalEdges[index]) {
        internal++;
        if (!output.debug.clearMask[index * 4 + 3]) retainedInternal++;
      }
      if (output.debug.border[index] || output.debug.expanded[index]) generated++;
    }
    summary.mergedGeometry = { activePixels: active, changedPixels: changed, detectedInternalEdges: internal, internalEdgesNotCleared: retainedInternal, sourceEdgesInsideActiveZone: sourceEdgesInside, sourceEdgesStillVisibleInside, generatedOutlinePixels: generated, untouchedNorthBoundaryRedrawn: northBoundaryRedrawn };
    const activeImage = new Uint8ClampedArray(rgba.length), internalImage = new Uint8ClampedArray(rgba.length);
    for (let index = 0; index < base.baseOwnerPixels.length; index++) {
      const offset = index * 4;
      if (output.debug.activeZone[index] === target.code) { activeImage[offset] = 240; activeImage[offset + 1] = 55; activeImage[offset + 2] = 80; activeImage[offset + 3] = 150; }
      if (output.debug.internalEdges[index]) { internalImage[offset] = 20; internalImage[offset + 1] = 255; internalImage[offset + 2] = 80; internalImage[offset + 3] = 255; }
    }
    saveLayer('merged-active-zone', activeImage); saveLayer('merged-internal-edges', internalImage); saveLayer('merged-leftover-edges', leftoverImage);
  }
  if (name === 'igglopoltEdgeExtension') {
    let active = 0, changed = 0, generated = 0, northEdgesCleared = 0, untouchedSouthBoundaryRedrawn = 0;
    for (let index = 0; index < base.baseOwnerPixels.length; index++) {
      const x = index % pngMeta.width, y = (index / pngMeta.width) | 0;
      if (output.debug.activeZone[index] === target.code) active++;
      if (output.debug.changed[index]) changed++;
      if (output.debug.border[index] || output.debug.expanded[index]) generated++;
      if (base.baseEdgePixels[index] && output.debug.clearMask[index * 4 + 3] && y < 470) northEdgesCleared++;
      if (x >= 70 && x <= 480 && y >= 520 && base.baseEdgePixels[index] && (output.debug.border[index] || output.debug.expanded[index])) untouchedSouthBoundaryRedrawn++;
    }
    summary.igglopoltEdgeExtension = { activePaintPixels: active, changedPixels: changed, generatedOutlinePixels: generated, paintedNorthEdgesCleared: northEdgesCleared, untouchedSouthBoundaryRedrawn };
  }
  if (name === 'igglopoltWideExtension') {
    let oldBorderInsidePaint = 0, oldBorderNotCleared = 0, newBorderInsidePaint = 0;
    for (let y = 400; y <= 445; y++) for (let x = 145; x <= 420; x++) {
      const index = y * pngMeta.width + x;
      if (!base.baseEdgePixels[index] || !layer[(index - 10 * pngMeta.width) * 4 + 3] || !layer[(index + 10 * pngMeta.width) * 4 + 3]) continue;
      oldBorderInsidePaint++;
      if (!output.debug.clearMask[index * 4 + 3]) oldBorderNotCleared++;
      if (output.debug.border[index] || output.debug.expanded[index]) newBorderInsidePaint++;
    }
    summary.igglopoltWideExtension = { oldBorderInsidePaint, oldBorderNotCleared, newBorderInsidePaint };
  }
  if (name === 'projectReplay' || name === 'projectReplayFringe') {
    let oldBorderInsidePaint = 0, oldBorderNotCleared = 0, generatedBorderInsidePaint = 0, unknownOwnerPixels = 0;
    for (let y = 365; y <= 450; y++) for (let x = 130; x <= 355; x++) {
      const index = y * pngMeta.width + x;
      if (output.debug.finalOwner[index] === 255) unknownOwnerPixels++;
      if (!base.baseEdgePixels[index] || !layer[(index - 8 * pngMeta.width) * 4 + 3] || !layer[(index + 8 * pngMeta.width) * 4 + 3]) continue;
      oldBorderInsidePaint++;
      if (!output.debug.clearMask[index * 4 + 3]) oldBorderNotCleared++;
      if (output.debug.border[index] || output.debug.expanded[index]) generatedBorderInsidePaint++;
    }
    summary[name] = { strokes: replayStrokes.length, oldBorderInsidePaint, oldBorderNotCleared, generatedBorderInsidePaint, unknownOwnerPixels };
  }
  saveLayer(`${name}-paint`, layer);
  saveLayer(`${name}-erase`, eraseLayer);
  saveLayer(`${name}-border`, output.zoneBorderLayer.pixels || new Uint8ClampedArray(rgba.length));
  saveLayer(`${name}-mask`, output.zoneMaskLayer.pixels || new Uint8ClampedArray(rgba.length));
  saveLayer(`${name}-preserved-edges`, output.preservedEdgeLayer.pixels || new Uint8ClampedArray(rgba.length));
  if (name === 'sameColorRiver') {
    const paintedPixels = layer.reduce((sum, value, index) => index % 4 === 3 ? sum + (value > 0 ? 1 : 0) : sum, 0);
    let generated = 0, changed = 0, clearedEdges = 0, paintedDifferentOwner = 0, changedByEdgeHeuristic = 0;
    const otherOwners = {}, changedImage = new Uint8ClampedArray(rgba.length), changedSamples = [];
    for (let index = 0; index < base.baseOwnerPixels.length; index++) {
      if (output.debug.border[index] || output.debug.expanded[index]) generated++;
      if (layer[index * 4 + 3] && base.baseOwnerPixels[index] !== target.code) {
        paintedDifferentOwner++;
        const code = base.baseOwnerPixels[index]; otherOwners[code] = (otherOwners[code] || 0) + 1;
      }
      if (output.debug.changed[index]) {
        changed++;
        if (changedSamples.length < 20) {
          const x = index % pngMeta.width, y = (index / pngMeta.width) | 0, localOwners = {};
          for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= pngMeta.width || ny >= pngMeta.height) continue;
            const owner = base.baseOwnerPixels[ny * pngMeta.width + nx]; localOwners[owner] = (localOwners[owner] || 0) + 1;
          }
          changedSamples.push({
            point: [x, y], baseOwner: base.baseOwnerPixels[index], localOwners,
            sourceColor: Array.from(rgba.subarray(index * 4, index * 4 + 3)), edge: Boolean(base.baseEdgePixels[index]),
          });
        }
        if (base.baseOwnerPixels[index] === target.code && base.baseEdgePixels[index]) {
          changedByEdgeHeuristic++;
          const offset = index * 4; changedImage[offset] = 45; changedImage[offset + 1] = 250; changedImage[offset + 2] = 30; changedImage[offset + 3] = 255;
        }
      }
      if (base.baseEdgePixels[index] && output.debug.clearMask[index * 4 + 3]) clearedEdges++;
    }
    summary.sameColorCase = { paintedPixels, paintedDifferentOwner, otherOwners, changedPixels: changed, changedByEdgeHeuristic, changedSamples, generatedOutlinePixels: generated, clearedOriginalEdges: clearedEdges };
    saveLayer('same-color-changed', changedImage);
  }
  if (name === 'sameColorIgglopoltEdge') {
    let changed = 0, generated = 0, originalEdgesCleared = 0;
    for (let index = 0; index < base.baseOwnerPixels.length; index++) {
      if (output.debug.changed[index]) changed++;
      if (output.debug.border[index] || output.debug.expanded[index]) generated++;
      if (base.baseEdgePixels[index] && output.debug.clearMask[index * 4 + 3]) originalEdgesCleared++;
    }
    summary.igglopoltEdgeStroke = { ...summary.igglopoltEdgeStroke, changedPixels: changed, generatedOutlinePixels: generated, clearedOriginalEdgePixels: originalEdgesCleared };
  }
}
states.splice(states.indexOf(firstState), 1);
runtime.rebuildEditable();
env.paintPixels = new Uint8ClampedArray(rgba.length);
env.paintHistoryPixels = new Uint8ClampedArray(rgba.length);
env.erasePixels = new Uint8ClampedArray(rgba.length);
const deletedOutput = runtime.render();
let deletedNorthEdgesStillVisible = 0;
for (let y = 350; y <= 450; y++) for (let x = 80; x <= 340; x++) {
  const index = y * pngMeta.width + x;
  if (base.baseEdgePixels[index] && deletedOutput.preservedEdgeLayer.pixels?.[index * 4 + 3]) deletedNorthEdgesStillVisible++;
}
summary.deletedStateBorders = { deletedNorthEdgesStillVisible };
states.splice(0, 0, firstState);
runtime.rebuildEditable();
fs.writeFileSync(path.join(verification, 'probe-summary.json'), JSON.stringify(summary, null, 2));
if (summary.separatedOutlineComponents.count !== 2) throw new Error('Separate strokes should produce two independent outlined areas');
if (summary.mergedOutlineComponents.largest[0].size < 900) throw new Error('The joined strokes did not form one continuous outlined block');
if (summary.mergedGeometry.activePixels >= 30000 || summary.mergedGeometry.untouchedNorthBoundaryRedrawn !== 0) throw new Error('Extending a territory redrew its untouched outer perimeter');
if (summary.igglopoltEdgeExtension.changedPixels < 100 || summary.igglopoltEdgeExtension.generatedOutlinePixels < 50 || summary.igglopoltEdgeExtension.untouchedSouthBoundaryRedrawn !== 0) throw new Error('The Igglopolt border extension did not stay on the painted section');
if (summary.mergedGeometry.sourceEdgesStillVisibleInside !== 0) throw new Error('Original edge pixels remain inside the merged territory');
if (summary.riverGeometry.generatedOutlinePixelsOnRivers !== 0) throw new Error('A generated border follows a river inside the painted zone');
if (summary.sameColorCase.changedPixels !== 0 || summary.sameColorCase.generatedOutlinePixels !== 0) throw new Error('Same-color river stroke created an ownership change or outline');
if (summary.igglopoltEdgeStroke.sameColorPaintedPixels < 1000 || summary.igglopoltEdgeStroke.adjacentOriginalEdgeSamples < 100 || summary.igglopoltEdgeStroke.changedPixels !== 0 || summary.igglopoltEdgeStroke.generatedOutlinePixels !== 0 || summary.igglopoltEdgeStroke.clearedOriginalEdgePixels !== 0) throw new Error('Same-color paint along Igglopolt’s original edge changed, cleared, or redrew its border');
if (summary.erasePreset.clearedPresetPixels < 1000 || summary.erasePreset.generatedOutlinePixels < 50 || summary.erasePreset.originalEdgesStillVisible !== 0 || summary.eraseAcrossBoundary.clearedPresetPixels < 100 || summary.eraseAcrossBoundary.originalEdgesStillVisible !== 0) throw new Error('The eraser failed to remove preset territory or its original border');
if (summary.eraseAntialias.generatedOutlineOnNearlyOpaqueState !== 0) throw new Error('Antialiased eraser generated a border inside mostly intact state paint');
if (summary.eraseBlankNearState.clearedPresetPixels !== 0 || summary.eraseBlankNearState.generatedOutlinePixels !== 0) throw new Error('Erasing unpainted land redrew a state border');
if (summary.repaintErased.clearedPresetPixels !== 0 || summary.repaintErased.repaintedPresetPixels < 1000 || summary.repaintErased.generatedOutlinePixels !== 0) throw new Error('Repainting an erased preset region created an internal border');
if (summary.eraseSharedBoundary.originalEdgesStillVisible !== 0 || summary.eraseSharedBoundary.generatedOutlinePixels < 100) throw new Error('Erasing a shared boundary left the old line or no replacement outline');
if (summary.deletedStateBorders.deletedNorthEdgesStillVisible !== 0) throw new Error('Deleting a preset state left its detached outer border visible');
if (summary.brushRoughness.changedPixels35vs0 < 100 || summary.brushRoughness.changedPixels100vs35 < 100) throw new Error('Brush roughness did not change the production stroke shape across slider values');
if (summary.eraserRoughness.changedPixels35vs0 < 100 || summary.eraserRoughness.changedPixels100vs35 < 100) throw new Error('Eraser roughness did not change the production erase shape across slider values');
if (replayPath && (summary.projectReplayFringe.unknownOwnerPixels !== 0 || summary.projectReplayFringeOutlineComponents.count !== summary.projectReplayOutlineComponents.count || summary.projectReplayFringe.oldBorderNotCleared !== 0)) throw new Error('Antialiased brush edge generated an internal border or preserved the old border');
console.log(JSON.stringify(summary, null, 2));
