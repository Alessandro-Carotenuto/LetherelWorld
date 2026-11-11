(() => {
  const ADVENTURES_PATH = "assets/avventure.json";
  const form = document.getElementById("adventure-form");
  const list = document.getElementById("adventure-list");
  const count = document.getElementById("adventure-count");
  const message = document.getElementById("adventure-message");
  const formTitle = document.getElementById("adventure-form-title");
  const formKicker = document.getElementById("adventure-form-kicker");
  const submitButton = document.getElementById("adventure-submit");
  const cancelButton = document.getElementById("adventure-cancel");
  const participantsList = document.getElementById("adventure-participants-list");
  const addParticipantButton = document.getElementById("adventure-add-participant");
  let data = null;
  let editingIndex = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  }

  function slugify(value) {
    return String(value ?? "").toLocaleLowerCase("it").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function lines(value) {
    return String(value ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }

  function setMessage(text, kind = "") {
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function participantMarkup(participant = {}, index) {
    const group = participant.group === "NPC" ? "NPC" : "PC";
    return `<div class="adventure-participant-row" data-adventure-participant="${index}">
      <label>Nome<input data-participant-name required maxlength="100" value="${escapeHtml(participant.name)}" placeholder="Nome del partecipante"></label>
      <label>Gruppo<select data-participant-group><option value="PC"${group === "PC" ? " selected" : ""}>PC</option><option value="NPC"${group === "NPC" ? " selected" : ""}>NPC</option></select></label>
      <label class="alive-toggle adventure-participant-inactive"><input data-participant-inactive type="checkbox"${participant.inactive === true ? " checked" : ""}><span><strong>Ritirato</strong></span></label>
      <button class="record-action danger" type="button" data-remove-participant aria-label="Rimuovi partecipante" title="Rimuovi">×</button>
    </div>`;
  }

  function renderParticipants(participants = []) {
    participantsList.innerHTML = participants.length
      ? participants.map(participantMarkup).join("")
      : '<p class="empty-state">Nessun partecipante inserito.</p>';
  }

  function collectParticipants() {
    return [...participantsList.querySelectorAll("[data-adventure-participant]")].map(row => ({
      group: row.querySelector("[data-participant-group]").value,
      name: row.querySelector("[data-participant-name]").value.trim(),
      inactive: row.querySelector("[data-participant-inactive]").checked
    }));
  }

  function renderList() {
    count.textContent = String(data.adventures.length);
    if (!data.adventures.length) {
      list.innerHTML = '<p class="empty-state">Nessuna avventura pubblicata.</p>';
      return;
    }
    list.innerHTML = data.adventures.map((adventure, index) => `<article class="record-row">
      <div class="record-copy"><strong>${escapeHtml(adventure.title || "Senza titolo")}</strong><small>${escapeHtml(adventure.subtitle || `${adventure.participants?.length || 0} partecipanti`)}</small></div>
      <div class="record-actions">
        <button type="button" class="record-action" data-edit-adventure="${index}" aria-label="Modifica ${escapeHtml(adventure.title)}" title="Modifica">✎</button>
        <button type="button" class="record-action" data-move-adventure="${index}" data-delta="-1" aria-label="Sposta ${escapeHtml(adventure.title)} in alto" title="Sposta su" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="record-action" data-move-adventure="${index}" data-delta="1" aria-label="Sposta ${escapeHtml(adventure.title)} in basso" title="Sposta giù" ${index === data.adventures.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="record-action danger" data-remove-adventure="${index}" aria-label="Rimuovi ${escapeHtml(adventure.title)}" title="Rimuovi">×</button>
      </div>
    </article>`).join("");
  }

  async function load() {
    const stored = await LocalRepository.readJson(ADVENTURES_PATH);
    if (!stored || !Array.isArray(stored.adventures)) throw new Error("Il JSON delle Avventure deve contenere l’elenco adventures.");
    data = { district: "Distretto Rovere", title: "Avventure", ...stored };
    renderList();
  }

  function resetEditor() {
    editingIndex = null;
    form.reset();
    renderParticipants();
    formTitle.textContent = "Aggiungi avventura";
    formKicker.textContent = "Nuova avventura";
    submitButton.textContent = "Aggiungi avventura";
    cancelButton.hidden = true;
  }

  function edit(index) {
    const adventure = data.adventures[index];
    if (!adventure) return;
    editingIndex = index;
    form.elements.namedItem("title").value = adventure.title || "";
    form.elements.namedItem("subtitle").value = adventure.subtitle || "";
    form.elements.namedItem("image").value = adventure.artwork?.src || "";
    form.elements.namedItem("image-alt").value = adventure.artwork?.alt || "";
    form.elements.namedItem("contractor").value = adventure.contractor || "";
    form.elements.namedItem("reward").value = adventure.reward || "";
    form.elements.namedItem("sessions").value = adventure.sessions ?? "";
    form.elements.namedItem("notes").value = adventure.notes || "";
    form.elements.namedItem("players").value = (adventure.players || []).join("\n");
    renderParticipants(Array.isArray(adventure.participants) ? adventure.participants : []);
    formTitle.textContent = `Modifica ${adventure.title || "avventura"}`;
    formKicker.textContent = "Avventura esistente";
    submitButton.textContent = "Salva modifiche";
    cancelButton.hidden = false;
    setMessage("Modifica i campi e salva per aggiornare questa avventura.");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createAdventure(values, existing = null) {
    const title = String(values.get("title") || "").trim();
    const baseId = slugify(title);
    if (!title || !baseId) throw new Error("Inserisci un titolo valido.");
    let id = existing?.id;
    if (!id) {
      const usedIds = new Set(data.adventures.map(adventure => adventure.id));
      id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    }
    const image = String(values.get("image") || "").trim();
    return {
      ...(existing || {}),
      id,
      title,
      subtitle: String(values.get("subtitle") || "").trim(),
      artwork: { ...(existing?.artwork || {}), src: image, alt: String(values.get("image-alt") || "").trim() },
      participants: collectParticipants(),
      contractor: String(values.get("contractor") || "").trim(),
      reward: String(values.get("reward") || "").trim(),
      sessions: String(values.get("sessions") || "").trim(),
      notes: String(values.get("notes") || "").trim(),
      players: lines(values.get("players"))
    };
  }

  async function save(event) {
    event.preventDefault();
    setMessage("");
    if (!form.reportValidity()) return;
    try {
      const previous = editingIndex == null ? null : data.adventures[editingIndex];
      if (editingIndex != null && !previous) throw new Error("L’avventura da modificare non è più nell’elenco. Ricarica i dati.");
      const adventure = createAdventure(new FormData(form), previous);
      const adventures = [...data.adventures];
      if (editingIndex == null) adventures.push(adventure);
      else adventures[editingIndex] = adventure;
      await LocalRepository.writeJson(ADVENTURES_PATH, { ...data, adventures });
      resetEditor();
      setMessage(previous ? `Avventura “${adventure.title}” aggiornata.` : `Avventura “${adventure.title}” aggiunta.`, "success");
      await load();
    } catch (error) {
      setMessage(`Salvataggio non riuscito: ${error.message}`, "error");
    }
  }

  async function remove(index) {
    const adventure = data.adventures[index];
    if (!adventure || !window.confirm(`Rimuovere “${adventure.title}” dalle Avventure?`)) return;
    try {
      await LocalRepository.writeJson(ADVENTURES_PATH, { ...data, adventures: data.adventures.filter((_, itemIndex) => itemIndex !== index) });
      if (editingIndex === index) resetEditor();
      else if (editingIndex != null && editingIndex > index) editingIndex -= 1;
      setMessage(`Avventura “${adventure.title}” rimossa.`, "success");
      await load();
    } catch (error) {
      setMessage(`Rimozione non riuscita: ${error.message}`, "error");
    }
  }

  async function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= data.adventures.length) return;
    const adventures = [...data.adventures];
    [adventures[index], adventures[target]] = [adventures[target], adventures[index]];
    try {
      await LocalRepository.writeJson(ADVENTURES_PATH, { ...data, adventures });
      if (editingIndex === index) editingIndex = target;
      else if (editingIndex === target) editingIndex = index;
      await load();
    } catch (error) {
      setMessage(`Riordino non riuscito: ${error.message}`, "error");
    }
  }

  function init() {
    form.addEventListener("submit", save);
    cancelButton.addEventListener("click", resetEditor);
    addParticipantButton.addEventListener("click", () => {
      renderParticipants([...collectParticipants(), { group: "PC", name: "", inactive: false }]);
      participantsList.lastElementChild?.querySelector("[data-participant-name]")?.focus();
    });
    participantsList.addEventListener("click", event => {
      const removeButton = event.target.closest("[data-remove-participant]");
      if (!removeButton) return;
      const row = removeButton.closest("[data-adventure-participant]");
      const index = Number(row?.dataset.adventureParticipant);
      const participants = collectParticipants();
      if (Number.isInteger(index)) participants.splice(index, 1);
      renderParticipants(participants);
    });
    list.addEventListener("click", event => {
      const editButton = event.target.closest("[data-edit-adventure]");
      const removeButton = event.target.closest("[data-remove-adventure]");
      const moveButton = event.target.closest("[data-move-adventure]");
      if (editButton) edit(Number(editButton.dataset.editAdventure));
      else if (removeButton) remove(Number(removeButton.dataset.removeAdventure));
      else if (moveButton) move(Number(moveButton.dataset.moveAdventure), Number(moveButton.dataset.delta));
    });
    renderParticipants();
  }

  window.AdventuresAdmin = { init, load };
})();
