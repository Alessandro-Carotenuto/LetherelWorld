const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const verification = __dirname;
const source = fs.readFileSync(path.join(root, 'mapmaker', 'mapmaker.js'), 'utf8');
const pngMeta = JSON.parse(fs.readFileSync(path.join(verification, 'base-meta.json'), 'utf8'));
const rgba = new Uint8ClampedArray(fs.readFileSync(path.join(verification, 'base.rgba')));
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
  project: { width: pngMeta.width, height: pngMeta.height, states },
  image: { complete: true, naturalWidth: pngMeta.width, rgba },
  document: { createElement: () => new MemoryCanvas() },
  ImageData: MemoryImageData,
  say: () => {}, renderStrokes: () => {},
  paintCanvas: { width: pngMeta.width, height: pngMeta.height },
  paintPixels: new Uint8ClampedArray(rgba.length),
};
env.paintCtx = { getImageData: () => ({ data: env.paintPixels }) };
const code = [
  'isSeaPixel', 'colorParts', 'buildBaseOwnerLookup', 'buildLandMask',
].map(extractFunction).join('\n');
const zoneFunction = extractFunction('buildZoneBorder');
const instrumentedZoneFunction = zoneFunction.slice(0, -1) + `
  env.debug = { finalOwner, changed, activeZone, internalEdges, border, expanded, clearMask: maskPixels.data };
}`;
const runtime = new Function('env', `
  const { project, image, document, ImageData, say, renderStrokes, paintCanvas, paintCtx } = env;
  let landMask = null, landPixels = null, baseOwnerPixels = null, baseEdgePixels = null,
      baseEdgeLayer = null, preservedEdgeLayer = null, cleanMapPixels = null, cleanMapLayer = null,
      zoneMaskLayer = null, zoneBorderLayer = null;
  ${code}
  ${instrumentedZoneFunction}
  return {
    prepare: () => { buildLandMask(); return { landPixels, baseOwnerPixels, baseEdgePixels, cleanMapPixels, seaMask: landMask.getContext('2d').canvas.pixels }; },
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
function saveLayer(name, pixels) { fs.writeFileSync(path.join(verification, `${name}.rgba`), Buffer.from(pixels)); }
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
saveLayer('clean-map', base.cleanMapPixels);
saveLayer('river-candidates', riverImage);
saveLayer('base-edges', (() => { const p = new Uint8ClampedArray(rgba.length); for (let i = 0; i < base.baseEdgePixels.length; i++) if (base.baseEdgePixels[i]) { const o = i * 4; p[o] = rgba[o]; p[o + 1] = rgba[o + 1]; p[o + 2] = rgba[o + 2]; p[o + 3] = 255; } return p; })());

const target = states[0], [bx, by] = summary.sharedBoundary;
const cases = {
  separated: [
    [[bx + 75, by - 25], [bx + 75, by + 25]],
    [[bx + 145, by - 15], [bx + 145, by + 35]],
  ],
  merged: [
    [[bx - 80, by], [bx - 30, by], [bx + 25, by], [bx + 75, by - 25], [bx + 75, by + 25], [bx + 145, by - 15], [bx + 145, by + 35]],
  ],
  river: [
    [[1100, 260], [1200, 300], [1300, 350], [1400, 400]],
  ],
};
for (const [name, strokes] of Object.entries(cases)) {
  const layer = new Uint8ClampedArray(rgba.length);
  for (const points of strokes) {
    const stroke = paintStroke(points, name === 'river' ? 24 : 26, target.color, target.code);
    for (let i = 0; i < layer.length; i += 4) if (stroke[i + 3]) layer.set(stroke.subarray(i, i + 4), i);
  }
  env.paintPixels = layer;
  const output = runtime.render();
  if (name === 'merged') {
    let active = 0, changed = 0, internal = 0, retainedInternal = 0, generated = 0, sourceEdgesInside = 0, sourceEdgesStillVisibleInside = 0;
    const leftoverImage = new Uint8ClampedArray(rgba.length);
    for (let index = 0; index < base.baseOwnerPixels.length; index++) {
      if (output.debug.activeZone[index] === target.code) active++;
      if (output.debug.changed[index]) changed++;
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
    summary.mergedGeometry = { activePixels: active, changedPixels: changed, detectedInternalEdges: internal, internalEdgesNotCleared: retainedInternal, sourceEdgesInsideActiveZone: sourceEdgesInside, sourceEdgesStillVisibleInside, generatedOutlinePixels: generated };
    const activeImage = new Uint8ClampedArray(rgba.length), internalImage = new Uint8ClampedArray(rgba.length);
    for (let index = 0; index < base.baseOwnerPixels.length; index++) {
      const offset = index * 4;
      if (output.debug.activeZone[index] === target.code) { activeImage[offset] = 240; activeImage[offset + 1] = 55; activeImage[offset + 2] = 80; activeImage[offset + 3] = 150; }
      if (output.debug.internalEdges[index]) { internalImage[offset] = 20; internalImage[offset + 1] = 255; internalImage[offset + 2] = 80; internalImage[offset + 3] = 255; }
    }
    saveLayer('merged-active-zone', activeImage); saveLayer('merged-internal-edges', internalImage); saveLayer('merged-leftover-edges', leftoverImage);
  }
  saveLayer(`${name}-paint`, layer);
  saveLayer(`${name}-border`, output.zoneBorderLayer.pixels || new Uint8ClampedArray(rgba.length));
  saveLayer(`${name}-mask`, output.zoneMaskLayer.pixels || new Uint8ClampedArray(rgba.length));
  saveLayer(`${name}-preserved-edges`, output.preservedEdgeLayer.pixels || new Uint8ClampedArray(rgba.length));
}
fs.writeFileSync(path.join(verification, 'probe-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
