(() => {
  const FILE_TILE_WIDTH = 8;
  const FILE_TILE_HEIGHT = 11;
  const A4_WIDTH = 595.2756;
  const A4_HEIGHT = 841.8898;
  const fileInput = document.querySelector("#image-files");
  const imageList = document.querySelector("#image-list");
  const emptyState = document.querySelector("#empty-state");
  const outputPanel = document.querySelector("#output-panel");
  const generateButton = document.querySelector("#generate");
  const includeReference = document.querySelector("#include-reference");
  const status = document.querySelector("#status");
  const entries = [];
  let generating = false;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function safeName(value) {
    return value.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "battlemap";
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.kind = error ? "error" : "";
  }

  function updateControls() {
    emptyState.hidden = entries.length > 0;
    outputPanel.hidden = entries.length === 0;
    generateButton.disabled = generating || !entries.length || entries.some(entry => !entry.valid || !entry.layoutValid);
    fileInput.disabled = generating;
    includeReference.disabled = generating;
    entries.forEach(entry => entry.card.querySelectorAll("input,button").forEach(control => { control.disabled = generating; }));
  }

  function createEntry(file) {
    const entry = { file, image: new Image(), url: URL.createObjectURL(file), selection: null, pixelsPerInch: null, valid: false, card: null };
    const card = document.createElement("article");
    card.className = "image-card";
    card.innerHTML = `
      <div class="image-card-head"><h3 class="image-title" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</h3><button class="remove-button" type="button">Rimuovi</button></div>
      <div class="image-card-body">
        <div class="image-editor"><div class="image-viewport"><img alt="Anteprima ${escapeHtml(file.name)}"><svg role="img" aria-label="Seleziona un quadretto da un pollice"></svg></div><p class="editor-hint">Trascina sul quadretto della griglia che misura 1″ × 1″.</p></div>
        <div class="image-settings">
          <div class="zoom-row"><label>Zoom</label><output>50%</output><input type="range" min="25" max="400" step="25" value="50" aria-label="Zoom anteprima"></div>
          <label>Larghezza manuale, in pollici<input class="width-input" type="number" min="1" step="1" inputmode="numeric" placeholder="Facoltativa"></label>
          <label>Altezza manuale, in pollici<input class="height-input" type="number" min="1" step="1" inputmode="numeric" placeholder="Facoltativa"></label>
          <button class="manual-button upload-button" type="button">Usa dimensioni manuali</button>
          <p class="measure-hint" role="status" aria-live="polite">Seleziona un quadretto da 1″ × 1″, oppure inserisci entrambe le dimensioni.</p>
          <div class="layout-result" hidden></div>
          <div class="page-count-controls" hidden>
            <label>Fogli in larghezza<input class="cols-input" type="number" min="1" step="1"></label>
            <label>Fogli in altezza<input class="rows-input" type="number" min="1" step="1"></label>
            <button class="layout-button upload-button" type="button">Applica numero fogli</button>
          </div>
        </div>
      </div>`;
    entry.card = card;
    entry.image = card.querySelector("img");
    imageList.append(card);
    entries.push(entry);

    const svg = card.querySelector("svg");
    const viewport = card.querySelector(".image-viewport");
    const zoom = card.querySelector("input[type=range]");
    const zoomOutput = card.querySelector("output");
    const widthInput = card.querySelector(".width-input");
    const heightInput = card.querySelector(".height-input");
    const hint = card.querySelector(".measure-hint");
    let dragStart = null;

    entry.image.addEventListener("load", () => {
      svg.setAttribute("viewBox", `0 0 ${entry.image.naturalWidth} ${entry.image.naturalHeight}`);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.innerHTML = `<rect class="selection-box" x="0" y="0" width="0" height="0" hidden></rect>`;
      setZoom();
      validateEntry(entry, Number(widthInput.value) > 0 && Number(heightInput.value) > 0);
    });
    entry.image.addEventListener("error", () => setEntryError(entry, "Il browser non riesce a leggere questo formato immagine."));

    function setZoom() {
      const scale = Number(zoom.value) / 100;
      const width = entry.image.naturalWidth * scale;
      const height = entry.image.naturalHeight * scale;
      entry.image.style.width = `${width}px`;
      entry.image.style.height = `${height}px`;
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
      viewport.style.width = `${width}px`;
      viewport.style.height = `${height}px`;
      zoomOutput.value = `${zoom.value}%`;
    }

    function point(event) {
      const rect = svg.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(entry.image.naturalWidth, (event.clientX - rect.left) * entry.image.naturalWidth / rect.width)),
        y: Math.max(0, Math.min(entry.image.naturalHeight, (event.clientY - rect.top) * entry.image.naturalHeight / rect.height))
      };
    }

    function paintSelection(start, end) {
      const rect = svg.querySelector("rect");
      rect.hidden = false;
      rect.setAttribute("x", Math.min(start.x, end.x));
      rect.setAttribute("y", Math.min(start.y, end.y));
      rect.setAttribute("width", Math.abs(end.x - start.x));
      rect.setAttribute("height", Math.abs(end.y - start.y));
    }

    svg.addEventListener("pointerdown", event => {
      if (!entry.image.naturalWidth) return;
      svg.setPointerCapture(event.pointerId);
      dragStart = point(event);
      paintSelection(dragStart, dragStart);
    });
    svg.addEventListener("pointermove", event => { if (dragStart) paintSelection(dragStart, point(event)); });
    svg.addEventListener("pointerup", event => {
      if (!dragStart) return;
      const end = point(event);
      entry.selection = { x: Math.min(dragStart.x, end.x), y: Math.min(dragStart.y, end.y), width: Math.abs(end.x - dragStart.x), height: Math.abs(end.y - dragStart.y) };
      dragStart = null;
      validateEntry(entry);
    });
    zoom.addEventListener("input", setZoom);
    card.querySelector(".remove-button").addEventListener("click", () => removeEntry(entry));
    card.querySelector(".manual-button").addEventListener("click", () => validateEntry(entry, true));
    [widthInput, heightInput].forEach(input => input.addEventListener("input", () => {
      entry.selection = null;
      entry.valid = false;
      entry.layout.hidden = true;
      entry.pageCountControls.hidden = true;
      entry.hint.textContent = "Premi «Usa dimensioni manuali» per applicare i valori.";
      entry.hint.dataset.kind = "";
      const rect = svg.querySelector("rect");
      if (rect) rect.hidden = true;
      updateControls();
    }));
    entry.widthInput = widthInput;
    entry.heightInput = heightInput;
    entry.hint = hint;
    entry.layout = card.querySelector(".layout-result");
    entry.pageCountControls = card.querySelector(".page-count-controls");
    entry.colsInput = card.querySelector(".cols-input");
    entry.rowsInput = card.querySelector(".rows-input");
    entry.mode = "grid";
    entry.layoutValid = true;
    [entry.colsInput, entry.rowsInput].forEach(input => input.addEventListener("input", () => {
      entry.layoutValid = false;
      entry.hint.textContent = "Applica il numero di fogli richiesto. La scala da 1″ resta invariata.";
      entry.hint.dataset.kind = "";
      updateControls();
    }));
    card.querySelector(".layout-button").addEventListener("click", () => applyPageCount(entry));
    updateControls();
    entry.image.src = entry.url;
  }

  function removeEntry(entry) {
    URL.revokeObjectURL(entry.url);
    entry.card.remove();
    entries.splice(entries.indexOf(entry), 1);
    updateControls();
  }

  function setEntryError(entry, message) {
    entry.valid = false;
    entry.layoutValid = false;
    entry.pixelsPerInch = null;
    entry.hint.textContent = message;
    entry.hint.dataset.kind = "error";
    entry.layout.hidden = true;
    entry.pageCountControls.hidden = true;
    updateControls();
  }

  function validateEntry(entry, useManual = false) {
    const width = Number(entry.widthInput.value);
    const height = Number(entry.heightInput.value);
    const manualReady = width > 0 && height > 0 && Number.isInteger(width) && Number.isInteger(height);
    if (useManual) {
      if (!manualReady) return setEntryError(entry, "Inserisci larghezza e altezza intere, entrambe in pollici.");
      const scaleX = entry.image.naturalWidth / width;
      const scaleY = entry.image.naturalHeight / height;
      if (Math.abs(scaleX - scaleY) / ((scaleX + scaleY) / 2) > 0.01) return setEntryError(entry, "Misure e proporzioni immagine non coincidono. Controlla le dimensioni o seleziona il quadretto.");
      entry.pixelsPerInch = (scaleX + scaleY) / 2;
      entry.mode = "manual";
      entry.realWidth = width;
      entry.realHeight = height;
    } else {
      const selection = entry.selection;
      if (!selection || selection.width < 5 || selection.height < 5) return setEntryError(entry, "Seleziona un quadretto della griglia da 1″ × 1″.");
      const mismatch = Math.abs(selection.width - selection.height) / ((selection.width + selection.height) / 2);
      if (mismatch > 0.02) return setEntryError(entry, "La selezione non sembra quadrata. Ridisegna il bordo di un quadretto.");
      entry.pixelsPerInch = (selection.width + selection.height) / 2;
      entry.mode = "grid";
      entry.realWidth = entry.image.naturalWidth / entry.pixelsPerInch;
      entry.realHeight = entry.image.naturalHeight / entry.pixelsPerInch;
    }
    const widthInches = entry.realWidth;
    const heightInches = entry.realHeight;
    const cols = Math.ceil(widthInches / FILE_TILE_WIDTH - 1e-9);
    const rows = Math.ceil(heightInches / FILE_TILE_HEIGHT - 1e-9);
    entry.cols = cols;
    entry.rows = rows;
    entry.minimumCols = cols;
    entry.minimumRows = rows;
    entry.colsInput.value = String(cols);
    entry.rowsInput.value = String(rows);
    entry.pageCountControls.hidden = false;
    entry.layoutValid = true;
    entry.valid = Number.isFinite(entry.pixelsPerInch) && entry.pixelsPerInch > 0 && cols > 0 && rows > 0;
    if (!entry.valid) return setEntryError(entry, "Scala o dimensioni non valide.");
    entry.hint.dataset.kind = "success";
    entry.hint.textContent = entry.mode === "manual" ? `Scala impostata da dimensioni manuali: ${widthInches.toFixed(2)}″ × ${heightInches.toFixed(2)}″.` : `Scala calibrata: selezione di ${entry.pixelsPerInch.toFixed(1)} pixel per pollice.`;
    entry.layout.hidden = false;
    entry.layout.innerHTML = `<strong>${cols * rows} pagine A4</strong>${cols} colonne × ${rows} righe<br>Mappa: ${widthInches.toFixed(2)}″ × ${heightInches.toFixed(2)}″`;
    updateControls();
  }

  function applyPageCount(entry) {
    const cols = Number(entry.colsInput.value);
    const rows = Number(entry.rowsInput.value);
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < entry.minimumCols || rows < entry.minimumRows) {
      entry.layoutValid = false;
      entry.hint.textContent = `Servono almeno ${entry.minimumCols} colonne × ${entry.minimumRows} righe per mantenere la scala reale.`;
      entry.hint.dataset.kind = "error";
      updateControls();
      return;
    }
    entry.cols = cols;
    entry.rows = rows;
    entry.layoutValid = true;
    entry.hint.textContent = "Impaginazione applicata. La mappa mantiene la scala reale; eventuali fogli extra restano vuoti.";
    entry.hint.dataset.kind = "success";
    entry.layout.innerHTML = `<strong>${cols * rows} pagine A4</strong>${cols} colonne × ${rows} righe<br>Minimo mappa: ${entry.minimumCols} × ${entry.minimumRows}`;
    updateControls();
  }

  function pageCanvas(entry, col, row) {
    const ppi = entry.pixelsPerInch;
    const sourceX = Math.round(col * FILE_TILE_WIDTH * ppi);
    const sourceY = Math.round(row * FILE_TILE_HEIGHT * ppi);
    const sourceWidth = Math.min(entry.image.naturalWidth - sourceX, Math.ceil(FILE_TILE_WIDTH * ppi));
    const sourceHeight = Math.min(entry.image.naturalHeight - sourceY, Math.ceil(FILE_TILE_HEIGHT * ppi));
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 330;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      return { canvas, width: FILE_TILE_WIDTH, height: FILE_TILE_HEIGHT };
    }
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, sourceWidth, sourceHeight);
    context.drawImage(entry.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    return { canvas, width: Math.min(FILE_TILE_WIDTH, entry.realWidth - col * FILE_TILE_WIDTH), height: Math.min(FILE_TILE_HEIGHT, entry.realHeight - row * FILE_TILE_HEIGHT) };
  }

  async function canvasJpeg(canvas) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.96));
    if (!blob) throw new Error("Impossibile preparare una tessera dell’immagine.");
    return new Uint8Array(await blob.arrayBuffer());
  }

  function textBytes(text) { return new TextEncoder().encode(text); }

  function joinBytes(parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    parts.forEach(part => { result.set(part, offset); offset += part.length; });
    return result;
  }

  function makePdf(pages) {
    const objects = [null, textBytes("<< /Type /Catalog /Pages 2 0 R >>"), null];
    const pageIds = [];
    pages.forEach(page => {
      const pageId = objects.length;
      const contentId = pageId + 1;
      const imageId = pageId + 2;
      pageIds.push(pageId);
      const width = page.reference ? A4_WIDTH : page.widthInches * 72;
      const height = page.reference ? A4_HEIGHT : page.heightInches * 72;
      const sectionX = (A4_WIDTH - FILE_TILE_WIDTH * 72) / 2;
      const sectionTop = (A4_HEIGHT - FILE_TILE_HEIGHT * 72) / 2;
      const x = page.reference ? 0 : sectionX;
      const y = page.reference ? 0 : A4_HEIGHT - sectionTop - height;
      let commands = `q\n${width.toFixed(4)} 0 0 ${height.toFixed(4)} ${x.toFixed(4)} ${y.toFixed(4)} cm\n/Im0 Do\nQ\n`;
      if (!page.reference) {
        const right = x + width;
        const top = y + height;
        const mark = 5;
        const gap = 2;
        const corners = [
          `${x-gap-mark} ${y} m ${x-gap} ${y} l`, `${x} ${y-gap-mark} m ${x} ${y-gap} l`,
          `${right+gap} ${y} m ${right+gap+mark} ${y} l`, `${right} ${y-gap-mark} m ${right} ${y-gap} l`,
          `${x-gap-mark} ${top} m ${x-gap} ${top} l`, `${x} ${top+gap} m ${x} ${top+gap+mark} l`,
          `${right+gap} ${top} m ${right+gap+mark} ${top} l`, `${right} ${top+gap} m ${right} ${top+gap+mark} l`
        ].join("\n");
        commands += `0.65 w\n0.2 G\n${corners}\nS\n`;
      }
      const stream = textBytes(commands);
      objects.push(
        textBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`),
        joinBytes([textBytes(`<< /Length ${stream.length} >>\nstream\n`), stream, textBytes("endstream")]),
        joinBytes([textBytes(`<< /Type /XObject /Subtype /Image /Width ${page.pixelsWidth} /Height ${page.pixelsHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`), page.jpeg, textBytes("\nendstream")])
      );
    });
    objects[2] = textBytes(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    const parts = [textBytes("%PDF-1.4\n%âãÏÓ\n")];
    const offsets = [0];
    let byteLength = parts[0].length;
    objects.slice(1).forEach((object, index) => {
      offsets.push(byteLength);
      const chunk = joinBytes([textBytes(`${index + 1} 0 obj\n`), object, textBytes("\nendobj\n")]);
      parts.push(chunk);
      byteLength += chunk.length;
    });
    const xrefOffset = byteLength;
    const xref = [`xref\n0 ${objects.length}\n0000000000 65535 f \n`];
    offsets.slice(1).forEach(offset => xref.push(`${String(offset).padStart(10, "0")} 00000 n \n`));
    parts.push(textBytes(xref.join("")));
    parts.push(textBytes(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
    return new Blob([joinBytes(parts)], { type: "application/pdf" });
  }

  async function referencePage(entry) {
    const canvas = document.createElement("canvas");
    canvas.width = 1240;
    canvas.height = 1754;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const margin = 80;
    ctx.fillStyle = "#273126";
    ctx.font = "bold 34px Arial";
    ctx.fillText("SCHEMA DI RIFERIMENTO", margin, 88);
    ctx.fillStyle = "#596353";
    ctx.font = "22px Arial";
    ctx.fillText("NON IN SCALA · NON USARE COME TESSERA", margin, 126);
    ctx.fillStyle = "#222";
    ctx.font = "bold 26px Arial";
    ctx.fillText(entry.file.name.slice(0, 54), margin, 190);
    ctx.font = "22px Arial";
    ctx.fillText(`Mappa ${entry.realWidth.toFixed(2)}″ × ${entry.realHeight.toFixed(2)}″`, margin, 230);
    ctx.fillText(`Tessere ${entry.minimumCols} colonne × ${entry.minimumRows} righe · 8″ × 11″ ciascuna`, margin, 265);

    const area = { x: margin, y: 320, width: canvas.width - margin * 2, height: canvas.height - 430 };
    const scale = Math.min(area.width / entry.image.naturalWidth, area.height / entry.image.naturalHeight);
    const mapWidth = entry.image.naturalWidth * scale;
    const mapHeight = entry.image.naturalHeight * scale;
    const mapX = area.x + (area.width - mapWidth) / 2;
    const mapY = area.y + (area.height - mapHeight) / 2;
    ctx.drawImage(entry.image, mapX, mapY, mapWidth, mapHeight);
    ctx.strokeStyle = "#172218";
    ctx.lineWidth = 3;
    ctx.strokeRect(mapX, mapY, mapWidth, mapHeight);
    ctx.font = "bold 25px Arial";
    ctx.textAlign = "center";
    let pageNumber = 1;
    for (let row = 0; row < entry.minimumRows; row++) {
      for (let col = 0; col < entry.minimumCols; col++) {
        const left = mapX + col * FILE_TILE_WIDTH * scale * entry.pixelsPerInch;
        const top = mapY + row * FILE_TILE_HEIGHT * scale * entry.pixelsPerInch;
        const right = Math.min(mapX + mapWidth, left + FILE_TILE_WIDTH * scale * entry.pixelsPerInch);
        const bottom = Math.min(mapY + mapHeight, top + FILE_TILE_HEIGHT * scale * entry.pixelsPerInch);
        ctx.strokeStyle = "#b32431";
        ctx.lineWidth = 3;
        ctx.strokeRect(left, top, right - left, bottom - top);
        ctx.fillStyle = "rgba(255,255,255,.88)";
        ctx.fillRect(left + 10, top + 10, 74, 42);
        ctx.fillStyle = "#a21e2c";
        ctx.fillText(String(pageNumber++).padStart(2, "0"), left + 47, top + 40);
      }
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#596353";
    ctx.font = "20px Arial";
    ctx.fillText("I numeri indicano ordine e posizione dei fogli. Tessere successive nel PDF.", margin, canvas.height - 56);
    const jpeg = await canvasJpeg(canvas);
    return { jpeg, pixelsWidth: canvas.width, pixelsHeight: canvas.height, reference: true };
  }

  async function createPdfPages(entry) {
    const pages = includeReference.checked ? [await referencePage(entry)] : [];
    for (let row = 0; row < entry.rows; row++) {
      for (let col = 0; col < entry.cols; col++) {
        const tile = pageCanvas(entry, col, row);
        pages.push({ jpeg: await canvasJpeg(tile.canvas), pixelsWidth: tile.canvas.width, pixelsHeight: tile.canvas.height, widthInches: tile.width, heightInches: tile.height });
        tile.canvas.width = 1;
        tile.canvas.height = 1;
      }
    }
    return pages;
  }

  function downloadPdf(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName(name)}.pdf`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function generate() {
    generating = true;
    updateControls();
    try {
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        setStatus(`Creo PDF ${index + 1} di ${entries.length}: ${entry.file.name}`);
        const pdfPages = await createPdfPages(entry);
        downloadPdf(makePdf(pdfPages), safeName(entry.file.name));
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      setStatus(`Completato: ${entries.length} PDF. Stampa al 100%, senza adattamento alla pagina.`);
    } catch (error) {
      setStatus(error.message || "Creazione PDF non riuscita.", true);
    } finally {
      generating = false;
      updateControls();
    }
  }

  fileInput.addEventListener("change", () => {
    [...fileInput.files].forEach(file => {
      if (!file.type.startsWith("image/")) return;
      createEntry(file);
    });
    fileInput.value = "";
    setStatus("");
  });
  generateButton.addEventListener("click", generate);
  window.addEventListener("beforeunload", () => entries.forEach(entry => URL.revokeObjectURL(entry.url)));
})();
