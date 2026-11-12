(() => {
  const $ = selector => document.querySelector(selector);
  const stage = $('#map-stage'), image = $('#map-image'), canvas = $('#paint-layer'), ctx = canvas.getContext('2d');
  const { isSeaPixel, colorParts, randomAt, strokeSegments } = window.LetherelMapmakerGeometry;
  const { presetStates, legacyPresetColors } = window.LETHEREL_MAPMAKER_PRESET;
  const { download, exportProject, parseProject } = window.LetherelMapmakerFiles;
  const paintCanvas = document.createElement('canvas'), paintCtx = paintCanvas.getContext('2d');
  const paintHistoryCanvas = document.createElement('canvas'), paintHistoryCtx = paintHistoryCanvas.getContext('2d');
  const eraseCanvas = document.createElement('canvas'), eraseCtx = eraseCanvas.getContext('2d');
  const basePaintCanvas = document.createElement('canvas'), basePaintCtx = basePaintCanvas.getContext('2d');
  const stateList = $('#state-list'), labelsLayer = $('#labels-layer');
  const STORAGE_KEY = 'letherel-mapmaker-v1';
  const STATE_OPACITY = .7;
  const palette = ['#e89092','#ab84db','#85d887','#d3b975','#83b7e8','#d68aca','#7acfc6','#dfa866','#98c8ec','#c39bd3'];
  const BASE_MAP = window.LETHEREL_BASE_MAP_DATA || './assets/territori-base.png';
  const neutralImage = new Image();
  neutralImage.src = window.LETHEREL_NEUTRAL_MAP_DATA || './assets/territori-neutral.png';
  function createPreset() {
    const width = 2340, height = 1312;
    return {
      map: BASE_MAP, mapName: 'Letherel · Stati e confini', width, height,
      states: presetStates.map(([key, name, color], index) => ({ id: `base-${key}`, name, color, baseColor: color, code: index + 1, showLabel: true })),
      strokes: [], labels: presetStates.map(([key, , , x, y, size, rotation, labelWidth, curve]) => ({ stateId: `base-${key}`, x: x * width, y: y * height, size, rotation, width: labelWidth, curve }))
    };
  }
  let project = createPreset();
  let selectedId = project.states[0]?.id || null, tool = 'brush', drawing = false, activeStroke = null, landMask = null, landPixels = null, baseOwnerPixels = null, baseEdgePixels = null, baseEdgeLayer = null, preservedEdgeLayer = null, baseSourcePixels = null, neutralMapLayer = null, baseFillLayer = null, zoneMaskLayer = null, zoneBorderLayer = null;

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
  function say(text) { $('#save-status').textContent = text; }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); say('Salvato automaticamente'); }
    catch { say('Esporta il progetto per salvarne una copia'); }
  }
  function fitCanvas() {
    if (!project.width || !project.height) return;
    const rect = stage.getBoundingClientRect();
    const scale = Math.min(rect.width / project.width, rect.height / project.height);
    const width = Math.max(1, Math.round(project.width * scale)), height = Math.max(1, Math.round(project.height * scale));
    canvas.width = project.width; canvas.height = project.height;
    paintCanvas.width = project.width; paintCanvas.height = project.height;
    paintHistoryCanvas.width = project.width; paintHistoryCanvas.height = project.height;
    eraseCanvas.width = project.width; eraseCanvas.height = project.height;
    basePaintCanvas.width = project.width; basePaintCanvas.height = project.height;
    image.style.width = `${width}px`; image.style.height = `${height}px`;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvas.style.left = `calc(50% - ${width / 2}px)`; canvas.style.top = `calc(50% - ${height / 2}px)`;
    labelsLayer.style.width = `${width}px`; labelsLayer.style.height = `${height}px`;
    labelsLayer.style.left = `calc(50% - ${width / 2}px)`; labelsLayer.style.top = `calc(50% - ${height / 2}px)`;
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
    const presetNeutralReady = project.map === BASE_MAP && neutralImage.complete && neutralImage.naturalWidth === 2324;
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
    if (!paintCanvas.width || !paintCanvas.height || !landPixels || !baseOwnerPixels || !baseEdgePixels) { zoneMaskLayer = null; zoneBorderLayer = null; return; }
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
    for (const label of project.labels) {
      const state = project.states.find(item => item.id === label.stateId);
      if (!state || !state.showLabel) continue;
      const preset = state.id.startsWith('base-') && presetStates.find(([key]) => state.id === `base-${key}`);
      const usePresetStyle = Boolean(preset && label.width == null);
      const width = Math.min(label.width || preset?.[7] || 220, project.width * .4);
      const curve = label.curve ?? preset?.[8] ?? 0;
      const fontSize = usePresetStyle ? preset[5] : label.size || preset?.[5] || 28;
      const id = `label-path-${label.stateId.replace(/[^a-z0-9_-]/gi, '-')}`;
      const startX = label.x - width / 2, endX = label.x + width / 2, endY = label.y + curve / 2;
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.id = id; path.setAttribute('d', `M ${startX} ${endY} Q ${label.x} ${label.y - curve} ${endX} ${endY}`); defs.append(path);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('font-family', '"Old English Text MT", "UnifrakturMaguntia", "Palatino Linotype", serif');
      text.setAttribute('font-size', String(fontSize)); text.setAttribute('font-weight', '600');
      text.setAttribute('fill', '#26313a'); text.setAttribute('fill-opacity', '.86');
      text.setAttribute('stroke', '#f2f4ed'); text.setAttribute('stroke-opacity', '.56');
      text.setAttribute('stroke-width', '2.5'); text.setAttribute('stroke-linejoin', 'round'); text.setAttribute('paint-order', 'stroke');
      text.setAttribute('letter-spacing', '.35'); text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
      const textPath = document.createElementNS('http://www.w3.org/2000/svg', 'textPath');
      textPath.setAttribute('href', `#${id}`); textPath.setAttribute('startOffset', '50%');
      textPath.setAttribute('textLength', String(width)); textPath.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      textPath.textContent = state.name || 'Stato'; text.append(textPath); labelsLayer.append(defs, text);
    }
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
  function select(stateId) { selectedId = stateId; renderStates(); }
  function renderAll() {
    if (baseOwnerPixels) buildEditableBaseLayers();
    renderStates(); renderStrokes(); renderLabels();
    const hasMap = Boolean(project.map);
    stage.classList.toggle('has-map', hasMap); image.hidden = !hasMap;
    if (hasMap) {
      if (image.dataset.source !== project.map) { image.dataset.source = project.map; image.src = project.map; landMask = null; landPixels = null; baseOwnerPixels = null; baseEdgePixels = null; baseEdgeLayer = null; preservedEdgeLayer = null; baseSourcePixels = null; neutralMapLayer = null; baseFillLayer = null; zoneMaskLayer = null; zoneBorderLayer = null; say('Calcolo confini…'); }
    } else { image.removeAttribute('src'); image.dataset.source = ''; landMask = null; landPixels = null; baseOwnerPixels = null; baseEdgePixels = null; baseEdgeLayer = null; preservedEdgeLayer = null; baseSourcePixels = null; neutralMapLayer = null; baseFillLayer = null; zoneMaskLayer = null; zoneBorderLayer = null; }
    $('#canvas-label').textContent = project.mapName || 'Nessuna mappa caricata';
    $('#map-dimensions').textContent = hasMap ? `${project.width} × ${project.height} px` : 'In attesa di una mappa';
    if (hasMap) { fitCanvas(); if (image.complete && (!landMask || landMask.width !== project.width || landMask.height !== project.height)) { landMask = null; landPixels = null; say('Calcolo confini…'); buildLandMask(); } }
  }
  function addState(name = '', color) {
    const state = { id: id(), name: name || `Nuovo Stato ${project.states.length + 1}`, color: color || palette[project.states.length % palette.length], baseColor: null, code: Math.max(presetStates.length, ...project.states.map(item => item.code || 0)) + 1, showLabel: true };
    project.states.push(state); selectedId = state.id; renderStates(); save();
    if (!name) { const input = stateList.querySelector(`[data-id="${CSS.escape(state.id)}"] input`); input?.focus(); input?.select(); }
  }
  function pos(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(project.width, (event.clientX - rect.left) * project.width / rect.width)), y: Math.max(0, Math.min(project.height, (event.clientY - rect.top) * project.height / rect.height)) };
  }
  function setTool(next) {
    tool = next; document.querySelectorAll('[data-tool]').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
    $('#tool-hint').textContent = tool === 'label' ? 'Clicca sulla mappa per posizionare l’etichetta dello Stato selezionato.' : tool === 'erase' ? 'Cancella qualsiasi territorio, anche quello del preset: la gomma si ferma fuori dalla terra.' : 'Dipingi lo Stato selezionato: il tratto si ferma al bordo e riprende quando rientri.';
    canvas.style.cursor = tool === 'label' ? 'copy' : tool === 'erase' ? 'cell' : 'crosshair';
  }
  function exportImage() {
    if (!project.map) { alert('Carica prima la mappa di base.'); return; }
    const out = document.createElement('canvas'); out.width = project.width; out.height = project.height; const outCtx = out.getContext('2d');
    outCtx.drawImage(image, 0, 0, project.width, project.height); outCtx.drawImage(canvas, 0, 0);
    const svg = new XMLSerializer().serializeToString(labelsLayer);
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const labelImage = new Image();
    labelImage.onload = () => {
      outCtx.drawImage(labelImage, 0, 0, project.width, project.height); URL.revokeObjectURL(svgUrl);
      out.toBlob(blob => blob && download(blob, 'letherel-mappa.png'), 'image/png');
    };
    labelImage.onerror = () => { URL.revokeObjectURL(svgUrl); alert('Non è stato possibile esportare le etichette.'); };
    labelImage.src = svgUrl;
  }
  $('#add-state').addEventListener('click', () => { $('#state-name').value = ''; $('#state-dialog').showModal(); $('#state-name').focus(); });
  $('#state-form').addEventListener('submit', event => { if (event.submitter?.value === 'cancel') return; event.preventDefault(); const name = $('#state-name').value.trim(); if (!name) return; addState(name, $('#state-color').value); $('#state-dialog').close(); });
  document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
  $('#brush-size').addEventListener('input', event => { $('#brush-value').textContent = `${event.target.value} px`; });
  $('#roughness').addEventListener('input', event => { $('#roughness-value').textContent = `${event.target.value}%`; });
  canvas.addEventListener('pointerdown', event => {
    if (!project.map) return;
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
  $('#map-upload').addEventListener('change', event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const probe = new Image(); probe.onload = () => { project.map = reader.result; project.mapName = file.name; project.width = probe.naturalWidth; project.height = probe.naturalHeight; project.strokes = []; project.labels = []; renderAll(); save(); }; probe.src = reader.result; }; reader.readAsDataURL(file); event.target.value = ''; });
  $('#remove-map').addEventListener('click', () => { if (!project.map || !confirm('Rimuovere la mappa di base e azzerare pennellate ed etichette? Gli Stati resteranno nel progetto.')) return; project.map = ''; project.mapName = ''; project.width = 0; project.height = 0; project.strokes = []; project.labels = []; renderAll(); save(); });
  $('#reset-project').addEventListener('click', () => { if (!confirm('Ripristinare il preset originale di Letherel? Le modifiche correnti verranno cancellate.')) return; project = createPreset(); selectedId = project.states[0]?.id || null; renderAll(); save(); });
  $('#save-project').addEventListener('click', () => exportProject(project)); $('#export-image').addEventListener('click', exportImage);
  $('#open-project').addEventListener('click', () => $('#project-upload').click());
  $('#project-upload').addEventListener('change', event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { project = parseProject(reader.result); normalizeStateColors(); selectedId = project.states[0]?.id || null; renderAll(); save(); } catch { alert('Il file non è un progetto Mapmaker valido.'); } }; reader.readAsText(file); event.target.value = ''; });
  window.addEventListener('resize', fitCanvas);
  image.addEventListener('load', () => { landMask = null; landPixels = null; baseOwnerPixels = null; baseEdgePixels = null; baseEdgeLayer = null; preservedEdgeLayer = null; baseSourcePixels = null; neutralMapLayer = null; baseFillLayer = null; zoneMaskLayer = null; zoneBorderLayer = null; say('Calcolo confini…'); buildLandMask(); fitCanvas(); });
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
