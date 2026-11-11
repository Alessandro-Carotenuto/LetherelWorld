(() => {
  const manifestPath = "assets/player-cards/index.json";
  const rosterPath = "assets/player-cards/roster.json";
  const form = document.getElementById("player-form");
  const list = document.getElementById("player-list");
  const count = document.getElementById("player-count");
  const message = document.getElementById("player-message");
  const formTitle = document.getElementById("player-form-title");
  const formKicker = document.getElementById("player-form-kicker");
  const submitButton = document.getElementById("player-submit");
  const cancelButton = document.getElementById("player-cancel");
  let manifest = [];
  let roster = {};
  let players = [];
  let editingFile = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  }

  function normalize(value) {
    return String(value ?? "").toLocaleLowerCase("it").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
  }

  function slugify(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function lines(value) {
    return String(value ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }

  function setMessage(text, kind = "") {
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function rankOf(name) {
    return Object.entries(roster).find(([, names]) => names.some(item => normalize(item) === normalize(name)))?.[0] || "?";
  }

  async function load() {
    manifest = await LocalRepository.readJson(manifestPath);
    roster = await LocalRepository.readJson(rosterPath);
    if (!Array.isArray(manifest) || !roster || typeof roster !== "object") {
      throw new Error("Manifest o roster non hanno il formato previsto.");
    }
    players = await Promise.all(manifest.map(async file => ({
      file,
      data: await LocalRepository.readJson(`assets/player-cards/${file}`)
    })));
    render();
  }

  function render() {
    count.textContent = String(players.length);
    if (!players.length) {
      list.innerHTML = '<p class="empty-state">Nessun personaggio nel manifest.</p>';
      return;
    }
    const playerByName = new Map(players.map(player => [normalize(player.data.nome), player]));
    const listedFiles = new Set();
    const sections = Object.entries(roster).sort(([left], [right]) => Number(left) - Number(right)).map(([rank, names]) => {
      const rows = (Array.isArray(names) ? names : []).map((name, index) => {
        const player = playerByName.get(normalize(name));
        if (!player) return `<article class="record-row record-row-missing"><div class="record-copy"><strong>${escapeHtml(name)}</strong><small>Rango ${escapeHtml(rank)} · JSON non trovato</small></div></article>`;
        listedFiles.add(player.file);
        return `<article class="record-row">
          <div class="record-copy"><strong>${escapeHtml(player.data.nome || player.file)}</strong><small>Rango ${escapeHtml(rank)} · ${escapeHtml(player.file)}</small></div>
          <div class="record-actions"><button type="button" class="record-action" data-move-player="${escapeHtml(player.file)}" data-player-rank="${escapeHtml(rank)}" data-delta="-1" aria-label="Sposta ${escapeHtml(name)} su" title="Sposta su" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" class="record-action" data-move-player="${escapeHtml(player.file)}" data-player-rank="${escapeHtml(rank)}" data-delta="1" aria-label="Sposta ${escapeHtml(name)} giù" title="Sposta giù" ${index === names.length - 1 ? "disabled" : ""}>↓</button><button type="button" class="record-action" data-edit-player="${escapeHtml(player.file)}" aria-label="Modifica ${escapeHtml(name)}" title="Modifica">✎</button><button type="button" class="record-action danger" data-remove-player="${escapeHtml(player.file)}" aria-label="Rimuovi ${escapeHtml(name)}" title="Rimuovi">×</button></div>
        </article>`;
      }).join("");
      if (!rows) return "";
      const heading = rank === "3" ? "Coordinatore · Rango 3" : `Rango ${rank}`;
      return `<section class="record-section"><h4>${escapeHtml(heading)}</h4><div class="record-section-list">${rows}</div></section>`;
    }).join("");
    const unassigned = players.filter(player => !listedFiles.has(player.file)).map(({ file, data }) => `<article class="record-row">
      <div class="record-copy"><strong>${escapeHtml(data.nome || file)}</strong><small>Non assegnato · ${escapeHtml(file)}</small></div>
      <div class="record-actions"><button type="button" class="record-action" data-edit-player="${escapeHtml(file)}" aria-label="Modifica ${escapeHtml(data.nome || file)}" title="Modifica">✎</button><button type="button" class="record-action danger" data-remove-player="${escapeHtml(file)}" aria-label="Rimuovi ${escapeHtml(data.nome || file)}" title="Rimuovi">×</button></div>
    </article>`).join("");
    list.innerHTML = `${sections}${unassigned ? `<section class="record-section"><h4>Non assegnati a un rango</h4><div class="record-section-list">${unassigned}</div></section>` : ""}`;
  }

  function resetEditor() {
    editingFile = null;
    form.reset();
    formTitle.textContent = "Aggiungi personaggio";
    formKicker.textContent = "Nuova scheda";
    submitButton.textContent = "Crea scheda";
    cancelButton.hidden = true;
  }

  function edit(file) {
    const current = players.find(player => player.file === file);
    if (!current) return;
    const player = current.data;
    editingFile = file;
    form.elements.namedItem("nome").value = player.nome || "";
    form.elements.namedItem("rango").value = rankOf(player.nome) === "?" ? "1" : rankOf(player.nome);
    form.elements.namedItem("classe").value = player.classe || "";
    form.elements.namedItem("razza").value = player.razza || "";
    form.elements.namedItem("background").value = player.background || "";
    form.elements.namedItem("descrizione").value = (Array.isArray(player.descrizione) ? player.descrizione : [player.descrizione || ""]).join("\n");
    form.elements.namedItem("immagine").value = player.immagine || "";
    form.elements.namedItem("imprese").value = (player.imprese || []).join("\n");
    form.elements.namedItem("song-titolo").value = player.song?.titolo || "";
    form.elements.namedItem("song-file").value = player.song?.file || "";
    form.elements.namedItem("ALive").checked = player.ALive !== false;
    formTitle.textContent = `Modifica ${player.nome}`;
    formKicker.textContent = "Scheda esistente";
    submitButton.textContent = "Salva modifiche";
    cancelButton.hidden = false;
    setMessage("Modifica i campi e salva per aggiornare la scheda esistente.");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function buildPlayer(values) {
    const songTitle = String(values.get("song-titolo") || "").trim();
    const songFile = String(values.get("song-file") || "").trim();
    if (Boolean(songTitle) !== Boolean(songFile)) {
      throw new Error("Per la Mood Song servono sia il titolo sia il percorso del file.");
    }
    return {
      nome: String(values.get("nome") || "").trim(),
      ALive: values.get("ALive") === "on",
      classe: String(values.get("classe") || "").trim(),
      razza: String(values.get("razza") || "").trim(),
      background: String(values.get("background") || "").trim(),
      descrizione: lines(values.get("descrizione")),
      immagine: String(values.get("immagine") || "").trim(),
      imprese: lines(values.get("imprese")),
      song: songTitle ? { titolo: songTitle, file: songFile } : null
    };
  }

  function rosterAfterChange(previousName, nextName, nextRank) {
    const oldRank = rankOf(previousName);
    const oldIndex = Array.isArray(roster[oldRank])
      ? roster[oldRank].findIndex(name => normalize(name) === normalize(previousName))
      : -1;
    const nextRoster = Object.fromEntries(Object.entries(roster).map(([rank, names]) => [
      rank,
      Array.isArray(names) ? names.filter(name => normalize(name) !== normalize(previousName)) : []
    ]));
    if (!Array.isArray(nextRoster[nextRank])) nextRoster[nextRank] = [];
    if (oldRank === nextRank && oldIndex >= 0) nextRoster[nextRank].splice(Math.min(oldIndex, nextRoster[nextRank].length), 0, nextName);
    else nextRoster[nextRank].push(nextName);
    return nextRoster;
  }

  async function save(event) {
    event.preventDefault();
    setMessage("");
    try {
      const values = new FormData(form);
      const previous = editingFile ? players.find(item => item.file === editingFile) : null;
      if (editingFile && !previous) throw new Error("La scheda da modificare non è più nell’elenco. Ricarica i dati.");
      const player = buildPlayer(values);
      const name = player.nome;
      const rank = String(values.get("rango") || "1");
      const slug = slugify(name);
      if (!name || !slug) throw new Error("Inserisci un nome valido.");
      if (players.some(item => item.file !== editingFile && normalize(item.data.nome) === normalize(name))) {
        throw new Error("Esiste già un personaggio con questo nome.");
      }
      const file = `${slug}.json`;
      const renamed = Boolean(previous && file !== editingFile);
      if ((renamed || !previous) && (manifest.includes(file) || await LocalRepository.exists(`assets/player-cards/${file}`))) {
        throw new Error(`Esiste già il file ${file}. Scegli un nome diverso o rinomina il file esistente.`);
      }

      const nextManifest = previous
        ? manifest.map(item => item === editingFile ? file : item)
        : [...manifest, file];
      const nextRoster = previous
        ? rosterAfterChange(previous.data.nome, name, rank)
        : { ...roster, [rank]: [...(Array.isArray(roster[rank]) ? roster[rank] : []), name] };
      const previousFile = editingFile;
      try {
        await LocalRepository.writeJson(`assets/player-cards/${file}`, player, { create: !previous || renamed });
        await LocalRepository.writeJson(manifestPath, nextManifest);
        await LocalRepository.writeJson(rosterPath, nextRoster);
        if (renamed) await LocalRepository.removeFile(`assets/player-cards/${previousFile}`);
      } catch (error) {
        const rollback = [
          LocalRepository.writeJson(manifestPath, manifest),
          LocalRepository.writeJson(rosterPath, roster)
        ];
        if (previous) rollback.push(LocalRepository.writeJson(`assets/player-cards/${previousFile}`, previous.data, { create: true }));
        if (!previous || renamed) rollback.push(LocalRepository.removeFile(`assets/player-cards/${file}`));
        await Promise.allSettled(rollback);
        throw error;
      }
      resetEditor();
      setMessage(previous ? `${name} aggiornato.` : `${name} aggiunto al Rango ${rank}.`, "success");
      await load();
    } catch (error) {
      setMessage(`Salvataggio non completato: ${error.message}`, "error");
    }
  }

  async function remove(file) {
    const player = players.find(item => item.file === file);
    if (!player || !window.confirm(`Rimuovere ${player.data.nome} dal roster e cancellare ${file}? Immagine e audio non verranno eliminati.`)) return;

    const nextManifest = manifest.filter(item => item !== file);
    const nextRoster = Object.fromEntries(Object.entries(roster).map(([rank, names]) => [
      rank,
      Array.isArray(names) ? names.filter(name => normalize(name) !== normalize(player.data.nome)) : []
    ]));
    try {
      await LocalRepository.removeFile(`assets/player-cards/${file}`);
      try {
        await LocalRepository.writeJson(manifestPath, nextManifest);
        await LocalRepository.writeJson(rosterPath, nextRoster);
      } catch (error) {
        await Promise.allSettled([
          LocalRepository.writeJson(`assets/player-cards/${file}`, player.data, { create: true }),
          LocalRepository.writeJson(manifestPath, manifest),
          LocalRepository.writeJson(rosterPath, roster)
        ]);
        throw error;
      }
      if (editingFile === file) resetEditor();
      setMessage(`${player.data.nome} rimosso dal roster.`, "success");
      await load();
    } catch (error) {
      setMessage(`Rimozione non completata: ${error.message}`, "error");
    }
  }

  async function move(file, rank, delta) {
    const player = players.find(item => item.file === file);
    const names = Array.isArray(roster[rank]) ? [...roster[rank]] : null;
    if (!player || !names) return;
    const index = names.findIndex(name => normalize(name) === normalize(player.data.nome));
    const target = index + delta;
    if (index < 0 || target < 0 || target >= names.length) return;
    [names[index], names[target]] = [names[target], names[index]];
    const nextRoster = { ...roster, [rank]: names };
    try {
      await LocalRepository.writeJson(rosterPath, nextRoster);
      roster = nextRoster;
      render();
      setMessage(`${player.data.nome} spostato nella sezione Rango ${rank}.`, "success");
    } catch (error) {
      setMessage(`Riordino non completato: ${error.message}`, "error");
    }
  }

  function init() {
    form.addEventListener("submit", save);
    cancelButton.addEventListener("click", resetEditor);
    list.addEventListener("click", event => {
      const editButton = event.target.closest("[data-edit-player]");
      const removeButton = event.target.closest("[data-remove-player]");
      const moveButton = event.target.closest("[data-move-player]");
      if (editButton) edit(editButton.dataset.editPlayer);
      else if (removeButton) remove(removeButton.dataset.removePlayer);
      else if (moveButton) move(moveButton.dataset.movePlayer, moveButton.dataset.playerRank, Number(moveButton.dataset.delta));
    });
  }

  window.PlayerAdmin = { init, load };
})();
