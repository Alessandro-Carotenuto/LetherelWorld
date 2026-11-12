(() => {
  const boardPath = "assets/data/bacheca.json";
  const form = document.getElementById("mission-form");
  const list = document.getElementById("mission-list");
  const count = document.getElementById("mission-count");
  const message = document.getElementById("mission-message");
  const formTitle = document.getElementById("mission-form-title");
  const formKicker = document.getElementById("mission-form-kicker");
  const submitButton = document.getElementById("mission-submit");
  const cancelButton = document.getElementById("mission-cancel");
  let board = null;
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

  async function load() {
    board = await LocalRepository.readJson(boardPath);
    if (!board?.page || !Array.isArray(board.missions)) throw new Error("Il JSON della Bacheca non ha la struttura prevista.");
    render();
  }

  function render() {
    count.textContent = String(board.missions.length);
    if (!board.missions.length) {
      list.innerHTML = '<p class="empty-state">Nessuna missione in Bacheca.</p>';
      return;
    }
    list.innerHTML = board.missions.map((mission, index) => `<article class="record-row">
      <div class="record-copy"><strong>${escapeHtml(mission.title || "Senza titolo")}</strong><small>${escapeHtml(mission.location || "Luogo non indicato")} · ${escapeHtml(mission.id)}</small></div>
      <div class="record-actions">
        <button type="button" class="record-action" data-edit-mission="${index}" aria-label="Modifica ${escapeHtml(mission.title)}" title="Modifica">✎</button>
        <button type="button" class="record-action" data-move-mission="${index}" data-delta="-1" aria-label="Sposta ${escapeHtml(mission.title)} in alto" title="Sposta su" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="record-action" data-move-mission="${index}" data-delta="1" aria-label="Sposta ${escapeHtml(mission.title)} in basso" title="Sposta giù" ${index === board.missions.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="record-action danger" data-remove-mission="${index}" aria-label="Rimuovi ${escapeHtml(mission.title)}" title="Rimuovi">×</button>
      </div>
    </article>`).join("");
  }

  function resetEditor() {
    editingIndex = null;
    form.reset();
    formTitle.textContent = "Aggiungi missione";
    formKicker.textContent = "Nuovo incarico";
    submitButton.textContent = "Aggiungi missione";
    cancelButton.hidden = true;
  }

  function edit(index) {
    const mission = board.missions[index];
    if (!mission) return;
    editingIndex = index;
    const profile = Object.fromEntries((mission.profile || []).map(metric => [metric.label, metric.value]));
    const companions = mission.companions || {};
    form.elements.namedItem("title").value = mission.title || "";
    form.elements.namedItem("location").value = mission.location || "";
    form.elements.namedItem("client").value = mission.contract?.client || "";
    form.elements.namedItem("description").value = mission.contract?.description || "";
    form.elements.namedItem("image").value = mission.artwork?.src || "";
    form.elements.namedItem("image-alt").value = mission.artwork?.alt || "";
    form.elements.namedItem("companions-fixed").value = (companions.fixed || []).join("\n");
    form.elements.namedItem("companions-alternatives").value = (companions.alternatives?.names || []).join("\n");
    form.elements.namedItem("profile-roleplay").value = profile.Roleplay ?? 0;
    form.elements.namedItem("profile-combat").value = profile.Combattimento ?? 0;
    form.elements.namedItem("profile-investigation").value = profile.Indagine ?? 0;
    form.elements.namedItem("reward-amount").value = mission.reward?.amount || "";
    form.elements.namedItem("reward-distribution").value = mission.reward?.distribution || "";
    form.elements.namedItem("reward-note").value = mission.reward?.note || "";
    form.elements.namedItem("duration-count").value = mission.duration?.count ?? "";
    form.elements.namedItem("duration-unit").value = mission.duration?.unit || "sessioni";
    form.elements.namedItem("duration-approximate").checked = mission.duration?.approximate === true;
    formTitle.textContent = `Modifica ${mission.title}`;
    formKicker.textContent = "Incarico esistente";
    submitButton.textContent = "Salva modifiche";
    cancelButton.hidden = false;
    setMessage("Modifica i campi e salva per aggiornare questa missione.");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createMission(values, existing = null) {
    const title = String(values.get("title") || "").trim();
    const baseId = slugify(title);
    if (!title || !baseId) throw new Error("Inserisci un titolo valido.");

    let id = existing?.id;
    if (!id) {
      const usedIds = new Set(board.missions.map(mission => mission.id));
      id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    }

    const profileLabels = [
      ["Roleplay", "profile-roleplay"],
      ["Combattimento", "profile-combat"],
      ["Indagine", "profile-investigation"]
    ];
    const profile = profileLabels.map(([label, name]) => {
      const value = Number(values.get(name));
      if (!Number.isInteger(value) || value < 0 || value > 3) throw new Error(`${label}: scegli un valore tra 0 e 3.`);
      return { label, value, maximum: 3 };
    });
    profile.push(...(existing?.profile || []).filter(metric => !profileLabels.some(([label]) => label === metric.label)));

    const image = String(values.get("image") || "").trim();
    const alternatives = lines(values.get("companions-alternatives"));
    const countText = String(values.get("duration-count") || "").trim();
    const durationCount = countText ? Number(countText) : null;
    if (durationCount != null && (!Number.isInteger(durationCount) || durationCount < 1)) {
      throw new Error("La durata deve essere un numero intero positivo o restare vuota.");
    }

    return {
      ...(existing || {}),
      id,
      title,
      artwork: { ...(existing?.artwork || {}), src: image, alt: String(values.get("image-alt") || "").trim() },
      location: String(values.get("location") || "").trim(),
      contract: {
        ...(existing?.contract || {}),
        client: String(values.get("client") || "").trim(),
        description: String(values.get("description") || "").trim()
      },
      companions: {
        ...(existing?.companions || {}),
        fixed: lines(values.get("companions-fixed")),
        alternatives: { ...(existing?.companions?.alternatives || {}), names: alternatives }
      },
      profile,
      reward: {
        ...(existing?.reward || {}),
        amount: String(values.get("reward-amount") || "").trim(),
        distribution: String(values.get("reward-distribution") || "").trim(),
        note: String(values.get("reward-note") || "").trim()
      },
      duration: durationCount == null ? null : {
        ...(existing?.duration || {}),
        approximate: values.get("duration-approximate") === "on",
        count: durationCount,
        unit: String(values.get("duration-unit") || "sessioni").trim()
      }
    };
  }

  async function save(event) {
    event.preventDefault();
    setMessage("");
    try {
      const previous = editingIndex == null ? null : board.missions[editingIndex];
      if (editingIndex != null && !previous) throw new Error("La missione da modificare non è più nell’elenco. Ricarica i dati.");
      const mission = createMission(new FormData(form), previous);
      const missions = [...board.missions];
      if (editingIndex == null) missions.push(mission);
      else missions[editingIndex] = mission;
      const nextBoard = { ...board, missions };
      await LocalRepository.writeJson(boardPath, nextBoard);
      resetEditor();
      setMessage(previous ? `Missione “${mission.title}” aggiornata.` : `Missione “${mission.title}” aggiunta.`, "success");
      await load();
    } catch (error) {
      setMessage(`Salvataggio non completato: ${error.message}`, "error");
    }
  }

  async function remove(index) {
    const mission = board.missions[index];
    if (!mission || !window.confirm(`Rimuovere “${mission.title}” dalla Bacheca?`)) return;
    const nextBoard = { ...board, missions: board.missions.filter((_, itemIndex) => itemIndex !== index) };
    try {
      await LocalRepository.writeJson(boardPath, nextBoard);
      if (editingIndex === index) resetEditor();
      else if (editingIndex != null && editingIndex > index) editingIndex -= 1;
      setMessage(`Missione “${mission.title}” rimossa.`, "success");
      await load();
    } catch (error) {
      setMessage(`Rimozione non completata: ${error.message}`, "error");
    }
  }

  async function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= board.missions.length) return;
    const missions = [...board.missions];
    [missions[index], missions[target]] = [missions[target], missions[index]];
    try {
      await LocalRepository.writeJson(boardPath, { ...board, missions });
      if (editingIndex === index) editingIndex = target;
      else if (editingIndex === target) editingIndex = index;
      await load();
    } catch (error) {
      setMessage(`Riordino non completato: ${error.message}`, "error");
    }
  }

  function init() {
    form.addEventListener("submit", save);
    cancelButton.addEventListener("click", resetEditor);
    list.addEventListener("click", event => {
      const editButton = event.target.closest("[data-edit-mission]");
      const removeButton = event.target.closest("[data-remove-mission]");
      const moveButton = event.target.closest("[data-move-mission]");
      if (editButton) edit(Number(editButton.dataset.editMission));
      else if (removeButton) remove(Number(removeButton.dataset.removeMission));
      else if (moveButton) move(Number(moveButton.dataset.moveMission), Number(moveButton.dataset.delta));
    });
  }

  window.BoardAdmin = { init, load };
})();
