(() => {
  const $ = selector => document.querySelector(selector);
  const stage = $('#map-stage'), image = $('#map-image'), canvas = $('#paint-layer'), ctx = canvas.getContext('2d');
  const { isSeaPixel, colorParts, randomAt, strokeSegments } = window.LetherelMapmakerGeometry;
  const { presetStates, legacyPresetColors } = window.LETHEREL_MAPMAKER_PRESET;
  const { width: portalWidth, height: portalHeight, points: portalPoints } = window.LETHEREL_MAPMAKER_PORTALS;
  const { download, exportProject, parseProject } = window.LetherelMapmakerFiles;
  const paintCanvas = document.createElement('canvas'), paintCtx = paintCanvas.getContext('2d');
  const paintHistoryCanvas = document.createElement('canvas'), paintHistoryCtx = paintHistoryCanvas.getContext('2d');
  const eraseCanvas = document.createElement('canvas'), eraseCtx = eraseCanvas.getContext('2d');
  const basePaintCanvas = document.createElement('canvas'), basePaintCtx = basePaintCanvas.getContext('2d');
  const stateList = $('#state-list'), locationList = $('#location-list'), labelsLayer = $('#labels-layer');
  const STORAGE_KEY = 'letherel-mapmaker-v1';
  const STATE_OPACITY = .7;
  const STATE_LABEL_SCALE = .9;
  const palette = ['#e89092','#ab84db','#85d887','#d3b975','#83b7e8','#d68aca','#7acfc6','#dfa866','#98c8ec','#c39bd3'];
  const BASE_MAP = window.LETHEREL_BASE_MAP_DATA || './assets/territori-base.png';
  const neutralImage = new Image();
  neutralImage.src = window.LETHEREL_NEUTRAL_MAP_DATA || './assets/territori-neutral.png';
  function createPreset() {
    const width = 2340, height = 1312;
    return {
      map: BASE_MAP, mapName: 'Letherel · Stati e confini', width, height,
      states: presetStates.map(([key, name, color], index) => ({ id: `base-${key}`, name, color, baseColor: color, code: index + 1, showLabel: true })),
      strokes: [], labels: presetStates.map(([key, , , x, y, size, rotation, labelWidth, curve]) => ({ stateId: `base-${key}`, x: x * width, y: y * height, size, rotation, width: labelWidth, curve })),
      locations: [], locationsVisible: true, labelsVisible: true, portalsVisible: true
    };
  }
  let project = createPreset();
  let currentOwnerPixels = null;
  let previewZoom = 1, previewPanX = 0, previewPanY = 0, panPointerId = null, panLastX = 0, panLastY = 0, spaceHeld = false, panMode = false;
  let expandedLocationId = null;
  let selectedId = project.states[0]?.id || null, selectedLocationId = null, tool = 'brush', drawing = false, activeStroke = null, landMask = null, landPixels = null, baseOwnerPixels = null, baseEdgePixels = null, baseEdgeLayer = null, preservedEdgeLayer = null, baseSourcePixels = null, neutralMapLayer = null, baseFillLayer = null, zoneMaskLayer = null, zoneBorderLayer = null;

  function id() { return `state-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
  function selectedState() { return project.states.find(state => state.id === selectedId); }
  function normalizeStateColors() {
    let nextCode = Math.max(presetStates.length, ...project.states.map(state => state.code || 0)) + 1;
    delete project.opacity;
    project.states.forEach(state => {
      const baseIndex = presetStates.findIndex(([key]) => state.id === `base-${key}`);
      if (baseIndex >= 0) {
        if (state.color?.toLowerCase() === legacyPresetColors[baseIndex]) {
          state.color = presetStates[baseIndex][2];
          project.strokes?.filter(stroke => stroke.stateId === state.id && stroke.color?.toLowerCase() === legacyPresetColors[baseIndex]).forEach(stroke => { stroke.color = state.color; });
        }
        state.baseColor = presetStates[baseIndex][2];
        state.code = baseIndex + 1;
      } else {
        state.baseColor ??= null;
        state.code ??= nextCode++;
      }
    });
  }
  function normalizeLocations() {
    if (!Array.isArray(project.locations)) project.locations = [];
    if (typeof project.locationsVisible !== 'boolean') project.locationsVisible = true;
    if (typeof project.labelsVisible !== 'boolean') project.labelsVisible = true;
    if (typeof project.portalsVisible !== 'boolean') project.portalsVisible = true;
    for (const location of project.locations) {
      if (typeof location.visible !== 'boolean') location.visible = true;
      location.iconSize = Number.isFinite(location.iconSize) ? Math.max(16, Math.min(120, location.iconSize)) : 44;
      location.labelSize = Number.isFinite(location.labelSize) ? Math.max(10, Math.min(80, location.labelSize)) : 24;
      if (!['top', 'bottom', 'right', 'left'].includes(location.labelPosition)) location.labelPosition = 'bottom';
      location.labelOffsetX = Number.isFinite(location.labelOffsetX) ? Math.max(-400, Math.min(400, location.labelOffsetX)) : 0;
      location.labelOffsetY = Number.isFinite(location.labelOffsetY) ? Math.max(-400, Math.min(400, location.labelOffsetY)) : 0;
    }
  }
  function restoreMissingAreaLabels() {
    if (project.map !== BASE_MAP || project.labels.length || !project.states.some(state => state.id.startsWith('base-'))) return false;
    const availableStates = new Set(project.states.map(state => state.id));
    project.labels = window.LETHEREL_MAPMAKER_BASE_LABELS
      .filter(label => availableStates.has(label.stateId))
      .map(label => ({ ...label }));
    return project.labels.length > 0;
  }
  function say(text) { $('#save-status').textContent = text; }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); say('Salvato automaticamente'); }
    catch { say('Esporta il progetto per salvarne una copia'); }
  }
  function applyViewport() {
    if (!project.width || !project.height) return;
    const stageWidth = stage.clientWidth, stageHeight = stage.clientHeight;
    const scale = Math.min(stageWidth / project.width, stageHeight / project.height) * previewZoom;
    const width = Math.max(1, Math.round(project.width * scale)), height = Math.max(1, Math.round(project.height * scale));
    const maxPanX = Math.max(0, (width - stageWidth) / 2), maxPanY = Math.max(0, (height - stageHeight) / 2);
    previewPanX = Math.max(-maxPanX, Math.min(maxPanX, previewPanX));
    previewPanY = Math.max(-maxPanY, Math.min(maxPanY, previewPanY));
    const left = (stageWidth - width) / 2 + previewPanX, top = (stageHeight - height) / 2 + previewPanY;
    for (const layer of [image, canvas, labelsLayer]) {
      layer.style.width = `${width}px`; layer.style.height = `${height}px`;
      layer.style.left = `${left}px`; layer.style.top = `${top}px`;
    }
    $('#zoom-level').textContent = `${Math.round(previewZoom * 100)}%`;
  }
  function zoomPreview(factor, clientX, clientY) {
    if (!project.map) return;
    const next = Math.max(1, Math.min(8, previewZoom * factor));
    if (next === previewZoom) return;
    const rect = stage.getBoundingClientRect();
    const focusX = clientX - rect.left - stage.clientWidth / 2;
    const focusY = clientY - rect.top - stage.clientHeight / 2;
    const ratio = next / previewZoom;
    previewPanX = focusX - (focusX - previewPanX) * ratio;
    previewPanY = focusY - (focusY - previewPanY) * ratio;
    previewZoom = next;
    applyViewport();
  }
  function fitCanvas() {
    if (!project.width || !project.height) return;
    canvas.width = project.width; canvas.height = project.height;
    paintCanvas.width = project.width; paintCanvas.height = project.height;
    paintHistoryCanvas.width = project.width; paintHistoryCanvas.height = project.height;
    eraseCanvas.width = project.width; eraseCanvas.height = project.height;
    basePaintCanvas.width = project.width; basePaintCanvas.height = project.height;
    applyViewport();
    renderStrokes(); renderLabels();
  }
  function buildBaseOwnerLookup() {
    const lookup = new Map();
    presetStates.forEach(([, , color], index) => {
      const [red, green, blue] = colorParts(color);
      lookup.set((red << 16) | (green << 8) | blue, index + 1);
    });
    return lookup;
  }
  function buildEditableBaseLayers() {
    const total = project.width * project.height;
    if (!baseSourcePixels || !baseOwnerPixels || !baseEdgePixels
      || baseSourcePixels.length !== total * 4
      || baseOwnerPixels.length !== total || baseEdgePixels.length !== total) return;
    const presetNeutralReady = project.map === BASE_MAP && project.width === 2340 && project.height === 1312
      && neutralImage.complete && neutralImage.naturalWidth === 2324;
    let neutralPixels;
    if (presetNeutralReady) {
      const neutralCanvas = document.createElement('canvas'); neutralCanvas.width = project.width; neutralCanvas.height = project.height;
      const neutralContext = neutralCanvas.getContext('2d');
      neutralContext.fillStyle = '#b4d2f3'; neutralContext.fillRect(0, 0, project.width, project.height);
      neutralContext.drawImage(neutralImage, 0, -22);
      neutralPixels = neutralContext.getImageData(0, 0, project.width, project.height).data;
    } else neutralPixels = new Uint8ClampedArray(baseSourcePixels);
    const fillImage = new ImageData(new Uint8ClampedArray(total * 4), project.width, project.height);
    const stateColors = new Map(project.states.map(state => [state.code, colorParts(state.color)]));
    for (let index = 0; index < total; index++) {
      const owner = baseOwnerPixels[index]; if (!owner) continue;
      const offset = index * 4;
      if (isSeaPixel(baseSourcePixels, offset)) continue;
      if (!presetNeutralReady) {
        neutralPixels[offset] = 238; neutralPixels[offset + 1] = 246; neutralPixels[offset + 2] = 251; neutralPixels[offset + 3] = 255;
      }
      const rgb = stateColors.get(owner); if (!rgb) continue;
      fillImage.data[offset] = rgb[0]; fillImage.data[offset + 1] = rgb[1]; fillImage.data[offset + 2] = rgb[2]; fillImage.data[offset + 3] = 255;
    }
    // Political outlines are a separate layer, so deleting preset paint cannot reveal a baked line.
    for (let index = 0; index < total && !presetNeutralReady; index++) if (baseEdgePixels[index]) {
      const offset = index * 4;
      neutralPixels[offset] = 238; neutralPixels[offset + 1] = 246; neutralPixels[offset + 2] = 251; neutralPixels[offset + 3] = 255;
    }
    neutralMapLayer = document.createElement('canvas'); neutralMapLayer.width = project.width; neutralMapLayer.height = project.height;
    neutralMapLayer.getContext('2d').putImageData(new ImageData(neutralPixels, project.width, project.height), 0, 0);
    baseFillLayer = document.createElement('canvas'); baseFillLayer.width = project.width; baseFillLayer.height = project.height;
    baseFillLayer.getContext('2d').putImageData(fillImage, 0, 0);
  }
  function buildLandMask() {
    if (!project.width || !project.height || !image.complete || !image.naturalWidth) return;
    const source = document.createElement('canvas'); source.width = project.width; source.height = project.height;
    const sourceContext = source.getContext('2d', { willReadFrequently: true }); sourceContext.drawImage(image, 0, 0, project.width, project.height);
    const pixels = sourceContext.getImageData(0, 0, project.width, project.height).data;
    baseSourcePixels = new Uint8ClampedArray(pixels);
    const total = project.width * project.height, waterCandidates = new Uint8Array(total), erodedWater = new Uint8Array(total), sea = new Uint8Array(total);
    for (let index = 0; index < total; index++) waterCandidates[index] = isSeaPixel(pixels, index * 4) ? 1 : 0;
    // Narrow blue waterways share the sea color; remove channels thinner than 3 px before clipping paint.
    for (let y = 1; y < project.height - 1; y++) for (let x = 1; x < project.width - 1; x++) {
      const index = y * project.width + x;
      if (!waterCandidates[index]) continue;
      let wideWater = true;
      for (let dy = -1; dy <= 1 && wideWater; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!waterCandidates[(y + dy) * project.width + x + dx]) { wideWater = false; break; }
      }
      if (wideWater) erodedWater[index] = 1;
    }
    for (let y = 1; y < project.height - 1; y++) for (let x = 1; x < project.width - 1; x++) {
      if (!erodedWater[y * project.width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sea[(y + dy) * project.width + x + dx] = 1;
    }
    const ownerLookup = buildBaseOwnerLookup();
    const cleanPixels = new Uint8ClampedArray(pixels), darkLines = new Uint8Array(total);
    for (let index = 0; index < total; index++) {
      const offset = index * 4, red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
      const luminance = red * .2126 + green * .7152 + blue * .0722;
      if (luminance < 105 && Math.max(red, green, blue) - Math.min(red, green, blue) < 55) darkLines[index] = 1;
    }
    for (let index = 0; index < total; index++) {
      if (!darkLines[index]) continue;
      const x = index % project.width, y = (index / project.width) | 0, samples = [[], [], []];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= project.width || ny >= project.height) continue;
        const neighbor = ny * project.width + nx;
        if (darkLines[neighbor]) continue;
        const offset = neighbor * 4;
        for (let channel = 0; channel < 3; channel++) samples[channel].push(pixels[offset + channel]);
      }
      if (!samples[0].length) continue;
      const offset = index * 4;
      for (let channel = 0; channel < 3; channel++) {
        samples[channel].sort((a, b) => a - b);
        cleanPixels[offset + channel] = samples[channel][Math.floor(samples[channel].length / 2)];
      }
    }
    // Seed ownership from the exact state fills, then extend it across rivers and outlines.
    baseOwnerPixels = new Uint8Array(total); baseEdgePixels = darkLines;
    const fillable = new Uint8Array(total), ownerSeeds = new Uint8Array(total), ownerDistance = new Uint8Array(total), ownerQueue = new Int32Array(total); ownerDistance.fill(255); let queueLength = 0;
    for (let index = 0; index < total; index++) {
      if (sea[index]) continue;
      const offset = index * 4;
      if (Math.abs(cleanPixels[offset] - 238) + Math.abs(cleanPixels[offset + 1] - 246) + Math.abs(cleanPixels[offset + 2] - 251) < 32) continue;
      fillable[index] = 1;
      const owner = ownerLookup.get((cleanPixels[offset] << 16) | (cleanPixels[offset + 1] << 8) | cleanPixels[offset + 2]) || 0;
      if (owner) { baseOwnerPixels[index] = owner; ownerSeeds[index] = 1; ownerDistance[index] = 0; ownerQueue[queueLength++] = index; }
    }
    // Extend ownership only across thin outlines and river strokes; never propagate along a whole river network.
    for (let head = 0; head < queueLength; head++) {
      const index = ownerQueue[head], owner = baseOwnerPixels[index], x = index % project.width, y = (index / project.width) | 0;
      const nextDistance = ownerDistance[index] + 1;
      if (nextDistance > 4) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= project.width || ny >= project.height) continue;
        const neighbor = ny * project.width + nx;
        if (fillable[neighbor] && !baseOwnerPixels[neighbor]) { baseOwnerPixels[neighbor] = owner; ownerDistance[neighbor] = nextDistance; ownerQueue[queueLength++] = neighbor; }
      }
    }
    const smoothedOwners = new Uint8Array(baseOwnerPixels), neighborCounts = new Uint16Array(256);
    for (let index = 0; index < total; index++) {
      if (ownerSeeds[index] || !baseOwnerPixels[index]) continue;
      const x = index % project.width, y = (index / project.width) | 0; neighborCounts.fill(0);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= project.width || ny >= project.height) continue;
        const owner = baseOwnerPixels[ny * project.width + nx]; if (owner) neighborCounts[owner]++;
      }
      let dominantOwner = 0, dominantCount = 0, runnerUpCount = 0;
      for (let owner = 1; owner < neighborCounts.length; owner++) {
        const count = neighborCounts[owner];
        if (count > dominantCount) { runnerUpCount = dominantCount; dominantCount = count; dominantOwner = owner; }
        else if (count > runnerUpCount) runnerUpCount = count;
      }
      if (dominantCount >= 20 && dominantCount > runnerUpCount * 1.5) smoothedOwners[index] = dominantOwner;
    }
    baseOwnerPixels = smoothedOwners;
    buildEditableBaseLayers();
    baseEdgeLayer = document.createElement('canvas'); baseEdgeLayer.width = project.width; baseEdgeLayer.height = project.height;
    const edgeContext = baseEdgeLayer.getContext('2d'), edgeImage = edgeContext.createImageData(project.width, project.height);
    for (let index = 0; index < total; index++) if (darkLines[index]) {
      const offset = index * 4; edgeImage.data[offset] = pixels[offset]; edgeImage.data[offset + 1] = pixels[offset + 1]; edgeImage.data[offset + 2] = pixels[offset + 2]; edgeImage.data[offset + 3] = 255;
    }
    edgeContext.putImageData(edgeImage, 0, 0);
    preservedEdgeLayer = document.createElement('canvas'); preservedEdgeLayer.width = project.width; preservedEdgeLayer.height = project.height;
    landMask = document.createElement('canvas'); landMask.width = project.width; landMask.height = project.height;
    const maskContext = landMask.getContext('2d'), maskImage = maskContext.createImageData(project.width, project.height);
    landPixels = new Uint8Array(total);
    for (let index = 0; index < total; index++) {
      if (sea[index]) continue;
      const x = index % project.width, y = (index / project.width) | 0;
      const edge = x === 0 || y === 0 || x === project.width - 1 || y === project.height - 1
        || sea[index - 1] || sea[index + 1] || sea[index - project.width] || sea[index + project.width];
      if (!edge) { maskImage.data[index * 4 + 3] = 255; landPixels[index] = 1; }
    }
    maskContext.putImageData(maskImage, 0, 0); say('Mappa pronta'); renderStrokes();
  }
  function isLand(point) {
    if (!landPixels || point.x < 0 || point.y < 0 || point.x >= project.width || point.y >= project.height) return false;
    return landPixels[Math.floor(point.y) * project.width + Math.floor(point.x)] === 1;
  }
  function buildZoneBorder() {
    if (!paintCanvas.width || !paintCanvas.height || !landPixels || !baseOwnerPixels || !baseEdgePixels) { zoneMaskLayer = null; zoneBorderLayer = null; currentOwnerPixels = null; return; }
    const width = paintCanvas.width, height = paintCanvas.height, pixels = paintCtx.getImageData(0, 0, width, height).data, erasePixels = eraseCtx.getImageData(0, 0, width, height).data, paintHistoryPixels = paintHistoryCtx.getImageData(0, 0, width, height).data;
    const total = width * height, finalOwner = new Uint8Array(baseOwnerPixels), changed = new Uint8Array(total), painted = new Uint8Array(total), erased = new Uint8Array(total), crossedEdges = new Uint8Array(total), colorCodes = new Map(), stateColors = [], liveCodes = new Set(project.states.map(state => state.code)), edgeAxes = [[1, 0], [0, 1], [1, 1], [1, -1]];
    const hasDeletedPreset = presetStates.some((_, index) => !liveCodes.has(index + 1));
    for (let index = 0; index < total; index++) {
      if (finalOwner[index] && !liveCodes.has(finalOwner[index])) finalOwner[index] = 0;
      if (erasePixels[index * 4 + 3] >= 128 && landPixels[index] && (finalOwner[index] || paintHistoryPixels[index * 4 + 3] >= 128)) {
        erased[index] = 1;
        if (finalOwner[index]) changed[index] = 1;
        finalOwner[index] = 0;
      }
    }
    for (const state of project.states) {
      const [red, green, blue] = colorParts(state.color);
      colorCodes.set((red << 16) | (green << 8) | blue, state.code);
      stateColors.push({ red, green, blue, code: state.code });
    }
    function paintCodeAt(offset) {
      const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
      const key = (red << 16) | (green << 8) | blue;
      if (colorCodes.has(key)) return colorCodes.get(key);
      let nearest = 0, shortestDistance = Infinity;
      for (const state of stateColors) {
        const distance = (red - state.red) ** 2 + (green - state.green) ** 2 + (blue - state.blue) ** 2;
        if (distance < shortestDistance) { shortestDistance = distance; nearest = state.code; }
      }
      colorCodes.set(key, nearest);
      return nearest;
    }
    function edgeNormalAt(index) {
      const x = index % width, y = (index / width) | 0; let normal = edgeAxes[0], lowestRun = Infinity;
      for (const axis of edgeAxes) {
        let run = 0;
        for (let distance = -3; distance <= 3; distance++) {
          const nx = x + axis[0] * distance, ny = y + axis[1] * distance;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && baseEdgePixels[ny * width + nx]) run++;
        }
        if (run < lowestRun) { lowestRun = run; normal = axis; }
      }
      return normal;
    }
    function brushCrossesOriginalEdge(index, paintCode) {
      const x = index % width, y = (index / width) | 0, normal = edgeNormalAt(index), paintedSides = [false, false], ownerSides = [0, 0];
      for (let side = 0; side < 2; side++) {
        const direction = side === 0 ? -1 : 1;
        for (let distance = 2; distance <= 5; distance++) {
          const nx = x + normal[0] * direction * distance, ny = y + normal[1] * direction * distance;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = ny * width + nx, offset = neighbor * 4;
          if (!ownerSides[side] && baseOwnerPixels[neighbor]) ownerSides[side] = baseOwnerPixels[neighbor];
          if (pixels[offset + 3] >= 8 && paintCodeAt(offset) === paintCode) paintedSides[side] = true;
        }
      }
      return ownerSides[0] !== ownerSides[1] && paintedSides[0] && paintedSides[1];
    }
    for (let index = 0; index < total; index++) {
      const offset = index * 4; if (pixels[offset + 3] < 8) continue;
      const paintCode = paintCodeAt(offset); if (!paintCode) continue;
      let baseCode = finalOwner[index];
      if (baseCode !== paintCode) {
        const x = index % width, y = (index / width) | 0; let matchingOwners = 0, otherOwners = 0;
        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const owner = baseOwnerPixels[ny * width + nx];
          if (owner === paintCode) matchingOwners++;
          else if (owner) otherOwners++;
        }
        // River and outline pixels inherit their surrounding territory instead of seeding a false region.
        if (matchingOwners >= 10 && matchingOwners > otherOwners * 1.5) baseCode = paintCode;
      }
      let touchesPaintState = paintCode === baseCode, paintsAcrossEdge = false;
      if (baseEdgePixels[index]) {
        for (let dy = -2; dy <= 2 && !touchesPaintState; dy++) for (let dx = -2; dx <= 2; dx++) {
          const x = index % width + dx, y = ((index / width) | 0) + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const neighbor = y * width + x;
          if (baseOwnerPixels[neighbor] === paintCode) touchesPaintState = true;
        }
        // A brush near an old line is not enough to activate it. The painted color
        // must cover both sides of that line, otherwise an existing state's outer
        // edge would be redrawn as a second, jagged outline.
        paintsAcrossEdge = brushCrossesOriginalEdge(index, paintCode);
        if (paintsAcrossEdge) crossedEdges[index] = 1;
        if (baseCode !== paintCode && touchesPaintState && !paintsAcrossEdge) continue;
      }
      finalOwner[index] = paintCode; painted[index] = 1;
      if (baseCode !== paintCode || (baseEdgePixels[index] && paintsAcrossEdge)) changed[index] = 1;
    }

    currentOwnerPixels = finalOwner;
    // Outline only the painted footprint that changes ownership. Flooding through
    // the whole preset territory redraws its distant, untouched outer perimeter.
    const activeZone = new Uint8Array(total), visitedPaint = new Uint8Array(total), queue = new Int32Array(total);
    for (let start = 0; start < total; start++) {
      const code = finalOwner[start];
      if (!painted[start] || !code || visitedPaint[start]) continue;
      let head = 0, queueLength = 0, componentChangesOwnership = false;
      queue[queueLength++] = start; visitedPaint[start] = 1;
      while (head < queueLength) {
        const index = queue[head++], x = index % width, y = (index / width) | 0;
        if (changed[index]) componentChangesOwnership = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (painted[neighbor] && finalOwner[neighbor] === code && !visitedPaint[neighbor]) { visitedPaint[neighbor] = 1; queue[queueLength++] = neighbor; }
        }
      }
      if (componentChangesOwnership) for (let index = 0; index < queueLength; index++) activeZone[queue[index]] = code;
    }

    // Remove original dark borders only where the merged territory now covers both sides.
    const internalEdges = new Uint8Array(total);
    for (let index = 0; index < total; index++) {
      if (!baseEdgePixels[index]) continue;
      const x = index % width, y = (index / width) | 0, normal = edgeNormalAt(index);
      const sides = [0, 0];
      for (let side = 0; side < 2; side++) {
        const direction = side === 0 ? -1 : 1;
        for (let distance = 2; distance <= 5; distance++) {
          const nx = x + normal[0] * direction * distance, ny = y + normal[1] * direction * distance;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const code = activeZone[ny * width + nx];
          if (code) { sides[side] = code; break; }
        }
      }
      if (sides[0] && sides[0] === sides[1]) internalEdges[index] = 1;
    }

    zoneBorderLayer = document.createElement('canvas'); zoneBorderLayer.width = width; zoneBorderLayer.height = height;
    const borderContext = zoneBorderLayer.getContext('2d'), output = borderContext.createImageData(width, height), border = new Uint8Array(total);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!landPixels[index]) continue;
      const zoneCode = activeZone[index];
      for (let dy = -1; dy <= 1 && !border[index]; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const neighbor = (y + dy) * width + x + dx, neighborCode = activeZone[neighbor];
        if (!neighborCode || neighborCode === zoneCode) continue;
        if (!zoneCode && finalOwner[index] !== neighborCode) border[index] = neighborCode;
        else if (zoneCode && zoneCode < neighborCode) border[index] = zoneCode;
      }
      if (!border[index] && erased[index] && !finalOwner[index]) {
        for (let dy = -1; dy <= 1 && !border[index]; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const neighborCode = finalOwner[(y + dy) * width + x + dx];
          if (neighborCode) { border[index] = neighborCode; break; }
        }
      }
      if (border[index]) {
        let followsWater = false;
        for (let dy = -2; dy <= 2 && !followsWater; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && !landPixels[ny * width + nx]) { followsWater = true; break; }
        }
        if (followsWater) border[index] = 0;
      }
    }
    const expanded = new Uint8Array(total);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const index = y * width + x, outlineCode = border[index];
      if (!outlineCode || activeZone[index]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, neighbor = ny * width + nx;
        if (!landPixels[neighbor] || activeZone[neighbor] || finalOwner[neighbor] === outlineCode) continue;
        let followsWater = false;
        for (let wy = -2; wy <= 2 && !followsWater; wy++) for (let wx = -2; wx <= 2; wx++) {
          const waterX = nx + wx, waterY = ny + wy;
          if (waterX >= 0 && waterY >= 0 && waterX < width && waterY < height && !landPixels[waterY * width + waterX]) { followsWater = true; break; }
        }
        if (!followsWater) expanded[neighbor] = outlineCode;
      }
    }
    for (let index = 0; index < total; index++) if (border[index] || expanded[index]) {
      const offset = index * 4; output.data[offset] = 20; output.data[offset + 1] = 29; output.data[offset + 2] = 31; output.data[offset + 3] = 235;
    }
    borderContext.putImageData(output, 0, 0);
    // Clear the old map border under both the recolored area and its replacement outline.
    zoneMaskLayer = document.createElement('canvas'); zoneMaskLayer.width = width; zoneMaskLayer.height = height;
    const zoneMaskContext = zoneMaskLayer.getContext('2d'), maskPixels = zoneMaskContext.createImageData(width, height);
    for (let index = 0; index < total; index++) {
      let clearOldLine = Boolean(erased[index] || changed[index] || crossedEdges[index] || border[index] || expanded[index] || internalEdges[index]);
      if (!clearOldLine && baseEdgePixels[index] && hasDeletedPreset) {
        const x = index % width, y = (index / width) | 0; let nearDeleted = false, nearLive = false;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const owner = baseOwnerPixels[ny * width + nx];
          if (!owner) continue;
          if (liveCodes.has(owner)) nearLive = true; else nearDeleted = true;
        }
        if (nearDeleted && !nearLive) clearOldLine = true;
      }
      if (!clearOldLine && baseEdgePixels[index]) {
        const x = index % width, y = (index / width) | 0;
        for (let dy = -3; dy <= 3 && !clearOldLine; dy++) for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
            const neighbor = ny * width + nx;
            if (border[neighbor] || expanded[neighbor]) { clearOldLine = true; break; }
          }
        }
      }
      if (clearOldLine) maskPixels.data[index * 4 + 3] = 255;
    }
    zoneMaskContext.putImageData(maskPixels, 0, 0);
    if (baseEdgeLayer && preservedEdgeLayer) {
      const preservedContext = preservedEdgeLayer.getContext('2d');
      preservedContext.clearRect(0, 0, width, height); preservedContext.globalCompositeOperation = 'source-over'; preservedContext.drawImage(baseEdgeLayer, 0, 0);
      preservedContext.globalCompositeOperation = 'destination-out'; preservedContext.drawImage(zoneMaskLayer, 0, 0); preservedContext.globalCompositeOperation = 'source-over';
    }
  }
  function drawRoughStroke(stroke, target = paintCtx) {
    strokeSegments(stroke).forEach((points, segmentIndex) => {
    if (!points.length) return;
    const spacing = Math.max(2, stroke.size * .22), centers = [points[0]];
    let carry = 0;
    for (let index = 1; index < points.length; index++) {
      const from = points[index - 1], to = points[index], dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
      if (!length) continue;
      let distance = spacing - carry;
      while (distance < length) { centers.push({ x: from.x + dx * distance / length, y: from.y + dy * distance / length }); distance += spacing; }
      carry = Math.max(0, length - (distance - spacing));
    }
    centers.push(points.at(-1));
    const roughness = Math.max(0, Math.min(1, stroke.roughness ?? .35)), vertices = Math.round(28 - roughness * 16), seed = (stroke.seed || 1) + segmentIndex * 1009;
    target.beginPath();
    centers.forEach((center, stamp) => {
      for (let vertex = 0; vertex < vertices; vertex++) {
        const angle = vertex / vertices * Math.PI * 2;
        const jitter = (randomAt(seed, stamp, vertex) * 2 - 1) * roughness * .92;
        const radius = stroke.size * .5 * (1 + jitter), x = center.x + Math.cos(angle) * radius, y = center.y + Math.sin(angle) * radius;
        if (vertex === 0) target.moveTo(x, y); else target.lineTo(x, y);
      }
      target.closePath();
    });
    target.fillStyle = stroke.color; target.fill();
    });
  }
  function drawEraseStroke(stroke, target) {
    drawRoughStroke({ ...stroke, color: '#000' }, target);
  }
  function renderStrokes() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (neutralMapLayer && neutralMapLayer.width === canvas.width && neutralMapLayer.height === canvas.height) ctx.drawImage(neutralMapLayer, 0, 0);
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    // Retain paint removed by later erasers, so blank land never becomes a false erased territory.
    paintHistoryCtx.clearRect(0, 0, paintHistoryCanvas.width, paintHistoryCanvas.height);
    eraseCtx.clearRect(0, 0, eraseCanvas.width, eraseCanvas.height);
    const needsPaintHistory = project.strokes.some(stroke => stroke.tool === 'erase');
    for (const stroke of project.strokes) {
      if (stroke.tool === 'erase') {
        paintCtx.globalCompositeOperation = 'destination-out'; drawEraseStroke(stroke, paintCtx);
        eraseCtx.globalCompositeOperation = 'source-over'; drawEraseStroke(stroke, eraseCtx);
      } else { paintCtx.globalCompositeOperation = 'source-over'; paintCtx.globalAlpha = 1; drawRoughStroke(stroke, paintCtx); if (needsPaintHistory) drawRoughStroke(stroke, paintHistoryCtx); }
    }
    paintCtx.globalAlpha = 1; paintCtx.globalCompositeOperation = 'source-over';
    if (landMask && landMask.width === canvas.width && landMask.height === canvas.height) { paintCtx.globalCompositeOperation = 'destination-in'; paintCtx.drawImage(landMask, 0, 0); paintCtx.globalCompositeOperation = 'source-over'; }
    if (landMask && landMask.width === canvas.width && landMask.height === canvas.height) { eraseCtx.globalCompositeOperation = 'destination-in'; eraseCtx.drawImage(landMask, 0, 0); eraseCtx.globalCompositeOperation = 'source-over'; }
    if (!drawing) buildZoneBorder();
    if (baseFillLayer && baseFillLayer.width === canvas.width && baseFillLayer.height === canvas.height) {
      basePaintCtx.clearRect(0, 0, basePaintCanvas.width, basePaintCanvas.height);
      basePaintCtx.globalCompositeOperation = 'source-over'; basePaintCtx.drawImage(baseFillLayer, 0, 0);
      basePaintCtx.globalCompositeOperation = 'destination-out'; basePaintCtx.drawImage(eraseCanvas, 0, 0);
      basePaintCtx.drawImage(paintCanvas, 0, 0);
      basePaintCtx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = STATE_OPACITY; ctx.drawImage(basePaintCanvas, 0, 0); ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = STATE_OPACITY; ctx.drawImage(paintCanvas, 0, 0); ctx.globalAlpha = 1;
    if (preservedEdgeLayer && preservedEdgeLayer.width === canvas.width && preservedEdgeLayer.height === canvas.height) ctx.drawImage(preservedEdgeLayer, 0, 0);
    if (zoneBorderLayer && zoneBorderLayer.width === canvas.width && zoneBorderLayer.height === canvas.height) ctx.drawImage(zoneBorderLayer, 0, 0);
    $('#stroke-total').textContent = project.strokes.length;
  }
  function renderLabels() {
    labelsLayer.replaceChildren();
    labelsLayer.setAttribute('width', String(project.width));
    labelsLayer.setAttribute('height', String(project.height));
    labelsLayer.setAttribute('viewBox', `0 0 ${project.width} ${project.height}`);
    labelsLayer.setAttribute('preserveAspectRatio', 'none');
    renderPortals();
    for (const label of project.labelsVisible ? project.labels : []) {
      const state = project.states.find(item => item.id === label.stateId);
      if (!state || !state.showLabel) continue;
      const preset = state.id.startsWith('base-') && presetStates.find(([key]) => state.id === `base-${key}`);
      const usePresetStyle = Boolean(preset && label.width == null);
      const width = Math.min(label.width || preset?.[7] || 220, project.width * .4);
      const curve = label.curve ?? preset?.[8] ?? 0;
      const fontSize = (usePresetStyle ? preset[5] : label.size || preset?.[5] || 28) * STATE_LABEL_SCALE;
      const name = state.name || 'Stato';
      const fontFamily = '"Old English Text MT", "UnifrakturMaguntia", "Palatino Linotype", serif';
      ctx.save();
      ctx.font = `normal ${fontSize}px ${fontFamily}`;
      const naturalWidth = ctx.measureText(name).width + Math.max(0, name.length - 1) * .35;
      ctx.restore();
      const fittedSize = naturalWidth > width ? fontSize * width / naturalWidth : fontSize;
      const id = `label-path-${label.stateId.replace(/[^a-z0-9_-]/gi, '-')}`;
      const startX = label.x - width / 2, endX = label.x + width / 2, endY = label.y + curve / 2;
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.id = id; path.setAttribute('d', `M ${startX} ${endY} Q ${label.x} ${label.y - curve} ${endX} ${endY}`); defs.append(path);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('font-family', fontFamily);
      text.setAttribute('font-size', String(fittedSize)); text.setAttribute('font-weight', 'normal');
      text.setAttribute('fill', '#26313a'); text.setAttribute('fill-opacity', '.86');
      text.setAttribute('stroke', '#f2f4ed'); text.setAttribute('stroke-opacity', '.56');
      text.setAttribute('stroke-width', '1.5'); text.setAttribute('stroke-linejoin', 'round'); text.setAttribute('paint-order', 'stroke');
      text.setAttribute('letter-spacing', '.35'); text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      const textPath = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
      textPath.setAttribute('href', `#${id}`); textPath.setAttribute('startOffset', '50%');
      textPath.textContent = name; text.append(textPath); labelsLayer.append(defs, text);
    }
    renderLocationMarkers();
  }
  function renderPortals() {
    if (!project.portalsVisible || !project.width || !project.height) return;
    const ns = 'http://www.w3.org/2000/svg';
    const layer = document.createElementNS(ns, 'g');
    layer.setAttribute('id', 'portals-layer');
    const scaleX = project.width / portalWidth, scaleY = project.height / portalHeight;
    const markerScale = Math.min(scaleX, scaleY);
    for (const [x, y] of portalPoints) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', String(x * scaleX)); dot.setAttribute('cy', String(y * scaleY));
      dot.setAttribute('r', String(3.5 * markerScale));
      dot.setAttribute('fill', '#071bdc'); dot.setAttribute('stroke', '#fff');
      dot.setAttribute('stroke-width', String(1.7 * markerScale));
      layer.append(dot);
    }
    labelsLayer.append(layer);
  }
  function locationLabelLayout(location) {
    const radius = location.iconSize / 2;
    switch (location.labelPosition) {
      case 'top': return { x: 0, y: -radius - 8, anchor: 'middle', baseline: 'auto' };
      case 'right': return { x: radius + 8, y: 0, anchor: 'start', baseline: 'middle' };
      case 'left': return { x: -radius - 8, y: 0, anchor: 'end', baseline: 'middle' };
      default: return { x: 0, y: radius + location.labelSize + 2, anchor: 'middle', baseline: 'auto' };
    }
  }
  function hasBakedPortals() {
    if (project.map === BASE_MAP || !image.naturalWidth || !image.naturalHeight
      || Math.abs(image.naturalWidth / image.naturalHeight - portalWidth / portalHeight) > .02) return false;
    const probe = document.createElement('canvas'); probe.width = 11; probe.height = 11;
    const probeCtx = probe.getContext('2d', { willReadFrequently: true });
    let matches = 0;
    try {
      for (const index of [0, 20, 45, 70, 95, 120, 145, 170]) {
        const [x, y] = portalPoints[index];
        const px = Math.round(x * image.naturalWidth / portalWidth);
        const py = Math.round(y * image.naturalHeight / portalHeight);
        const radius = Math.max(3, Math.ceil(2 * image.naturalWidth / portalWidth));
        probeCtx.clearRect(0, 0, 11, 11);
        probeCtx.drawImage(image, px - radius, py - radius, radius * 2 + 1, radius * 2 + 1, 0, 0, 11, 11);
        const pixels = probeCtx.getImageData(0, 0, 11, 11).data;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
          if (red < 85 && green < 90 && blue > 150 && blue > red + 90 && blue > green + 90) {
            matches++;
            break;
          }
        }
      }
    } catch { return false; } // A map from another origin may not allow pixel inspection.
    return matches >= 5;
  }
  function renderLocationMarkers() {
    if (!project.locationsVisible) return;
    const ns = 'http://www.w3.org/2000/svg';
    const layer = document.createElementNS(ns, 'g');
    layer.setAttribute('id', 'locations-layer');
    for (const location of project.locations) {
      if (!location.visible || !Number.isFinite(location.x) || !Number.isFinite(location.y)) continue;
      const marker = document.createElementNS(ns, 'g');
      marker.setAttribute('transform', `translate(${location.x} ${location.y})`);
      const icon = document.createElementNS(ns, 'g');
      icon.setAttribute('transform', `scale(${location.iconSize / 44})`);
      const halo = document.createElementNS(ns, 'circle');
      halo.setAttribute('r', '22'); halo.setAttribute('fill', '#f2f4ed'); halo.setAttribute('fill-opacity', '.94');
      halo.setAttribute('stroke', '#26313a'); halo.setAttribute('stroke-width', '2');
      icon.append(halo);
      const symbol = document.createElementNS(ns, 'path');
      const shapes = {
        city: 'M -14 12 V -7 H -10 V -11 H -6 V -7 H -2 V -13 H 2 V -7 H 6 V -11 H 10 V -7 H 14 V 12 Z M -4 12 V 3 A 4 4 0 0 1 4 3 V 12',
        mountains: 'M -17 12 L -6 -12 L 2 4 L 8 -8 L 18 12 Z M -10 0 L -6 -7 L -2 0 M 5 1 L 8 -3 L 11 1',
        forest: 'M -10 -8 L -15 0 H -13 L -17 8 H -3 L -7 0 H -5 Z M -10 8 V 14 M 10 -8 L 5 0 H 7 L 3 8 H 17 L 13 0 H 15 Z M 10 8 V 14 M 0 -14 L -6 -2 H -4 L -9 10 H 9 L 4 -2 H 6 Z M 0 10 V 16'
      };
      symbol.setAttribute('d', shapes[location.type] || shapes.city);
      if (location.type === 'mountains') symbol.setAttribute('transform', 'scale(0.92)');
      symbol.setAttribute('fill', { city: '#c9a977', mountains: '#aeb8b9', forest: '#8aaa87' }[location.type] || '#c9a977');
      symbol.setAttribute('stroke', '#26313a'); symbol.setAttribute('stroke-width', '2');
      symbol.setAttribute('stroke-linecap', 'round'); symbol.setAttribute('stroke-linejoin', 'round');
      icon.append(symbol); marker.append(icon);
      if (location.name) {
        const name = document.createElementNS(ns, 'text');
        const layout = locationLabelLayout(location);
        name.setAttribute('x', String(layout.x + location.labelOffsetX));
        name.setAttribute('y', String(layout.y + location.labelOffsetY));
        name.setAttribute('text-anchor', layout.anchor); name.setAttribute('dominant-baseline', layout.baseline);
        name.setAttribute('font-family', '"Palatino Linotype", Georgia, serif');
        name.setAttribute('font-size', String(location.labelSize)); name.setAttribute('font-weight', 'normal');
        name.setAttribute('fill', '#26313a'); name.setAttribute('stroke', '#f2f4ed');
        name.setAttribute('stroke-width', String(Math.max(2, location.labelSize / 6))); name.setAttribute('stroke-linejoin', 'round');
        name.setAttribute('paint-order', 'stroke'); name.textContent = location.name;
        marker.append(name);
      }
      layer.append(marker);
    }
    labelsLayer.append(layer);
  }
  function renderStates() {
    stateList.replaceChildren();
    if (!project.states.length) { const empty = document.createElement('div'); empty.className = 'empty-states'; empty.textContent = 'Crea il primo Stato per iniziare a colorare.'; stateList.append(empty); }
    for (const state of project.states) {
      const card = document.createElement('div'); card.className = `state-card${state.id === selectedId ? ' selected' : ''}`; card.style.setProperty('--swatch', state.color); card.dataset.id = state.id;
      const swatch = document.createElement('span'); swatch.className = 'state-swatch';
      const main = document.createElement('div'); main.className = 'state-card-main';
      const name = document.createElement('input'); name.value = state.name; name.maxLength = 50; name.setAttribute('aria-label', 'Nome dello Stato'); name.addEventListener('focus', () => select(state.id)); name.addEventListener('input', () => { state.name = name.value; renderLabels(); save(); });
      const meta = document.createElement('div'); meta.className = 'state-meta';
      const count = project.strokes.filter(stroke => stroke.stateId === state.id && stroke.tool !== 'erase').length;
      const amount = document.createElement('span'); amount.textContent = `${count} penn.`;
      const color = document.createElement('input'); color.type = 'color'; color.className = 'state-color'; color.value = state.color; color.title = 'Cambia colore'; color.setAttribute('aria-label', `Colore di ${state.name}`); color.addEventListener('click', event => event.stopPropagation()); color.addEventListener('input', () => { state.color = color.value; project.strokes.filter(stroke => stroke.stateId === state.id && stroke.tool !== 'erase').forEach(stroke => { stroke.color = state.color; }); card.style.setProperty('--swatch', state.color); buildEditableBaseLayers(); renderStrokes(); save(); });
      const label = document.createElement('label'); label.className = 'show-label'; const check = document.createElement('input'); check.type = 'checkbox'; check.checked = state.showLabel; check.addEventListener('change', () => { state.showLabel = check.checked; renderLabels(); save(); }); label.append(check, document.createTextNode('Etichetta'));
      meta.append(amount, color, label); main.append(name, meta);
      const del = document.createElement('button'); del.type = 'button'; del.className = 'state-delete'; del.textContent = '×'; del.title = 'Elimina Stato'; del.setAttribute('aria-label', `Elimina ${state.name}`); del.addEventListener('click', event => { event.stopPropagation(); if (!confirm(`Eliminare “${state.name}” e le sue pennellate?`)) return; project.states = project.states.filter(item => item.id !== state.id); project.strokes = project.strokes.filter(stroke => stroke.tool === 'erase' || stroke.stateId !== state.id); project.labels = project.labels.filter(item => item.stateId !== state.id); if (selectedId === state.id) selectedId = project.states[0]?.id || null; renderAll(); save(); });
      card.append(swatch, main, del); card.addEventListener('click', event => { if (!event.target.closest('input,button,label')) select(state.id); }); stateList.append(card);
    }
    $('#state-total').textContent = project.states.length;
  }
  function locationSizeControl(location, key, title, min, max) {
    const label = document.createElement('label'); label.className = 'location-size-control';
    const heading = document.createElement('span'); heading.className = 'location-size-heading';
    const caption = document.createElement('span'); caption.textContent = title;
    const value = document.createElement('output'); value.textContent = `${location[key]} px`;
    heading.append(caption, value);
    const slider = document.createElement('input'); slider.type = 'range';
    slider.min = String(min); slider.max = String(max); slider.value = String(location[key]);
    slider.setAttribute('aria-label', `${title} di ${location.name || 'luogo'}`);
    slider.addEventListener('input', () => {
      location[key] = Number(slider.value); value.textContent = `${slider.value} px`;
      renderLabels(); save();
    });
    label.append(heading, slider);
    return label;
  }
  function locationOffsetControl(location, key, title) {
    const label = document.createElement('label'); label.className = 'location-size-control';
    const heading = document.createElement('span'); heading.className = 'location-size-heading';
    const value = document.createElement('output'); value.textContent = `${Math.round(location[key])} px`;
    heading.append(document.createTextNode(title), value);
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '-400'; slider.max = '400'; slider.value = String(location[key]);
    slider.setAttribute('aria-label', `${title} di ${location.name || 'luogo'}`);
    slider.addEventListener('input', () => {
      location[key] = Number(slider.value); value.textContent = `${slider.value} px`;
      renderLabels(); save();
    });
    label.append(heading, slider);
    return label;
  }
  function renderLocationList() {
    locationList.replaceChildren();
    $('#show-locations').checked = project.locationsVisible;
    if (!project.locations.some(location => location.id === expandedLocationId)) expandedLocationId = null;
    if (!project.locations.length) {
      const empty = document.createElement('div'); empty.className = 'empty-states';
      empty.textContent = 'Nessun luogo. Premi + per aggiungerne uno.'; locationList.append(empty);
    }
    for (const location of project.locations) {
      const card = document.createElement('div');
      card.className = `location-card${location.id === expandedLocationId ? ' selected' : ''}${location.visible ? '' : ' is-hidden'}`;
      const summaryRow = document.createElement('div'); summaryRow.className = 'location-summary-row';
      const summary = document.createElement('button'); summary.type = 'button'; summary.className = 'location-summary';
      summary.setAttribute('aria-expanded', String(location.id === expandedLocationId));
      const summaryName = document.createElement('span'); summaryName.className = 'location-summary-name';
      summaryName.textContent = location.name || 'Luogo senza nome';
      const summaryType = document.createElement('span'); summaryType.className = 'location-summary-type';
      summaryType.textContent = { city: 'Città', mountains: 'Monti', forest: 'Foresta' }[location.type] || 'Città';
      const arrow = document.createElement('span'); arrow.className = 'location-summary-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '⌄';
      summary.append(summaryName, summaryType, arrow);
      const eye = document.createElement('button'); eye.type = 'button'; eye.className = 'location-eye';
      eye.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/><path class="eye-slash" d="M3 3 21 21"/></svg>';
      const updateEye = () => {
        const action = location.visible ? 'Nascondi' : 'Mostra';
        eye.classList.toggle('is-off', !location.visible);
        card.classList.toggle('is-hidden', !location.visible);
        eye.setAttribute('aria-label', `${action} ${location.name || 'luogo'}`);
        eye.setAttribute('aria-pressed', String(location.visible));
        eye.title = `${action} ${location.name || 'luogo'}`;
      };
      updateEye();
      eye.addEventListener('click', () => { location.visible = !location.visible; updateEye(); renderLabels(); save(); });
      summary.addEventListener('click', () => {
        expandedLocationId = expandedLocationId === location.id ? null : location.id;
        if (expandedLocationId) selectedLocationId = location.id;
        renderLocationList();
      });
      summaryRow.append(summary, eye); card.append(summaryRow);
      if (location.id !== expandedLocationId) { locationList.append(card); continue; }
      const details = document.createElement('div'); details.className = 'location-details';
      const top = document.createElement('div'); top.className = 'location-card-top';
      const name = document.createElement('input'); name.className = 'location-name'; name.type = 'text'; name.maxLength = 50;
      name.placeholder = 'Etichetta (facoltativa)'; name.value = location.name;
      name.setAttribute('aria-label', 'Etichetta del luogo');
      name.addEventListener('input', () => { location.name = name.value; summaryName.textContent = name.value || 'Luogo senza nome'; updateEye(); renderLabels(); save(); });
      const kind = document.createElement('select'); kind.className = 'location-kind'; kind.setAttribute('aria-label', `Simbolo di ${location.name || 'luogo'}`);
      for (const [value, title] of [['city', 'Città'], ['mountains', 'Monti'], ['forest', 'Foresta']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = title; kind.append(option);
      }
      kind.value = location.type;
      kind.addEventListener('change', () => { location.type = kind.value; summaryType.textContent = kind.selectedOptions[0].textContent; renderLabels(); save(); });
      top.append(name, kind);
      const sizes = document.createElement('div'); sizes.className = 'location-sizes';
      sizes.append(
        locationSizeControl(location, 'iconSize', 'Dimensione simbolo', 16, 120),
        locationSizeControl(location, 'labelSize', 'Dimensione etichetta', 10, 80)
      );
      const placement = document.createElement('label'); placement.className = 'location-placement'; placement.textContent = 'Etichetta rispetto al simbolo';
      const position = document.createElement('select'); position.className = 'location-position';
      position.setAttribute('aria-label', `Posizione dell'etichetta di ${location.name || 'luogo'}`);
      for (const [value, title] of [['top', 'Sopra'], ['bottom', 'Sotto'], ['right', 'Destra'], ['left', 'Sinistra']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = title; position.append(option);
      }
      position.value = location.labelPosition;
      position.addEventListener('change', () => { location.labelPosition = position.value; renderLabels(); save(); });
      placement.append(position);
      const offsets = document.createElement('div'); offsets.className = 'location-offsets';
      offsets.append(locationOffsetControl(location, 'labelOffsetX', 'Spostamento orizzontale'), locationOffsetControl(location, 'labelOffsetY', 'Spostamento verticale'));
      const labelActions = document.createElement('div'); labelActions.className = 'location-label-actions';
      const moveLabel = document.createElement('button'); moveLabel.type = 'button'; moveLabel.className = `location-place location-label-move${tool === 'location-label' && selectedLocationId === location.id ? ' active' : ''}`;
      moveLabel.textContent = 'Sposta etichetta sulla mappa'; moveLabel.disabled = !Number.isFinite(location.x);
      moveLabel.addEventListener('click', () => { selectedLocationId = location.id; project.locationsVisible = true; setTool('location-label'); renderLocationList(); renderLabels(); save(); });
      const resetOffset = document.createElement('button'); resetOffset.type = 'button'; resetOffset.className = 'text-button'; resetOffset.textContent = 'Azzera spostamento';
      resetOffset.addEventListener('click', () => { location.labelOffsetX = 0; location.labelOffsetY = 0; renderLocationList(); renderLabels(); save(); });
      labelActions.append(moveLabel, resetOffset);
      const bottom = document.createElement('div'); bottom.className = 'location-card-bottom';
      const place = document.createElement('button'); place.type = 'button'; place.className = 'location-place';
      place.textContent = Number.isFinite(location.x) ? 'Sposta' : 'Posiziona';
      place.addEventListener('click', () => { selectedLocationId = location.id; project.locationsVisible = true; setTool('location'); renderLocationList(); renderLabels(); save(); });
      const status = document.createElement('span'); status.className = 'location-status';
      status.textContent = Number.isFinite(location.x) ? 'Sulla mappa' : 'Da posizionare';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'location-delete';
      remove.textContent = 'Elimina'; remove.setAttribute('aria-label', `Elimina ${location.name || 'luogo'}`);
      remove.addEventListener('click', () => {
        project.locations = project.locations.filter(item => item.id !== location.id);
        if (selectedLocationId === location.id) { selectedLocationId = null; if (tool === 'location' || tool === 'location-label') setTool('brush'); }
        if (expandedLocationId === location.id) expandedLocationId = null;
        renderLocationList(); renderLabels(); save();
      });
      bottom.append(place, status, remove);
      details.append(top, sizes, placement, offsets, labelActions, bottom);
      card.append(details); locationList.append(card);
    }
  }
  function select(stateId) { selectedId = stateId; renderStates(); }
  function renderAll() {
    normalizeLocations();
    if (restoreMissingAreaLabels()) save();
    $('#show-all-labels').checked = project.labelsVisible;
    $('#show-portals').checked = project.portalsVisible;
    if ((tool === 'location' || tool === 'location-label') && !project.locations.some(item => item.id === selectedLocationId)) { selectedLocationId = null; setTool('brush'); }
    if (baseOwnerPixels) buildEditableBaseLayers();
    renderStates(); renderLocationList(); renderStrokes(); renderLabels();
    const hasMap = Boolean(project.map);
    stage.classList.toggle('has-map', hasMap); image.hidden = !hasMap;
    if (hasMap) {
      if (image.dataset.source !== project.map) { previewZoom = 1; previewPanX = 0; previewPanY = 0; image.dataset.source = project.map; currentOwnerPixels = null; image.src = project.map; landMask = null; landPixels = null; baseOwnerPixels = null; baseEdgePixels = null; baseEdgeLayer = null; preservedEdgeLayer = null; baseSourcePixels = null; neutralMapLayer = null; baseFillLayer = null; zoneMaskLayer = null; zoneBorderLayer = null; say('Calcolo confini…'); }
    } else { image.removeAttribute('src'); image.dataset.source = ''; previewZoom = 1; previewPanX = 0; previewPanY = 0; $('#zoom-level').textContent = '100%'; currentOwnerPixels = null; landMask = null; landPixels = null; baseOwnerPixels = null; baseEdgePixels = null; baseEdgeLayer = null; preservedEdgeLayer = null; baseSourcePixels = null; neutralMapLayer = null; baseFillLayer = null; zoneMaskLayer = null; zoneBorderLayer = null; }
    $('#canvas-label').textContent = project.mapName || 'Nessuna mappa caricata';
    $('#map-dimensions').textContent = hasMap ? `${project.width} × ${project.height} px` : 'In attesa di una mappa';
    if (hasMap) { fitCanvas(); if (image.complete && (!landMask || landMask.width !== project.width || landMask.height !== project.height)) { landMask = null; landPixels = null; say('Calcolo confini…'); buildLandMask(); } }
  }
  function addState(name = '', color) {
    const state = { id: id(), name: name || `Nuovo Stato ${project.states.length + 1}`, color: color || palette[project.states.length % palette.length], baseColor: null, code: Math.max(presetStates.length, ...project.states.map(item => item.code || 0)) + 1, showLabel: true };
    project.states.push(state); selectedId = state.id; renderStates(); save();
    if (!name) { const input = stateList.querySelector(`[data-id="${CSS.escape(state.id)}"] input`); input?.focus(); input?.select(); }
  }
  function addLocation() {
    const location = { id: id(), type: 'city', name: 'Nuova città', x: null, y: null, visible: true, iconSize: 44, labelSize: 24, labelPosition: 'bottom', labelOffsetX: 0, labelOffsetY: 0 };
    project.locations.push(location); selectedLocationId = location.id; expandedLocationId = location.id;
    project.locationsVisible = true; setTool('location'); renderLocationList(); renderLabels(); save();
    locationList.querySelector('.location-card:last-child .location-name')?.select();
  }
  function pos(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(project.width, (event.clientX - rect.left) * project.width / rect.width)), y: Math.max(0, Math.min(project.height, (event.clientY - rect.top) * project.height / rect.height)) };
  }
  function setTool(next) {
    tool = next; document.querySelectorAll('[data-tool]').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
    $('#tool-hint').textContent = tool === 'location' ? 'Clicca sulla mappa per posizionare o spostare il luogo selezionato.' : tool === 'location-label' ? 'Clicca sulla mappa per spostare solo l’etichetta del luogo selezionato.' : tool === 'label' ? 'Clicca sulla mappa per posizionare l’etichetta dello Stato selezionato.' : tool === 'erase' ? 'Cancella qualsiasi territorio, anche quello del preset: la gomma si ferma fuori dalla terra.' : 'Dipingi lo Stato selezionato: il tratto si ferma al bordo e riprende quando rientri.';
    canvas.style.cursor = tool === 'label' || tool === 'location' || tool === 'location-label' ? 'copy' : tool === 'erase' ? 'cell' : 'crosshair';
  }
  function exportImage() {
    if (!project.map) { alert('Carica prima la mappa di base.'); return; }
    const exportScale = project.width * project.height <= 8e6 ? 2 : 1;
    exportRegion({ x: 0, y: 0, width: project.width, height: project.height }, exportScale, 'letherel-mappa.png');
  }
  function areaExportBounds(state, marginPercent) {
    if (!currentOwnerPixels || !state || currentOwnerPixels.length !== project.width * project.height) return null;
    let minX = project.width, minY = project.height, maxX = -1, maxY = -1;
    for (let index = 0; index < currentOwnerPixels.length; index++) {
      if (currentOwnerPixels[index] !== state.code) continue;
      const x = index % project.width, y = (index / project.width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX < 0) return null;
    const padX = Math.max(24, Math.ceil((maxX - minX + 1) * marginPercent / 100));
    const padY = Math.max(24, Math.ceil((maxY - minY + 1) * marginPercent / 100));
    const x = Math.max(0, minX - padX), y = Math.max(0, minY - padY);
    return { x, y, width: Math.min(project.width, maxX + 1 + padX) - x, height: Math.min(project.height, maxY + 1 + padY) - y };
  }
  function areaExportChoice() {
    const state = project.states.find(item => item.id === $('#export-area-select').value);
    const bounds = areaExportBounds(state, Number($('#export-margin').value));
    if (!bounds) return null;
    const requestedScale = Number($('#export-zoom').value);
    // Limit memory use for very large territories while keeping the chosen zoom when possible.
    const scale = Math.min(requestedScale, Math.max(1, Math.floor(Math.sqrt(18e6 / (bounds.width * bounds.height)))));
    return { state, bounds, scale, requestedScale };
  }
  function updateAreaExportSummary() {
    $('#export-margin-value').textContent = `${$('#export-margin').value}%`;
    const choice = areaExportChoice();
    $('#confirm-advanced-export').disabled = !choice;
    $('#advanced-export-summary').textContent = !currentOwnerPixels ? 'Attendi il calcolo dei territori prima di esportare.'
      : !choice ? 'L’area selezionata non contiene territori visibili.'
        : `Ritaglio ${choice.bounds.width} × ${choice.bounds.height} px · PNG ${choice.bounds.width * choice.scale} × ${choice.bounds.height * choice.scale} px · zoom ${choice.scale}×${choice.scale < choice.requestedScale ? ' (limitato per le dimensioni del file)' : ''}.`;
  }
  function exportRegion(bounds, exportScale, filename) {
    if (!image.complete || !image.naturalWidth) { alert('Attendi il caricamento della mappa.'); return; }
    const { x, y, width, height } = bounds;
    const out = document.createElement('canvas'); out.width = width * exportScale; out.height = height * exportScale;
    const outCtx = out.getContext('2d');
    if (!outCtx) { alert('Il ritaglio è troppo grande per il browser.'); return; }
    // Smooth enlarged raster artwork; text and symbols are still drawn from SVG at export resolution.
    outCtx.imageSmoothingEnabled = filename !== 'letherel-mappa.png' && exportScale > 2;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(image, x, y, width, height, 0, 0, out.width, out.height);
    outCtx.drawImage(canvas, x, y, width, height, 0, 0, out.width, out.height);
    const labelScale = exportScale >= 3 ? exportScale
      : Math.max(exportScale, Math.min(3, Math.floor(Math.sqrt(32e6 / (width * height)))));
    const exportLabels = labelsLayer.cloneNode(true);
    exportLabels.removeAttribute('style');
    exportLabels.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    exportLabels.setAttribute('width', String(width * labelScale));
    exportLabels.setAttribute('height', String(height * labelScale));
    const svg = new XMLSerializer().serializeToString(exportLabels);
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const labelImage = new Image();
    labelImage.onload = () => {
      if (labelScale > exportScale) {
        const sharpLabels = document.createElement('canvas');
        sharpLabels.width = width * labelScale; sharpLabels.height = height * labelScale;
        sharpLabels.getContext('2d').drawImage(labelImage, 0, 0);
        outCtx.imageSmoothingEnabled = true; outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(sharpLabels, 0, 0, out.width, out.height);
      } else outCtx.drawImage(labelImage, 0, 0, out.width, out.height);
      URL.revokeObjectURL(svgUrl);
      out.toBlob(blob => blob ? download(blob, filename) : alert('Impossibile creare il PNG a questa risoluzione.'), 'image/png');
    };
    labelImage.onerror = () => { URL.revokeObjectURL(svgUrl); alert('Non è stato possibile esportare le etichette.'); };
    labelImage.src = svgUrl;
  }
  $('#add-state').addEventListener('click', () => { $('#state-name').value = ''; $('#state-dialog').showModal(); $('#state-name').focus(); });
  $('#state-form').addEventListener('submit', event => { if (event.submitter?.value === 'cancel') return; event.preventDefault(); const name = $('#state-name').value.trim(); if (!name) return; addState(name, $('#state-color').value); $('#state-dialog').close(); });
  $('#add-location').addEventListener('click', addLocation);
  $('#show-locations').addEventListener('change', event => { project.locationsVisible = event.target.checked; renderLabels(); save(); });
  $('#show-all-labels').addEventListener('change', event => { project.labelsVisible = event.target.checked; renderLabels(); save(); });
  $('#show-portals').addEventListener('change', event => { project.portalsVisible = event.target.checked; renderLabels(); save(); });
  document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
  $('#brush-size').addEventListener('input', event => { $('#brush-value').textContent = `${event.target.value} px`; });
  $('#roughness').addEventListener('input', event => { $('#roughness-value').textContent = `${event.target.value}%`; });
  canvas.addEventListener('pointerdown', event => {
    if (!project.map || event.button !== 0 || spaceHeld || panMode) return;
    if (tool === 'location-label') {
      const location = project.locations.find(item => item.id === selectedLocationId);
      if (!location || !Number.isFinite(location.x) || !Number.isFinite(location.y)) { say('Posiziona prima il luogo sulla mappa'); return; }
      const point = pos(event), layout = locationLabelLayout(location);
      location.labelOffsetX = Math.max(-400, Math.min(400, Math.round(point.x - location.x - layout.x)));
      location.labelOffsetY = Math.max(-400, Math.min(400, Math.round(point.y - location.y - layout.y)));
      renderLocationList(); renderLabels(); save(); return;
    }
    if (tool === 'location') {
      const location = project.locations.find(item => item.id === selectedLocationId);
      if (!location) { say('Seleziona un luogo da posizionare'); return; }
      const point = pos(event); location.x = point.x; location.y = point.y;
      renderLocationList(); renderLabels(); save(); return;
    }
    if (tool === 'label') { const state = selectedState(); if (!state) { alert('Crea o seleziona uno Stato prima di aggiungere un’etichetta.'); return; } const point = pos(event); const label = project.labels.find(item => item.stateId === state.id); if (label) { label.x = point.x; label.y = point.y; } else project.labels.push({ stateId: state.id, ...point }); renderLabels(); save(); return; }
    if (tool === 'brush' && !selectedState()) { alert('Crea o seleziona uno Stato prima di dipingere.'); return; }
    const point = pos(event);
    if (!isLand(point)) { if (!landPixels) say('Attendi il calcolo dei confini della mappa'); return; }
    drawing = true; canvas.setPointerCapture(event.pointerId); activeStroke = { stateId: tool === 'erase' ? null : selectedId, tool: tool === 'erase' ? 'erase' : 'brush', color: selectedState()?.color || '#000', size: Number($('#brush-size').value), roughness: Number($('#roughness').value) / 100, seed: Math.floor(Math.random() * 2147483647), segments: [[point]], outside: false }; project.strokes.push(activeStroke); renderStrokes();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drawing || !activeStroke) return;
    const from = activeStroke.segments.at(-1).at(-1), to = pos(event);
    const distance = Math.hypot(to.x - from.x, to.y - from.y), steps = Math.max(1, Math.ceil(distance / 3));
    for (let step = 1; step <= steps; step++) {
      const point = { x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps };
      if (isLand(point)) {
        if (activeStroke.outside) { activeStroke.segments.push([point]); activeStroke.outside = false; }
        else activeStroke.segments.at(-1).push(point);
      } else activeStroke.outside = true;
    }
    renderStrokes();
  });
  const finishStroke = () => { if (!drawing) return; drawing = false; activeStroke = null; renderStrokes(); renderStates(); save(); };
  canvas.addEventListener('pointerup', finishStroke); canvas.addEventListener('pointercancel', finishStroke);
  $('#undo').addEventListener('click', () => { if (!project.strokes.length) return; project.strokes.pop(); renderStates(); renderStrokes(); save(); });
  $('#clear-state').addEventListener('click', () => { if (!selectedId) { alert('Seleziona uno Stato.'); return; } const name = selectedState().name; if (!confirm(`Cancellare tutte le pennellate di “${name}”?`)) return; project.strokes = project.strokes.filter(stroke => stroke.tool === 'erase' || stroke.stateId !== selectedId); renderStates(); renderStrokes(); save(); });
  $('#map-upload').addEventListener('change', event => { const file = event.target.files?.[0]; if (!file) return; if ((project.strokes.length || project.labels.length || project.locations.length) && !confirm('Caricare una nuova immagine e cancellare pennellate, etichette e luoghi?')) { event.target.value = ''; return; } const reader = new FileReader(); reader.onload = () => { const probe = new Image(); probe.onload = () => { project.map = reader.result; project.mapName = file.name; project.width = probe.naturalWidth; project.height = probe.naturalHeight; project.strokes = []; project.labels = []; project.locations = []; selectedLocationId = null; renderAll(); save(); }; probe.src = reader.result; }; reader.readAsDataURL(file); event.target.value = ''; });
  $('#remove-map').addEventListener('click', () => { if (!project.map || !confirm('Rimuovere la mappa di base e azzerare pennellate, etichette e luoghi? Gli Stati resteranno nel progetto.')) return; project.map = ''; project.mapName = ''; project.width = 0; project.height = 0; project.strokes = []; project.labels = []; project.locations = []; selectedLocationId = null; renderAll(); save(); });
  $('#reset-project').addEventListener('click', () => { if (!confirm('Ripristinare il preset originale di Letherel? Le modifiche correnti verranno cancellate.')) return; project = createPreset(); selectedId = project.states[0]?.id || null; renderAll(); save(); });
  $('#save-project').addEventListener('click', () => exportProject(project)); $('#export-image').addEventListener('click', exportImage);
  $('#advanced-export').addEventListener('click', () => {
    if (!project.map) { alert('Carica prima la mappa di base.'); return; }
    const select = $('#export-area-select');
    select.replaceChildren();
    for (const state of project.states) {
      const option = document.createElement('option'); option.value = state.id; option.textContent = state.name;
      select.append(option);
    }
    if (selectedId && project.states.some(state => state.id === selectedId)) select.value = selectedId;
    updateAreaExportSummary();
    $('#advanced-export-dialog').showModal();
  });
  for (const id of ['export-area-select', 'export-zoom', 'export-margin']) {
    $(`#${id}`).addEventListener('input', updateAreaExportSummary);
  }
  $('#cancel-advanced-export').addEventListener('click', () => $('#advanced-export-dialog').close());
  $('#confirm-advanced-export').addEventListener('click', () => {
    const choice = areaExportChoice();
    if (!choice) { updateAreaExportSummary(); return; }
    const slug = choice.state.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'area';
    $('#advanced-export-dialog').close();
    exportRegion(choice.bounds, choice.scale, `letherel-${slug}-${choice.scale}x.png`);
  });
  function zoomFromCenter(factor) {
    const rect = stage.getBoundingClientRect();
    zoomPreview(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  $('#zoom-in').addEventListener('click', () => zoomFromCenter(1.25));
  $('#zoom-out').addEventListener('click', () => zoomFromCenter(1 / 1.25));
  $('#zoom-reset').addEventListener('click', () => { previewZoom = 1; previewPanX = 0; previewPanY = 0; applyViewport(); });
  $('#zoom-pan').addEventListener('click', () => {
    panMode = !panMode;
    $('#zoom-pan').classList.toggle('active', panMode);
    $('#zoom-pan').setAttribute('aria-pressed', String(panMode));
    stage.classList.toggle('panning-ready', panMode || spaceHeld);
  });
  stage.addEventListener('wheel', event => {
    if (!project.map) return;
    event.preventDefault();
    zoomPreview(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY);
  }, { passive: false });
  stage.addEventListener('pointerdown', event => {
    if (!project.map || !(event.button === 1 || ((spaceHeld || panMode) && event.button === 0))) return;
    event.preventDefault();
    panPointerId = event.pointerId; panLastX = event.clientX; panLastY = event.clientY;
    stage.classList.add('panning'); stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (panPointerId !== event.pointerId) return;
    previewPanX += event.clientX - panLastX; previewPanY += event.clientY - panLastY;
    panLastX = event.clientX; panLastY = event.clientY;
    applyViewport();
  });
  const finishPan = event => {
    if (panPointerId !== event.pointerId) return;
    panPointerId = null; stage.classList.remove('panning');
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  };
  stage.addEventListener('pointerup', finishPan);
  stage.addEventListener('pointercancel', finishPan);
  stage.addEventListener('lostpointercapture', finishPan);
  window.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.target.closest?.('input,select,textarea,button,[contenteditable]')) return;
    event.preventDefault(); spaceHeld = true; stage.classList.add('panning-ready');
  });
  window.addEventListener('keyup', event => {
    if (event.code !== 'Space') return;
    spaceHeld = false; stage.classList.toggle('panning-ready', panMode);
  });
  window.addEventListener('blur', () => { spaceHeld = false; stage.classList.toggle('panning-ready', panMode); });
  $('#open-project').addEventListener('click', () => $('#project-upload').click());
  $('#project-upload').addEventListener('change', event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { project = parseProject(reader.result); normalizeStateColors(); selectedId = project.states[0]?.id || null; renderAll(); save(); } catch { alert('Il file non è un progetto Mapmaker valido.'); } }; reader.readAsText(file); event.target.value = ''; });
  window.addEventListener('resize', fitCanvas);
  image.addEventListener('load', () => {
    // Older projects can have the blue dots baked into their uploaded image.
    // Restore the clean image embedded in Base-Map.json; keep their edits and layer settings.
    if (hasBakedPortals()) {
      if (project.width > 0 && project.height > 0 && (project.width !== 2340 || project.height !== 1312)) {
        const scaleX = 2340 / project.width, scaleY = 1312 / project.height;
        const scale = Math.min(scaleX, scaleY);
        for (const stroke of project.strokes) {
          if (Number.isFinite(stroke.size)) stroke.size *= scale;
          for (const segment of stroke.segments || []) for (const point of segment) {
            point.x *= scaleX; point.y *= scaleY;
          }
        }
        for (const label of project.labels) {
          label.x *= scaleX; label.y *= scaleY;
          if (Number.isFinite(label.size)) label.size *= scale;
          if (Number.isFinite(label.width)) label.width *= scaleX;
          if (Number.isFinite(label.curve)) label.curve *= scaleY;
        }
        for (const location of project.locations || []) {
          if (Number.isFinite(location.x)) location.x *= scaleX;
          if (Number.isFinite(location.y)) location.y *= scaleY;
          if (Number.isFinite(location.iconSize)) location.iconSize *= scale;
          if (Number.isFinite(location.labelSize)) location.labelSize *= scale;
          if (Number.isFinite(location.labelOffsetX)) location.labelOffsetX *= scaleX;
          if (Number.isFinite(location.labelOffsetY)) location.labelOffsetY *= scaleY;
        }
        project.width = 2340; project.height = 1312;
      }
      project.map = BASE_MAP;
      currentOwnerPixels = null;
      project.mapName = 'Letherel · Stati e confini';
      restoreMissingAreaLabels();
      $('#canvas-label').textContent = project.mapName;
      $('#map-dimensions').textContent = `${project.width} × ${project.height} px`;
      image.dataset.source = BASE_MAP;
      image.src = BASE_MAP;
      save();
      return;
    }
    currentOwnerPixels = null; landMask = null; landPixels = null; baseOwnerPixels = null; baseEdgePixels = null; baseEdgeLayer = null; preservedEdgeLayer = null; baseSourcePixels = null; neutralMapLayer = null; baseFillLayer = null; zoneMaskLayer = null; zoneBorderLayer = null;
    say('Calcolo confini…'); buildLandMask(); fitCanvas();
  });
  neutralImage.addEventListener('load', () => { if (baseOwnerPixels && project.map === BASE_MAP) { buildEditableBaseLayers(); renderStrokes(); } });
  window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $('#undo').click(); } });
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.states && saved?.strokes && saved?.labels && (saved.states.length > 0 || saved.map)) {
      project = saved; if (project.map === './assets/territori-base.png') project.map = BASE_MAP;
      normalizeStateColors();
      selectedId = project.states[0]?.id || null;
    }
  } catch { /* archivio locale non leggibile: usa il preset base */ }
  renderAll();
})();
