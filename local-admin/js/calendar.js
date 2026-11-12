(() => {
  const CALENDAR_PATH = "assets/data/calendario.json";
  const form = document.getElementById("calendar-form");
  const currentLabelInput = document.getElementById("calendar-current-label");
  const list = document.getElementById("calendar-timeline-list");
  const message = document.getElementById("calendar-message");
  const addEventButton = document.getElementById("calendar-add-event");
  const addLinkButton = document.getElementById("calendar-add-link");
  let calendar = { currentLabel: "Tempo attuale", timeline: [] };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  }

  function setMessage(text, kind = "") {
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function entryMarkup(entry, index, count) {
    const isLink = entry.marker === "link";
    return `<fieldset class="admin-fieldset calendar-editor-row" data-calendar-item="${index}">
      <legend>${isLink ? "Periodo o nota" : "Evento"} ${index + 1}</legend>
      <div class="admin-form-grid">
        <label>Tipo<select data-calendar-marker><option value="diamond"${isLink ? "" : " selected"}>Evento</option><option value="link"${isLink ? " selected" : ""}>Periodo o nota</option></select></label>
        <label class="form-span">Data o testo<input data-calendar-text required maxlength="200" value="${escapeHtml(entry.text)}" placeholder="Es. Lunedì 08 della Prima Luna, 271 dr"></label>
        ${isLink ? "" : `<label class="form-span">Descrizione <small>Facoltativa</small><textarea data-calendar-description rows="3" placeholder="Descrizione dell’evento">${escapeHtml(entry.description)}</textarea></label>
        <label class="alive-toggle form-span calendar-current-toggle"><input data-calendar-current type="checkbox"${entry.current === true ? " checked" : ""}><span><strong>Tempo attuale</strong><small>Segna questo evento come momento presente.</small></span></label>`}
      </div>
      <div class="calendar-row-actions">
        <button class="record-action" type="button" data-calendar-move="-1" aria-label="Sposta su" title="Sposta su"${index === 0 ? " disabled" : ""}>↑</button>
        <button class="record-action" type="button" data-calendar-move="1" aria-label="Sposta giù" title="Sposta giù"${index === count - 1 ? " disabled" : ""}>↓</button>
        <button class="record-action danger" type="button" data-calendar-remove aria-label="Rimuovi elemento" title="Rimuovi">×</button>
      </div>
    </fieldset>`;
  }

  function render(nextCalendar = calendar) {
    calendar = nextCalendar;
    currentLabelInput.value = String(calendar.currentLabel || "Tempo attuale");
    list.innerHTML = calendar.timeline.length
      ? calendar.timeline.map((entry, index) => entryMarkup(entry, index, calendar.timeline.length)).join("")
      : '<p class="empty-state">La cronologia è vuota. Aggiungi un evento o un periodo.</p>';
  }

  function collect() {
    const timeline = [...list.querySelectorAll("[data-calendar-item]")].map(row => {
      const marker = row.querySelector("[data-calendar-marker]").value;
      const entry = {
        marker,
        text: row.querySelector("[data-calendar-text]").value.trim()
      };
      if (marker === "diamond") {
        entry.current = row.querySelector("[data-calendar-current]").checked;
        entry.description = row.querySelector("[data-calendar-description]").value.trim();
      }
      return entry;
    });
    return { currentLabel: currentLabelInput.value.trim(), timeline };
  }

  async function load() {
    const data = await LocalRepository.readJson(CALENDAR_PATH);
    if (!data || !Array.isArray(data.timeline)) throw new Error("Il calendario deve contenere l’elenco timeline.");
    calendar = {
      ...data,
      currentLabel: String(data.currentLabel || "Tempo attuale"),
      timeline: data.timeline.map(entry => ({
        marker: entry?.marker === "link" ? "link" : "diamond",
        text: String(entry?.text || ""),
        current: entry?.marker !== "link" && entry?.current === true,
        description: entry?.marker === "link" ? "" : String(entry?.description || "")
      }))
    };
    render();
    setMessage("");
  }

  async function save(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const nextCalendar = collect();
    if (!nextCalendar.currentLabel) {
      setMessage("Inserisci l’etichetta del tempo attuale.", "error");
      return;
    }
    const blank = nextCalendar.timeline.findIndex(entry => !entry.text);
    if (blank >= 0) {
      setMessage(`Inserisci il testo dell’elemento ${blank + 1}.`, "error");
      return;
    }
    if (nextCalendar.timeline.filter(entry => entry.current).length > 1) {
      setMessage("Puoi indicare un solo evento come tempo attuale.", "error");
      return;
    }
    try {
      await LocalRepository.writeJson(CALENDAR_PATH, { ...calendar, ...nextCalendar });
      render({ ...calendar, ...nextCalendar });
      setMessage("Calendario aggiornato.", "success");
    } catch (error) {
      setMessage(`Salvataggio non riuscito: ${error.message}`, "error");
    }
  }

  function addEntry(marker) {
    const nextCalendar = collect();
    nextCalendar.timeline.push({ marker, text: "", current: false, description: "" });
    render(nextCalendar);
    list.lastElementChild?.querySelector("[data-calendar-text]")?.focus();
  }

  function handleListClick(event) {
    const row = event.target.closest("[data-calendar-item]");
    if (!row) return;
    const index = Number(row.dataset.calendarItem);
    const nextCalendar = collect();
    if (event.target.closest("[data-calendar-remove]")) {
      nextCalendar.timeline.splice(index, 1);
    } else {
      const move = Number(event.target.closest("[data-calendar-move]")?.dataset.calendarMove);
      const target = index + move;
      if (!Number.isInteger(move) || target < 0 || target >= nextCalendar.timeline.length) return;
      [nextCalendar.timeline[index], nextCalendar.timeline[target]] = [nextCalendar.timeline[target], nextCalendar.timeline[index]];
    }
    render(nextCalendar);
  }

  function handleListChange(event) {
    if (event.target.matches("[data-calendar-current]") && event.target.checked) {
      list.querySelectorAll("[data-calendar-current]").forEach(checkbox => {
        if (checkbox !== event.target) checkbox.checked = false;
      });
      return;
    }
    if (event.target.matches("[data-calendar-marker]")) render(collect());
  }

  function init() {
    form.addEventListener("submit", save);
    addEventButton.addEventListener("click", () => addEntry("diamond"));
    addLinkButton.addEventListener("click", () => addEntry("link"));
    list.addEventListener("click", handleListClick);
    list.addEventListener("change", handleListChange);
  }

  window.CalendarAdmin = { init, load };
})();
