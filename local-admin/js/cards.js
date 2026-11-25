(() => {
  const PRESETS_PATH = "local-admin/schede-stampabili.json";
  const TYPE_LABELS = {
    equipaggiamento: "Equipaggiamento",
    creatura: "Creatura",
    incantesimo: "Incantesimo"
  };
  const form = document.getElementById("printable-card-form");
  const typeSelect = document.getElementById("printable-card-type");
  const fields = document.getElementById("printable-card-fields");
  const preview = document.getElementById("printable-card-preview");
  const list = document.getElementById("printable-card-list");
  const sheetList = document.getElementById("printable-card-sheet-list");
  const count = document.getElementById("printable-card-count");
  const searchInput = document.getElementById("printable-card-search");
  const filterType = document.getElementById("printable-card-filter-type");
  const filterCategory = document.getElementById("printable-card-filter-category");
  const resultsLabel = document.getElementById("printable-card-results");
  const message = document.getElementById("printable-card-message");
  const saveButton = document.getElementById("printable-card-save");
  const formTitle = document.getElementById("printable-card-form-title");
  const printOutput = document.getElementById("printable-card-print-output");
  let presets = [];
  const sheetQueue = [];
  let editingId = "";

  function input(name, label, { placeholder = "", hint = "", type = "text", required = false, step, min } = {}) {
    const attrs = [
      `name="${name}"`,
      `type="${type}"`,
      placeholder ? `placeholder="${placeholder}"` : "",
      required ? "required" : "",
      step ? `step="${step}"` : "",
      min !== undefined ? `min="${min}"` : ""
    ].filter(Boolean).join(" ");
    return `<label>${label}${hint ? `<small>${hint}</small>` : ""}<input ${attrs}></label>`;
  }

  function textarea(name, label, { placeholder = "", hint = "", rows = 4, required = false } = {}) {
    const attrs = [`name="${name}"`, `rows="${rows}"`, required ? "required" : ""].filter(Boolean).join(" ");
    return `<label class="form-span">${label}${hint ? `<small>${hint}</small>` : ""}<textarea ${attrs} placeholder="${placeholder}"></textarea></label>`;
  }

  function renderFields(type) {
    const title = input("name", "Nome della carta", { required: true, placeholder: "Es. Spadone adamantino" });
    if (type === "equipaggiamento") {
      fields.innerHTML = title +
        input("damage", "Danni", { placeholder: "2d6" }) +
        input("damageType", "Tipo di danno", { placeholder: "Taglienti" }) +
        input("range", "Gittata / portata", { placeholder: "1,5 m o 45/180 m", hint: "Inserisci le distanze in metri." }) +
        input("mastery", "Maestria", { placeholder: "Graffiare" }) +
        input("cost", "Costo (mo)", { type: "number", min: 0, step: "0.01", placeholder: "15", hint: "Salvato nel preset e importato anche in Cassa." }) +
        input("category", "Categoria", { placeholder: "Arma marziale" }) +
        input("rarity", "Rarità", { placeholder: "Non comune" }) +
        input("weight", "Peso", { placeholder: "3 kg" }) +
        textarea("description", "Descrizione", { rows: 4 }) +
        textarea("properties", "Proprietà ed effetti", { rows: 5, hint: "Una proprietà per riga; scrivi la regola in italiano." });
    } else if (type === "creatura") {
      const abilities = ["FOR", "DES", "COS", "INT", "SAG", "CAR"].map(code =>
        `<label>${code}<input name="${code}-score" type="number" min="1" max="30" placeholder="10" aria-label="Punteggio ${code}"><small>Mod. <input class="cards-auto-modifier" name="${code}-mod" readonly aria-label="Modificatore ${code}, calcolato automaticamente"> · TS <input name="${code}-save" placeholder="+0" aria-label="Tiro salvezza ${code}"></small></label>`
      ).join("");
      fields.innerHTML = title +
        input("ac", "Classe armatura", { type: "number", min: 0, placeholder: "14" }) +
        input("hp", "Punti ferita", { placeholder: "22 (3d10 + 6)" }) +
        input("speed", "Velocità", { placeholder: "9 m; volo 12 m", hint: "Inserisci tutte le distanze in metri." }) +
        input("initiative", "Iniziativa", { placeholder: "+2 (12)" }) +
        input("proficiency", "Bonus competenza", { placeholder: "+2" }) +
        `<fieldset class="form-span admin-fieldset cards-abilities"><legend>Caratteristiche</legend><div class="cards-ability-grid">${abilities}</div></fieldset>` +
        input("skills", "Abilità", { placeholder: "Percezione +5, Furtività +4" }) +
        input("senses", "Sensi", { placeholder: "Scurovisione 18 m, Percezione passiva 15", hint: "Inserisci le distanze in metri." }) +
        textarea("traits", "Tratti", { rows: 4, hint: "Una regola per riga." }) +
        textarea("actions", "Azioni", { rows: 4, hint: "Una azione per riga; usa distanze in metri." }) +
        textarea("loot", "Bottino", { rows: 3, hint: "Oggetti lasciati dalla creatura, se presenti." }) +
        input("creatureType", "Tipo e taglia", { placeholder: "Bestia Grande" }) +
        input("alignment", "Allineamento", { placeholder: "Neutrale" }) +
        input("challenge", "Grado di sfida", { placeholder: "1" });
    } else {
      fields.innerHTML = title +
        input("level", "Livello", { type: "number", min: 0, max: 9, placeholder: "0" }) +
        input("range", "Gittata", { placeholder: "9 m", hint: "Usa metri; puoi scrivere anche “contatto” o “personale”." }) +
        input("components", "Componenti", { placeholder: "V, S, M" }) +
        input("duration", "Durata", { placeholder: "1 minuto" }) +
        input("castingTime", "Tempo di lancio", { placeholder: "1 azione" }) +
        input("school", "Scuola", { placeholder: "Illusione" }) +
        input("classes", "Classi", { placeholder: "Bardo, Stregone, Mago" }) +
        textarea("description", "Descrizione", { rows: 7 }) +
        input("material", "Componente materiale", { placeholder: "Un ciuffo di lana" });
    }
    updatePreview();
  }

  function node(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== "") element.textContent = text;
    return element;
  }

  function appendFormattedText(parent, text) {
    const source = String(text || "");
    const bold = /\*\*(.+?)\*\*/g;
    let position = 0;
    let match;
    while ((match = bold.exec(source))) {
      if (match.index > position) parent.append(document.createTextNode(source.slice(position, match.index)));
      parent.append(node("strong", "", match[1]));
      position = bold.lastIndex;
    }
    if (position < source.length) parent.append(document.createTextNode(source.slice(position)));
  }

  function addParagraphs(parent, text, className = "") {
    String(text || "").split(/\n+/).map(line => line.trim()).filter(Boolean).forEach(line => {
      const paragraph = node("p", className);
      appendFormattedText(paragraph, line);
      parent.append(paragraph);
    });
  }

  function addSection(body, title, text) {
    if (!String(text || "").trim()) return;
    const section = node("section", "print-card-section");
    section.append(node("h3", "", title));
    addParagraphs(section, text);
    body.append(section);
  }

  function addInlineSection(body, title, text) {
    if (!String(text || "").trim()) return;
    const paragraph = node("p", "print-card-inline");
    const strong = node("strong", "", `${title}. `);
    paragraph.append(strong);
    appendFormattedText(paragraph, text.trim());
    body.append(paragraph);
  }

  function addFacts(card, facts) {
    const visible = facts.filter(([, value]) => String(value || "").trim());
    if (!visible.length) return;
    const grid = node("div", `print-card-facts facts-${visible.length}`);
    visible.forEach(([label, value]) => {
      const cell = node("div", "print-card-fact");
      cell.append(node("strong", "", label), node("span", "", value));
      grid.append(cell);
    });
    card.append(grid);
  }

  function formatCost(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const amount = Number(raw.replace(",", "."));
    return Number.isFinite(amount) ? `${amount.toLocaleString("it-IT", { maximumFractionDigits: 2 })} mo` : `${raw} mo`;
  }

  function addFooter(card, left, right) {
    const footer = node("footer", "print-card-footer");
    footer.append(node("strong", "", left || ""), node("span", "", right || ""));
    card.append(footer);
  }

  function renderCard(data = {}) {
    const type = TYPE_LABELS[data.type] ? data.type : "equipaggiamento";
    const card = node("article", `print-card print-card-${type}`);
    const requestedSize = Number(data.textSize);
    const textSize = Number.isFinite(requestedSize) && requestedSize >= 7 && requestedSize <= 12 ? requestedSize : 8;
    card.style.setProperty("--print-card-body-size", `${textSize}px`);
    const header = node("header", "print-card-header");
    const title = node("h2", "print-card-title", data.name || "Nuova carta");
    if (String(data.name || "").length > 25) title.classList.add("long-name");
    if (String(data.name || "").length > 38) title.classList.add("very-long-name");
    header.append(title);
    if (type === "incantesimo" && String(data.level ?? "").trim()) {
      const level = node("span", "print-card-level");
      level.append(node("span", "", data.level));
      header.append(level);
    }
    card.append(header);

    const body = node("div", "print-card-body");
    if (type === "equipaggiamento") {
      addFacts(card, [["DANNI", [data.damage, data.damageType].filter(Boolean).join(" ")], ["GITTATA", data.range], ["MAESTRIA", data.mastery], ["COSTO", formatCost(data.cost)]]);
      addParagraphs(body, data.description);
      addSection(body, "Proprietà", data.properties);
      addFooter(card, data.category, [data.rarity, data.weight].filter(Boolean).join(" · "));
    } else if (type === "creatura") {
      addFacts(card, [["CA", data.ac], ["PF", data.hp], ["VELOCITÀ", data.speed], ["INIZIATIVA", data.initiative], ["BC", data.proficiency]]);
      const abilityGrid = node("div", "print-card-abilities");
      ["FOR", "DES", "COS", "INT", "SAG", "CAR"].forEach(code => {
        const score = data[`${code}-score`];
        const modifier = data[`${code}-mod`];
        const save = data[`${code}-save`];
        if (!score && !modifier && !save) return;
        const cell = node("div", "print-card-ability");
        cell.append(node("strong", "", code), node("b", "", score || "—"), node("small", "", `${modifier || "—"} | ${save || "—"}`));
        abilityGrid.append(cell);
      });
      if (abilityGrid.childElementCount) card.append(abilityGrid);
      addInlineSection(body, "Abilità", data.skills);
      addInlineSection(body, "Sensi", data.senses);
      addSection(body, "Tratti", data.traits);
      addSection(body, "Azioni", data.actions);
      addSection(body, "Bottino", data.loot);
      addFooter(card, data.creatureType, [data.alignment, data.challenge ? `GS ${data.challenge}` : ""].filter(Boolean).join(" · "));
    } else {
      addFacts(card, [["GITTATA", data.range], ["COMPONENTI", data.components], ["DURATA", data.duration], ["TEMPO DI LANCIO", data.castingTime]]);
      addParagraphs(body, data.description);
      if (String(data.material || "").trim()) body.append(node("p", "print-card-material", `Materiale: ${data.material.trim()}`));
      addFooter(card, data.school, data.classes);
    }
    card.insertBefore(body, card.querySelector(".print-card-footer"));
    return card;
  }

  function currentData() {
    updateModifiers();
    return Object.fromEntries(new FormData(form));
  }

  function updateModifiers() {
    ["FOR", "DES", "COS", "INT", "SAG", "CAR"].forEach(code => {
      const score = form.elements.namedItem(`${code}-score`);
      const modifier = form.elements.namedItem(`${code}-mod`);
      if (!score || !modifier) return;
      const value = score.value.trim();
      if (!value) {
        modifier.value = "";
        return;
      }
      const result = Math.floor((Number(value) - 10) / 2);
      modifier.value = result > 0 ? `+${result}` : String(result);
    });
  }

  function updatePreview() {
    if (!form || !preview) return;
    preview.replaceChildren(renderCard(currentData()));
  }

  function showMessage(text, kind = "") {
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function normalizeSearch(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
  }

  function presetCategory(preset) {
    const data = preset.data || {};
    const value = preset.type === "equipaggiamento" ? data.category
      : preset.type === "creatura" ? data.creatureType
        : preset.type === "incantesimo" ? data.school : "";
    return String(value || "").trim();
  }

  function refreshCategoryFilter() {
    const previous = filterCategory.value;
    const selectedType = filterType.value;
    const categories = [...new Set(presets
      .filter(preset => !selectedType || preset.type === selectedType)
      .map(presetCategory)
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
    filterCategory.replaceChildren(new Option("Tutte le categorie", ""));
    categories.forEach(category => filterCategory.add(new Option(category, category)));
    filterCategory.value = categories.includes(previous) ? previous : "";
  }

  function renderList() {
    count.textContent = String(presets.length);
    list.replaceChildren();
    refreshCategoryFilter();
    if (!presets.length) {
      list.append(node("p", "empty-state", "Non hai ancora salvato preset."));
      resultsLabel.textContent = "0 preset";
      renderSheet();
      return;
    }
    const queryTerms = normalizeSearch(searchInput.value.trim()).split(/\s+/).filter(Boolean);
    const selectedType = filterType.value;
    const selectedCategory = normalizeSearch(filterCategory.value);
    const filtered = presets.filter(preset => {
      if (selectedType && preset.type !== selectedType) return false;
      if (selectedCategory && normalizeSearch(presetCategory(preset)) !== selectedCategory) return false;
      if (!queryTerms.length) return true;
      const dataText = Object.values(preset.data || {}).filter(value =>
        typeof value === "string" || typeof value === "number"
      ).join(" ");
      const searchableText = normalizeSearch(`${preset.title || preset.data?.name || ""} ${TYPE_LABELS[preset.type] || "Carta"} ${presetCategory(preset)} ${dataText}`);
      return queryTerms.every(term => searchableText.includes(term));
    });
    resultsLabel.textContent = `${filtered.length} di ${presets.length} preset`;
    if (!filtered.length) {
      list.append(node("p", "empty-state", "Nessun preset trovato. Prova a cambiare ricerca o filtri."));
      renderSheet();
      return;
    }

    const typeOrder = ["equipaggiamento", "creatura", "incantesimo"];
    const types = [...new Set(filtered.map(preset => preset.type))].sort((a, b) => {
      const aIndex = typeOrder.indexOf(a);
      const bIndex = typeOrder.indexOf(b);
      return (aIndex < 0 ? typeOrder.length : aIndex) - (bIndex < 0 ? typeOrder.length : bIndex);
    });
    types.forEach(type => {
      const groupPresets = filtered.filter(preset => preset.type === type);
      const group = node("section", "cards-preset-group");
      group.append(node("h4", "", `${TYPE_LABELS[type] || "Carta"} · ${groupPresets.length}`));
      const groupList = node("div", "cards-preset-group-list");
      groupPresets.forEach(preset => {
        const row = node("div", "record-row");
        const copy = node("div", "record-copy");
        copy.append(node("strong", "", preset.title || preset.data?.name || "Carta senza nome"));
        const categoryLabel = presetCategory(preset);
        const costLabel = type === "equipaggiamento" && formatCost(preset.data?.cost);
        const details = [categoryLabel, costLabel].filter(Boolean).join(" · ");
        copy.append(node("small", "", details || TYPE_LABELS[type] || "Carta"));
        const actions = node("div", "record-actions");
        [
          ["load", "Carica", "Carica questo preset"],
          ["duplicate", "Duplica", "Crea un nuovo preset con gli stessi dati"],
          ["download", "PNG", "Scarica questa carta come immagine PNG"],
          ["add", "Aggiungi", "Aggiungi al foglio di stampa"],
          ["delete", "×", "Elimina questo preset"]
        ].forEach(([action, label, title]) => {
          const button = node("button", `record-action${action === "delete" ? " danger" : ""}`, label);
          button.type = "button";
          button.dataset.action = action;
          button.dataset.id = preset.id;
          button.title = title;
          if (action === "add" && sheetQueue.length >= 9) button.disabled = true;
          actions.append(button);
        });
        row.append(copy, actions);
        groupList.append(row);
      });
      group.append(groupList);
      list.append(group);
    });
    renderSheet();
  }

  function renderSheet() {
    const printButton = document.getElementById("printable-card-sheet-print");
    const clearButton = document.getElementById("printable-card-sheet-clear");
    document.getElementById("printable-card-sheet-count").textContent = `${sheetQueue.length}/9`;
    printButton.disabled = sheetQueue.length === 0;
    clearButton.disabled = sheetQueue.length === 0;
    sheetList.replaceChildren();
    if (!sheetQueue.length) {
      sheetList.append(node("p", "empty-state", "Il foglio è vuoto."));
      return;
    }
    sheetQueue.forEach((item, index) => {
      const row = node("div", "record-row");
      const copy = node("div", "record-copy");
      copy.append(node("strong", "", `${index + 1}. ${item.title}`));
      copy.append(node("small", "", TYPE_LABELS[item.type] || "Carta"));
      const actions = node("div", "record-actions");
      const remove = node("button", "record-action danger", "×");
      remove.type = "button";
      remove.dataset.action = "remove-sheet";
      remove.dataset.queueId = item.queueId;
      remove.title = "Rimuovi dal foglio";
      actions.append(remove);
      row.append(copy, actions);
      sheetList.append(row);
    });
  }

  function addPresetToSheet(id) {
    const preset = presets.find(item => item.id === id);
    if (!preset || sheetQueue.length >= 9) return;
    sheetQueue.push({
      queueId: makeId(),
      presetId: preset.id,
      type: preset.type,
      title: preset.title || preset.data?.name || "Carta senza nome",
      data: { ...(preset.data || {}) }
    });
    renderList();
    showMessage(`Aggiunta al foglio: ${preset.title || preset.data?.name || "carta"}.`, "success");
  }

  async function load() {
    if (await LocalRepository.exists(PRESETS_PATH)) {
      const stored = await LocalRepository.readJson(PRESETS_PATH);
      presets = Array.isArray(stored) ? stored : Array.isArray(stored.presets) ? stored.presets : [];
    } else {
      presets = [];
    }
    renderList();
  }

  function makeId() {
    return window.crypto?.randomUUID?.() || `carta-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function persist() {
    await LocalRepository.writeJson(PRESETS_PATH, { version: 1, presets }, { create: true });
    renderList();
  }

  async function save(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = currentData();
    const preset = {
      id: editingId || makeId(),
      type: data.type,
      title: data.name.trim(),
      data
    };
    const previous = [...presets];
    const index = presets.findIndex(item => item.id === preset.id);
    if (index >= 0) presets[index] = preset;
    else presets.push(preset);
    try {
      await persist();
      editingId = preset.id;
      formTitle.textContent = "Modifica preset";
      saveButton.textContent = "Aggiorna preset";
      showMessage("Preset salvato nel file JSON locale.", "success");
    } catch (error) {
      presets = previous;
      renderList();
      showMessage(`Salvataggio non riuscito: ${error.message}`, "error");
    }
  }

  function startNew() {
    editingId = "";
    form.reset();
    typeSelect.value = "equipaggiamento";
    renderFields(typeSelect.value);
    formTitle.textContent = "Crea una carta";
    saveButton.textContent = "Salva preset";
    showMessage("");
  }

  function loadPreset(id) {
    const preset = presets.find(item => item.id === id);
    if (!preset) return;
    editingId = preset.id;
    fillFormFromPreset(preset);
    formTitle.textContent = "Modifica preset";
    saveButton.textContent = "Aggiorna preset";
    showMessage(`Preset caricato: ${preset.title || preset.data?.name || "carta"}.`);
  }

  function fillFormFromPreset(preset) {
    form.reset();
    typeSelect.value = preset.type;
    form.elements.namedItem("textSize").value = preset.data?.textSize || "8";
    renderFields(preset.type);
    Object.entries(preset.data || {}).forEach(([name, value]) => {
      const control = form.elements.namedItem(name);
      if (control && "value" in control) control.value = value;
    });
    updatePreview();
  }

  function duplicatePreset(id) {
    const preset = presets.find(item => item.id === id);
    if (!preset) return;
    editingId = "";
    fillFormFromPreset(preset);
    formTitle.textContent = "Duplica preset";
    saveButton.textContent = "Salva nuovo preset";
    showMessage("Copia pronta: modifica la carta e salvala come nuovo preset.");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function renderCardPng(data) {
    const stage = node("div", "cards-image-export");
    const card = renderCard(data);
    stage.append(card);
    document.body.append(stage);
    try {
      const rect = card.getBoundingClientRect();
      const copy = card.cloneNode(true);
      copy.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      const cardStyles = [...document.styleSheets].flatMap(sheet => {
        try {
          return [...sheet.cssRules].filter(rule => rule.selectorText?.includes(".print-card"))
            .map(rule => rule.cssText);
        } catch {
          return [];
        }
      }).join("\n");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${cardStyles}</style>${copy.outerHTML}</div></foreignObject></svg>`;
      const picture = new Image();
      await new Promise((resolve, reject) => {
        picture.onload = resolve;
        picture.onerror = () => reject(new Error("Impossibile convertire la carta in immagine."));
        picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rect.width * 3);
      canvas.height = Math.round(rect.height * 3);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas non disponibile.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG non disponibile.")), "image/png"));
    } finally {
      stage.remove();
    }
  }

  async function downloadCardImage(data, title, button) {
    button.disabled = true;
    try {
      const blob = await renderCardPng(data);
      const filename = String(title || "carta").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim().replace(/[. ]+$/g, "") || "carta";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      showMessage(`PNG scaricato: ${filename}.png`, "success");
    } catch (error) {
      showMessage(`Download PNG non riuscito: ${error.message}`, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function deletePreset(id) {
    const preset = presets.find(item => item.id === id);
    if (!preset || !window.confirm(`Eliminare il preset “${preset.title || "senza nome"}”?`)) return;
    const previous = presets;
    const previousQueue = [...sheetQueue];
    presets = presets.filter(item => item.id !== id);
    sheetQueue.splice(0, sheetQueue.length, ...sheetQueue.filter(item => item.presetId !== id));
    try {
      await persist();
      if (editingId === id) startNew();
      showMessage("Preset eliminato.", "success");
    } catch (error) {
      presets = previous;
      sheetQueue.splice(0, sheetQueue.length, ...previousQueue);
      renderList();
      showMessage(`Eliminazione non riuscita: ${error.message}`, "error");
    }
  }

  function printCards(cards) {
    if (!cards.length) return;
    printOutput.replaceChildren();
    for (let start = 0; start < cards.length; start += 9) {
      const sheet = node("section", "print-sheet");
      cards.slice(start, start + 9).forEach(preset => sheet.append(renderCard(preset.data || preset)));
      printOutput.append(sheet);
    }
    document.body.classList.add("printing-cards");
    window.print();
  }

  function applyBoldShortcut(event) {
    if (!(event.target instanceof HTMLTextAreaElement) || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "b" || event.repeat) return;
    event.preventDefault();
    const textarea = event.target;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    textarea.setRangeText(`**${selected}**`, start, end, "select");
    if (start === end) textarea.setSelectionRange(start + 2, start + 2);
    else textarea.setSelectionRange(start + 2, start + selected.length + 2);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function init() {
    renderFields(typeSelect.value);
    form.addEventListener("input", updatePreview);
    form.addEventListener("keydown", applyBoldShortcut);
    typeSelect.addEventListener("change", () => renderFields(typeSelect.value));
    form.addEventListener("submit", save);
    document.getElementById("printable-card-new").addEventListener("click", startNew);
    document.getElementById("printable-card-preview-download").addEventListener("click", event => {
      const data = currentData();
      void downloadCardImage(data, data.name, event.currentTarget);
    });
    document.getElementById("printable-card-sheet-print").addEventListener("click", () => printCards(sheetQueue));
    document.getElementById("printable-card-sheet-clear").addEventListener("click", () => {
      sheetQueue.length = 0;
      renderList();
    });
    searchInput.addEventListener("input", renderList);
    filterType.addEventListener("change", renderList);
    filterCategory.addEventListener("change", renderList);
    document.getElementById("printable-card-filter-reset").addEventListener("click", () => {
      searchInput.value = "";
      filterType.value = "";
      filterCategory.value = "";
      renderList();
      searchInput.focus();
    });
    list.addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const { action, id } = button.dataset;
      if (action === "load") loadPreset(id);
      if (action === "duplicate") duplicatePreset(id);
      if (action === "download") {
        const preset = presets.find(item => item.id === id);
        if (preset) void downloadCardImage(preset.data || {}, preset.title || preset.data?.name, button);
      }
      if (action === "add") addPresetToSheet(id);
      if (action === "delete") deletePreset(id);
    });
    sheetList.addEventListener("click", event => {
      const button = event.target.closest('button[data-action="remove-sheet"]');
      if (!button) return;
      const index = sheetQueue.findIndex(item => item.queueId === button.dataset.queueId);
      if (index >= 0) sheetQueue.splice(index, 1);
      renderList();
    });
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-cards"));
    renderList();
  }

  window.CardsAdmin = { init, load };
})();
