(() => {
  const $ = selector => document.querySelector(selector);
  const stage = $('#map-stage'), image = $('#map-image'), canvas = $('#paint-layer'), ctx = canvas.getContext('2d');
  const paintCanvas = document.createElement('canvas'), paintCtx = paintCanvas.getContext('2d');
  const underpaintCanvas = document.createElement('canvas'), underpaintCtx = underpaintCanvas.getContext('2d');
  const stateList = $('#state-list'), labelsLayer = $('#labels-layer');
  const STORAGE_KEY = 'letherel-mapmaker-v1';
  const palette = ['#e89092','#ab84db','#85d887','#d3b975','#83b7e8','#d68aca','#7acfc6','#dfa866','#98c8ec','#c39bd3'];
  const BASE_MAP = window.LETHEREL_BASE_MAP_DATA || './assets/territori-base.png';
  const presetStates = [
    ['igglopolt','Casata Igglopolt','#ef9da5',.121,.352,48,0], ['likari','Casata Likari','#a780d4',.248,.289,34,0],
    ['gray','Casata Gray','#d1d9da',.307,.362,31,12], ['dalinar','Casata Dalinar','#999d9d',.379,.318,39,-8],
    ['tusk','Casata Tusk','#e7878b',.339,.49,56,-43], ['sewerly','Casata Sewerly','#ba7bda',.122,.576,58,48],
    ['tikle','Casata Tikle','#86d985',.196,.548,45,0], ['barlon','Casata Barlon','#b7b589',.255,.657,43,-10],
    ['galvant','Casata Galvànt','#f2d17c',.197,.761,36,22], ['alaven','Casata Alaven','#99b1ed',.58,.573,43,0],
    ['revachol','Casata Revachòl','#cda2d7',.688,.423,61,0], ['whiteflower','Casata Whiteflower','#75cae0',.712,.193,46,-17],
    ['allomance','Casata Allomance','#aa8694',.852,.341,44,0], ['lavender','Casata Lavender','#80788b',.769,.529,31,0],
    ['brightforge','Casata Brightforge','#e9c184',.853,.512,31,0], ['pages','Casata Pages','#78d7c6',.663,.67,25,0],
    ['mankos','Casata Mankos','#c9b19a',.755,.734,36,0], ['obsidian','Casata Obsidian','#d1e99c',.594,.747,42,-9],
    ['falkner','Casata Falkner','#d87dc6',.658,.833,39,8], ['confraternita','La Confraternita','#dfbd78',.127,.484,19,0]
  ];
  function createPreset() {
    const width = 2340, height = 1312;
    return {
      map: BASE_MAP, mapName: 'Letherel · Stati e confini', width, height,
      states: presetStates.map(([key, name, color], index) => ({ id: `base-${key}`, name, color, baseColor: color, code: index + 1, showLabel: true })),
      strokes: [], labels: presetStates.map(([key, , , x, y, size, rotation]) => ({ stateId: `base-${key}`, x: x * width, y: y * height, size, rotation }))
    };
  }
  let project = createPreset();
  let selectedId = project.states[0]?.id || null, tool = 'brush', drawing = false, activeStroke = null, landMask = null, landPixels = null, baseOwnerPixels = null, baseEdgePixels = null, cleanMapPixels = null, cleanMapLayer = null, zoneMaskLayer = null, zoneBorderLayer = null;

  function id() { return `state-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
  function selectedState() { return project.states.find(state => state.id === selectedId); }
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
    underpaintCanvas.width = project.width; underpaintCanvas.height = project.height;
    image.style.width = `${width}px`; image.style.height = `${height}px`;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvas.style.left = `calc(50% - ${width / 2}px)`; canvas.style.top = `calc(50% - ${height / 2}px)`;
    labelsLayer.style.width = `${width}px`; labelsLayer.style.height = `${height}px`;
    labelsLayer.style.left = `calc(50% - ${width / 2}px)`; labelsLayer.style.top = `calc(50% - ${height / 2}px)`;
    renderStrokes(); renderLabels();
  }
  function isSeaPixel(data, index) {
    return Math.abs(data[index] - 180) + Math.abs(data[index + 1] - 210) + Math.abs(data[index + 2] - 243) < 39;
  }
  function colorParts(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  function buildBaseOwnerLookup() {
    const paletteColors = project.states.filter(state => state.baseColor).map(state => ({ code: state.code, rgb: colorParts(state.baseColor) }));
    const lookup = new Uint8Array(32 * 32 * 32);
    for (let red = 0; red < 32; red++) for (let green = 0; green < 32; green++) for (let blue = 0; blue < 32; blue++) {
      const rgb = [red * 8 + 4, green * 8 + 4, blue * 8 + 4]; let nearest = 0, distance = Infinity;
      for (const state of paletteColors) {
        const current = Math.abs(rgb[0] - state.rgb[0]) + Math.abs(rgb[1] - state.rgb[1]) + Math.abs(rgb[2] - state.rgb[2]);
        if (current < distance) { distance = current; nearest = state.code; }
      }
      if (distance <= 78) lookup[(red << 10) | (green << 5) | blue] = nearest;
    }
    return lookup;
  }
  function buildLandMask() {
    if (!project.width || !project.height || !image.complete || !image.naturalWidth) return;
    const source = document.createElement('canvas'); source.width = project.width; source.height = project.height;
    const sourceContext = source.getContext('2d', { willReadFrequently: true }); sourceContext.drawImage(image, 0, 0, project.width, project.height);
    const pixels = sourceContext.getImageData(0, 0, project.width, project.height).data;
    const total = project.width * project.height, sea = new Uint8Array(total);
    for (let index = 0; index < total; index++) sea[index] = isSeaPixel(pixels, index * 4) ? 1 : 0;
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
    // Classify the original territories after inpainting their dark outlines.
    baseOwnerPixels = new Uint8Array(total); baseEdgePixels = darkLines;
    for (let index = 0; index < total; index++) {
      if (sea[index]) continue;
      const offset = index * 4;
      baseOwnerPixels[index] = ownerLookup[(cleanPixels[offset] >> 3 << 10) | (cleanPixels[offset + 1] >> 3 << 5) | (cleanPixels[offset + 2] >> 3)];
    }
    cleanMapPixels = cleanPixels;
    cleanMapLayer = document.createElement('canvas'); cleanMapLayer.width = project.width; cleanMapLayer.height = project.height;
    cleanMapLayer.getContext('2d').putImageData(new ImageData(cleanPixels, project.width, project.height), 0, 0);
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
  function randomAt(seed, stamp, vertex) {
    let value = (seed + Math.imul(stamp + 1, 374761393) + Math.imul(vertex + 1, 668265263)) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }
  function strokeSegments(stroke) { return stroke.segments || (stroke.points ? [stroke.points] : []); }
  function buildZoneBorder() {
    if (!paintCanvas.width || !paintCanvas.height || !cleanMapPixels || !landPixels || !baseOwnerPixels || !baseEdgePixels) { zoneMaskLayer = null; zoneBorderLayer = null; return; }
    const width = paintCanvas.width, height = paintCanvas.height, pixels = paintCtx.getImageData(0, 0, width, height).data;
    const total = width * height, region = new Uint8Array(total), colorCodes = new Map();
    for (const state of project.states) { const [red, green, blue] = colorParts(state.color); colorCodes.set((red << 16) | (green << 8) | blue, state.code); }
    for (let index = 0; index < total; index++) {
      const offset = index * 4; if (pixels[offset + 3] <= 127) continue;
      const paintCode = colorCodes.get((pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]) || 255;
      const sameBaseState = paintCode === baseOwnerPixels[index];
      if (sameBaseState && !baseEdgePixels[index]) continue;
      if (baseEdgePixels[index]) {
        let touchesOwnState = sameBaseState, paintsAcrossEdge = false;
        for (let dy = -2; dy <= 2 && !(touchesOwnState && paintsAcrossEdge); dy++) for (let dx = -2; dx <= 2; dx++) {
          const x = index % width + dx, y = ((index / width) | 0) + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const neighbor = y * width + x, neighborOffset = neighbor * 4;
          if (baseOwnerPixels[neighbor] === paintCode) touchesOwnState = true;
          else if (pixels[neighborOffset + 3] > 127 && colorCodes.get((pixels[neighborOffset] << 16) | (pixels[neighborOffset + 1] << 8) | pixels[neighborOffset + 2]) === paintCode) paintsAcrossEdge = true;
          if (touchesOwnState && paintsAcrossEdge) break;
        }
        if ((sameBaseState || touchesOwnState) && !paintsAcrossEdge) continue;
      }
      region[index] = paintCode;
    }
    zoneMaskLayer = document.createElement('canvas'); zoneMaskLayer.width = width; zoneMaskLayer.height = height;
    const zoneMaskContext = zoneMaskLayer.getContext('2d'), maskPixels = zoneMaskContext.createImageData(width, height);
    for (let index = 0; index < total; index++) if (region[index]) maskPixels.data[index * 4 + 3] = pixels[index * 4 + 3];
    zoneMaskContext.putImageData(maskPixels, 0, 0);
    zoneBorderLayer = document.createElement('canvas'); zoneBorderLayer.width = width; zoneBorderLayer.height = height;
    const borderContext = zoneBorderLayer.getContext('2d'), output = borderContext.createImageData(width, height), border = new Uint8Array(total);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!region[index] && landPixels?.[index] && !baseEdgePixels?.[index] && (region[index - 1] || region[index + 1] || region[index - width] || region[index + width])) border[index] = 1;
    }
    // Keep a single extra pixel outside the fill for the same thin outline as the source map.
    const expanded = new Uint8Array(total);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!border[index]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const neighbor = (y + dy) * width + x + dx;
        if (landPixels?.[neighbor] && !region[neighbor]) expanded[neighbor] = 1;
      }
    }
    for (let index = 0; index < total; index++) if (border[index] || expanded[index]) {
      const offset = index * 4; output.data[offset] = 20; output.data[offset + 1] = 29; output.data[offset + 2] = 31; output.data[offset + 3] = 235;
    }
    borderContext.putImageData(output, 0, 0);
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
    const roughness = Math.max(0, Math.min(1, stroke.roughness ?? .35)), vertices = 28, seed = (stroke.seed || 1) + segmentIndex * 1009;
    target.beginPath();
    centers.forEach((center, stamp) => {
      for (let vertex = 0; vertex < vertices; vertex++) {
        const angle = vertex / vertices * Math.PI * 2;
        const jitter = (randomAt(seed, stamp, vertex) * 2 - 1) * roughness * .68;
        const radius = stroke.size * .5 * (1 + jitter), x = center.x + Math.cos(angle) * radius, y = center.y + Math.sin(angle) * radius;
        if (vertex === 0) target.moveTo(x, y); else target.lineTo(x, y);
      }
      target.closePath();
    });
    target.fillStyle = stroke.color; target.fill();
    });
  }
  function renderStrokes() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    for (const stroke of project.strokes) {
      if (stroke.tool === 'erase') {
        paintCtx.globalCompositeOperation = 'destination-out'; paintCtx.lineWidth = stroke.size; paintCtx.lineCap = 'round'; paintCtx.lineJoin = 'round';
        for (const points of strokeSegments(stroke)) {
          if (!points.length) continue;
          if (points.length === 1) { paintCtx.beginPath(); paintCtx.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2); paintCtx.fill(); }
          else { paintCtx.beginPath(); paintCtx.moveTo(points[0].x, points[0].y); for (const point of points.slice(1)) paintCtx.lineTo(point.x, point.y); paintCtx.stroke(); }
        }
      } else { paintCtx.globalCompositeOperation = 'source-over'; paintCtx.globalAlpha = 1; drawRoughStroke(stroke, paintCtx); }
    }
    paintCtx.globalAlpha = 1; paintCtx.globalCompositeOperation = 'source-over';
    if (landMask && landMask.width === canvas.width && landMask.height === canvas.height) { paintCtx.globalCompositeOperation = 'destination-in'; paintCtx.drawImage(landMask, 0, 0); paintCtx.globalCompositeOperation = 'source-over'; }
    if (!drawing) buildZoneBorder();
    if (cleanMapLayer && cleanMapLayer.width === canvas.width && cleanMapLayer.height === canvas.height) {
      underpaintCtx.clearRect(0, 0, underpaintCanvas.width, underpaintCanvas.height);
      underpaintCtx.globalCompositeOperation = 'source-over'; underpaintCtx.drawImage(cleanMapLayer, 0, 0);
      underpaintCtx.globalCompositeOperation = 'destination-in'; if (zoneMaskLayer) underpaintCtx.drawImage(zoneMaskLayer, 0, 0);
      underpaintCtx.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(underpaintCanvas, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = .62; ctx.drawImage(paintCanvas, 0, 0); ctx.globalAlpha = 1;
    if (zoneBorderLayer && zoneBorderLayer.width === canvas.width && zoneBorderLayer.height === canvas.height) ctx.drawImage(zoneBorderLayer, 0, 0);
    $('#stroke-total').textContent = project.strokes.length;
  }
  function renderLabels() {
    labelsLayer.replaceChildren();
    const scale = project.width ? labelsLayer.clientWidth / project.width : 1;
    for (const label of project.labels) {
      const state = project.states.find(item => item.id === label.stateId);
      if (!state || !state.showLabel) continue;
      const node = document.createElement('div'); node.className = 'map-label'; node.textContent = state.name || 'Stato';
      node.style.left = `${label.x / project.width * 100}%`; node.style.top = `${label.y / project.height * 100}%`;
      node.style.fontSize = `${(label.size || 40) * scale}px`; node.style.maxWidth = `${(label.width || 220) * scale}px`;
      node.style.transform = `translate(-50%,-50%) rotate(${label.rotation || 0}deg)`;
      labelsLayer.append(node);
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
      const color = document.createElement('input'); color.type = 'color'; color.className = 'state-color'; color.value = state.color; color.title = 'Cambia colore'; color.setAttribute('aria-label', `Colore di ${state.name}`); color.addEventListener('click', event => event.stopPropagation()); color.addEventListener('input', () => { state.color = color.value; project.strokes.filter(stroke => stroke.stateId === state.id && stroke.tool !== 'erase').forEach(stroke => { stroke.color = state.color; }); card.style.setProperty('--swatch', state.color); renderStrokes(); save(); });
      const label = document.createElement('label'); label.className = 'show-label'; const check = document.createElement('input'); check.type = 'checkbox'; check.checked = state.showLabel; check.addEventListener('change', () => { state.showLabel = check.checked; renderLabels(); save(); }); label.append(check, document.createTextNode('Etichetta'));
      meta.append(amount, color, label); main.append(name, meta);
      const del = document.createElement('button'); del.type = 'button'; del.className = 'state-delete'; del.textContent = '×'; del.title = 'Elimina Stato'; del.setAttribute('aria-label', `Elimina ${state.name}`); del.addEventListener('click', event => { event.stopPropagation(); if (!confirm(`Eliminare “${state.name}” e le sue pennellate?`)) return; project.states = project.states.filter(item => item.id !== state.id); project.strokes = project.strokes.filter(stroke => stroke.stateId !== state.id); project.labels = project.labels.filter(item => item.stateId !== state.id); if (selectedId === state.id) selectedId = project.states[0]?.id || null; renderAll(); save(); });
      card.append(swatch, main, del); card.addEventListener('click', event => { if (!event.target.closest('input,button,label')) select(state.id); }); stateList.append(card);
    }
    $('#state-total').textContent = project.states.length;
  }
  function select(stateId) { selectedId = stateId; renderStates(); }
  function renderAll() {
    renderStates(); renderStrokes(); renderLabels();
    const hasMap = Boolean(project.map);
    stage.classList.toggle('has-map', hasMap); image.hidden = !hasMap;
    if (hasMap) {
      if (image.dataset.source !== project.map) { image.dataset.source = project.map; image.src = project.map; landMask = null; landPixels = null; baseOwnerPixels = null; baseEdgePixels = null; cleanMapPixels = null; cleanMapLayer = null; zoneMaskLayer = null; zoneBorderLayer = null; say('Calcolo confini…'); }
    } else { image.removeAttribute('src'); image.dataset.source = ''; landMask = null; landPixels = null; baseOwnerPixels = null; baseEdgePixels = null; cleanMapPixels = null; cleanMapLayer = null; zoneMaskLayer = null; zoneBorderLayer = null; }
    $('#canvas-label').textContent = project.mapName || 'Nessuna mappa caricata';
    $('#map-dimensions').textContent = hasMap ? `${project.width} × ${project.height} px` : 'In attesa di una mappa';
    if (hasMap) { fitCanvas(); if (image.complete && (!landMask || landMask.width !== project.width || landMask.height !== project.height)) { landMask = null; landPixels = null; say('Calcolo confini…'); buildLandMask(); } }
  }
  function addState(name = '', color) {
    const state = { id: id(), name: name || `Nuovo Stato ${project.states.length + 1}`, color: color || palette[project.states.length % palette.length], baseColor: null, code: Math.max(0, ...project.states.map(item => item.code || 0)) + 1, showLabel: true };
    project.states.push(state); selectedId = state.id; renderStates(); save();
    if (!name) { const input = stateList.querySelector(`[data-id="${CSS.escape(state.id)}"] input`); input?.focus(); input?.select(); }
  }
  function pos(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(project.width, (event.clientX - rect.left) * project.width / rect.width)), y: Math.max(0, Math.min(project.height, (event.clientY - rect.top) * project.height / rect.height)) };
  }
  function setTool(next) {
    tool = next; document.querySelectorAll('[data-tool]').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
    $('#tool-hint').textContent = tool === 'label' ? 'Clicca sulla mappa per posizionare l’etichetta dello Stato selezionato.' : tool === 'erase' ? 'Trascina sulle pennellate; la gomma si ferma fuori dalla terra.' : 'Dipingi lo Stato selezionato: il tratto si ferma al bordo e riprende quando rientri.';
    canvas.style.cursor = tool === 'label' ? 'copy' : tool === 'erase' ? 'cell' : 'crosshair';
  }
  function exportProject() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    download(blob, 'letherel-mapmaker.json');
  }
  function download(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function exportImage() {
    if (!project.map) { alert('Carica prima la mappa di base.'); return; }
    const out = document.createElement('canvas'); out.width = project.width; out.height = project.height; const outCtx = out.getContext('2d');
    outCtx.drawImage(image, 0, 0, project.width, project.height); outCtx.drawImage(canvas, 0, 0);
    const scaleX = project.width / labelsLayer.clientWidth, scaleY = project.height / labelsLayer.clientHeight;
    outCtx.textAlign = 'center'; outCtx.textBaseline = 'middle';
    for (const label of project.labels) { const state = project.states.find(item => item.id === label.stateId); if (!state?.showLabel) continue; outCtx.font = `600 ${Math.max(16, Math.round(project.width / 85))}px Georgia`; outCtx.lineWidth = 3; outCtx.strokeStyle = '#eff3e9bb'; outCtx.fillStyle = '#28333b'; outCtx.strokeText(state.name, label.x, label.y); outCtx.fillText(state.name, label.x, label.y); }
    out.toBlob(blob => blob && download(blob, 'letherel-mappa.png'), 'image/png');
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
    drawing = true; canvas.setPointerCapture(event.pointerId); activeStroke = { stateId: selectedId, tool: tool === 'erase' ? 'erase' : 'brush', color: selectedState()?.color || '#000', size: Number($('#brush-size').value), roughness: Number($('#roughness').value) / 100, seed: Math.floor(Math.random() * 2147483647), segments: [[point]], outside: false }; project.strokes.push(activeStroke); renderStrokes();
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
  $('#clear-state').addEventListener('click', () => { if (!selectedId) { alert('Seleziona uno Stato.'); return; } const name = selectedState().name; if (!confirm(`Cancellare tutte le pennellate di “${name}”?`)) return; project.strokes = project.strokes.filter(stroke => stroke.stateId !== selectedId); renderStates(); renderStrokes(); save(); });
  $('#map-upload').addEventListener('change', event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const probe = new Image(); probe.onload = () => { project.map = reader.result; project.mapName = file.name; project.width = probe.naturalWidth; project.height = probe.naturalHeight; project.strokes = []; project.labels = []; renderAll(); save(); }; probe.src = reader.result; }; reader.readAsDataURL(file); event.target.value = ''; });
  $('#remove-map').addEventListener('click', () => { if (!project.map || !confirm('Rimuovere la mappa di base e azzerare pennellate ed etichette? Gli Stati resteranno nel progetto.')) return; project.map = ''; project.mapName = ''; project.width = 0; project.height = 0; project.strokes = []; project.labels = []; renderAll(); save(); });
  $('#reset-project').addEventListener('click', () => { if (!confirm('Ripristinare il preset originale di Letherel? Le modifiche correnti verranno cancellate.')) return; project = createPreset(); selectedId = project.states[0]?.id || null; renderAll(); save(); });
  $('#save-project').addEventListener('click', exportProject); $('#export-image').addEventListener('click', exportImage);
  $('#open-project').addEventListener('click', () => $('#project-upload').click());
  $('#project-upload').addEventListener('change', event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const next = JSON.parse(reader.result); if (!next || !Array.isArray(next.states) || !Array.isArray(next.strokes) || !Array.isArray(next.labels)) throw new Error(); project = next; selectedId = project.states[0]?.id || null; renderAll(); save(); } catch { alert('Il file non è un progetto Mapmaker valido.'); } }; reader.readAsText(file); event.target.value = ''; });
  window.addEventListener('resize', fitCanvas);
  image.addEventListener('load', () => { landMask = null; landPixels = null; baseOwnerPixels = null; baseEdgePixels = null; cleanMapPixels = null; cleanMapLayer = null; zoneMaskLayer = null; zoneBorderLayer = null; say('Calcolo confini…'); buildLandMask(); fitCanvas(); });
  window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $('#undo').click(); } });
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.states && saved?.strokes && saved?.labels && (saved.states.length > 0 || saved.map)) {
      project = saved; if (project.map === './assets/territori-base.png') project.map = BASE_MAP;
      let nextCode = presetStates.length + 1;
      project.states.forEach(state => {
        const baseIndex = presetStates.findIndex(([key]) => state.id === `base-${key}`);
        state.baseColor ??= baseIndex >= 0 ? presetStates[baseIndex][2] : null;
        state.code ??= baseIndex >= 0 ? baseIndex + 1 : nextCode++;
      });
      selectedId = project.states[0]?.id || null;
    }
  } catch { /* archivio locale non leggibile: usa il preset base */ }
  renderAll();
})();
