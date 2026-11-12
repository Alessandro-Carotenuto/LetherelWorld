(() => {
  const PRESETS_PATH = "local-admin/schede-stampabili.json";
  const CASSA_PATH = "assets/data/cassa.json";
  const form = document.getElementById("cassa-form");
  const presetSelect = document.getElementById("cassa-preset");
  const ownerInput = document.getElementById("cassa-owner");
  const costInput = document.getElementById("cassa-cost");
  const colorInput = document.getElementById("cassa-color");
  const list = document.getElementById("cassa-list");
  const count = document.getElementById("cassa-count");
  const message = document.getElementById("cassa-message");
  const submitButton = document.getElementById("cassa-submit");
  const cancelButton = document.getElementById("cassa-cancel");
  const formKicker = document.getElementById("cassa-form-kicker");
  const colorOptions = [...document.querySelectorAll("[data-cassa-color]")];
  const EQUIPMENT_COLOR = "#a0d2ff";
  const CONSUMABLE_COLOR = "#a92e35";
  let presets = [];
  let items = [];
  let editingId = "";

  function setMessage(text, kind = "") {
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function makeId() {
    return window.crypto?.randomUUID?.() || `cassa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function isConsumable(data = {}) {
    return data.consumable === true || /pozione|consumabil/i.test(`${data.category || ""} ${data.name || ""}`);
  }

  function formatCost(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const amount = Number(raw.replace(",", "."));
    return Number.isFinite(amount) ? amount.toLocaleString("it-IT", { maximumFractionDigits: 2 }) : raw;
  }

  function setColor(color) {
    colorInput.value = color;
    colorOptions.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.cassaColor.toLowerCase() === color.toLowerCase())));
  }

  function equipmentPresets() {
    return presets.filter(preset => preset?.type === "equipaggiamento" && preset.data && typeof preset.data === "object");
  }

  function renderPresets(selectedId = "") {
    const available = equipmentPresets();
    presetSelect.replaceChildren(new Option(available.length ? "Seleziona un preset" : "Nessun preset Equipaggiamento trovato", ""));
    available.forEach(preset => presetSelect.add(new Option(preset.title || preset.data.name || "Equipaggiamento senza nome", preset.id)));
    if (selectedId && !available.some(preset => preset.id === selectedId)) {
      presetSelect.add(new Option("Preset originale non più disponibile", selectedId));
    }
    presetSelect.value = selectedId;
    presetSelect.disabled = Boolean(editingId) || !available.length;
  }

  function renderList() {
    count.textContent = String(items.length);
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "La cassa è vuota.";
      list.append(empty);
      return;
    }
    items.forEach(item => {
      const row = document.createElement("article");
      row.className = "record-row";
      const copy = document.createElement("div");
      copy.className = "record-copy";
      const title = document.createElement("strong");
      title.textContent = item.data?.name || "Oggetto senza nome";
      const details = document.createElement("small");
      const cost = formatCost(item.data?.cost);
      details.textContent = `Proprietario: ${item.owner || "Non indicato"} · ${cost ? `${cost} mo` : "Prezzo non indicato"} · ${item.color || "#78916e"}`;
      copy.append(title, details);
      const actions = document.createElement("div");
      actions.className = "record-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "record-action";
      edit.dataset.editCassaItem = item.id;
      edit.setAttribute("aria-label", `Modifica ${item.data?.name || "oggetto"}`);
      edit.title = "Modifica proprietario, costo o colore";
      edit.textContent = "✎";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "record-action danger";
      remove.dataset.removeCassaItem = item.id;
      remove.setAttribute("aria-label", `Rimuovi ${item.data?.name || "oggetto"}`);
      remove.title = "Rimuovi dalla cassa";
      remove.textContent = "×";
      actions.append(edit, remove);
      row.append(copy, actions);
      list.append(row);
    });
  }

  async function load() {
    const [hasPresets, hasCassa] = await Promise.all([
      LocalRepository.exists(PRESETS_PATH),
      LocalRepository.exists(CASSA_PATH)
    ]);
    const [storedPresets, storedCassa] = await Promise.all([
      hasPresets ? LocalRepository.readJson(PRESETS_PATH) : Promise.resolve({ presets: [] }),
      hasCassa ? LocalRepository.readJson(CASSA_PATH) : Promise.resolve({ items: [] })
    ]);
    presets = Array.isArray(storedPresets) ? storedPresets : Array.isArray(storedPresets.presets) ? storedPresets.presets : [];
    items = Array.isArray(storedCassa.items) ? storedCassa.items.filter(item => item && typeof item.data === "object") : [];
    renderPresets();
    renderList();
    if (!equipmentPresets().length) setMessage("Crea prima un preset di tipo Equipaggiamento nella sezione Carte.", "error");
    else setMessage("");
  }

  async function persist(nextItems, successText) {
    const previous = items;
    items = nextItems;
    renderList();
    try {
      await LocalRepository.writeJson(CASSA_PATH, { version: 1, items }, { create: true });
      setMessage(successText, "success");
      return true;
    } catch (error) {
      items = previous;
      renderList();
      setMessage(`Salvataggio non riuscito: ${error.message}`, "error");
      return false;
    }
  }

  function resetForm() {
    editingId = "";
    form.reset();
    ownerInput.value = "";
    costInput.value = "";
    setColor(EQUIPMENT_COLOR);
    renderPresets();
    formKicker.textContent = "Nuovo oggetto";
    submitButton.textContent = "Aggiungi alla cassa";
    cancelButton.hidden = true;
  }

  function editItem(id) {
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    editingId = id;
    ownerInput.value = item.owner || "";
    costInput.value = item.data?.cost ?? "";
    setColor(/^#[\da-f]{6}$/i.test(item.color || "") ? item.color : EQUIPMENT_COLOR);
    renderPresets(item.presetId || "");
    formKicker.textContent = `Modifica ${item.data?.name || "oggetto"}`;
    submitButton.textContent = "Salva modifiche";
    cancelButton.hidden = false;
    setMessage("Modifica proprietario, costo in mo o colore della carta.");
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const owner = ownerInput.value.trim();
    const cost = costInput.value.trim();
    const color = colorInput.value;
    if (editingId) {
      const updated = items.map(item => item.id === editingId ? { ...item, owner, color, data: { ...item.data, cost } } : item);
      if (await persist(updated, "Oggetto aggiornato nella Cassa.")) resetForm();
      return;
    }
    const preset = equipmentPresets().find(item => item.id === presetSelect.value);
    if (!preset) {
      setMessage("Seleziona un preset Equipaggiamento valido.", "error");
      return;
    }
    const item = {
      id: makeId(),
      presetId: preset.id,
      owner,
      color,
      data: { ...preset.data, type: "equipaggiamento", cost }
    };
    if (await persist([...items, item], "Oggetto aggiunto alla Cassa.")) resetForm();
  }

  async function removeItem(id) {
    const item = items.find(entry => entry.id === id);
    if (!item || !window.confirm(`Rimuovere “${item.data?.name || "questo oggetto"}” dalla Cassa?`)) return;
    await persist(items.filter(entry => entry.id !== id), "Oggetto rimosso dalla Cassa.");
    if (editingId === id) resetForm();
  }

  function init() {
    form.addEventListener("submit", submit);
    presetSelect.addEventListener("change", () => {
      const preset = equipmentPresets().find(item => item.id === presetSelect.value);
      if (preset) {
        costInput.value = preset.data.cost ?? "";
        setColor(isConsumable(preset.data) ? CONSUMABLE_COLOR : EQUIPMENT_COLOR);
      }
    });
    colorInput.addEventListener("input", () => setColor(colorInput.value));
    colorOptions.forEach(button => button.addEventListener("click", () => setColor(button.dataset.cassaColor)));
    setColor(colorInput.value || EQUIPMENT_COLOR);
    cancelButton.addEventListener("click", resetForm);
    list.addEventListener("click", event => {
      const edit = event.target.closest("[data-edit-cassa-item]");
      const remove = event.target.closest("[data-remove-cassa-item]");
      if (edit) editItem(edit.dataset.editCassaItem);
      if (remove) removeItem(remove.dataset.removeCassaItem);
    });
  }

  window.CassaAdmin = { init, load };
})();
