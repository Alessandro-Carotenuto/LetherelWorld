(() => {
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  function slugify(value) {
    return String(value ?? "").toLocaleLowerCase("it").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function formatClass(value) {
    return escapeHtml(value || "—")
      .replace(/\s*\[\s*([^\]]+?)\s*\]/g, ' <span class="class-archetype">[$1]</span>')
      .replace(/\)\s+(?=[A-ZÀ-ÖØ-Þ])/g, ")<br>");
  }

  function renderSong(song, playerName) {
    if (!song?.titolo || !song?.file) return "";

    const shortName = String(playerName).trim().split(/\s+/)[0] || String(playerName);
    const titleId = `mood-title-${slugify(shortName)}`;
    const safeName = escapeHtml(shortName);
    const safeFile = escapeHtml(song.file);
    return `<div class="mood-player" data-character="${safeName}">
      <div class="mood-player-heading">
        <strong>Mood Song</strong>
        <div class="mood-player-actions">
          <button class="mood-info" type="button" aria-label="Mostra il nome della canzone di ${safeName}" aria-expanded="false" aria-controls="${titleId}">i</button>
          <a class="mood-download" href="${safeFile}" download="Mood Song - ${safeName}.mp3" aria-label="Scarica la Mood Song di ${safeName}" title="Scarica la canzone"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.75v8.5m0 0 3-3m-3 3-3-3M3 10.75v3.5h10v-3.5"/></svg></a>
        </div>
        <span class="mood-song-popup" id="${titleId}" role="tooltip" hidden>${escapeHtml(song.titolo)}</span>
      </div>
      <button class="mood-play" type="button" aria-label="Riproduci Mood Song: ${safeName}"><span aria-hidden="true">▶</span></button>
      <div class="mood-player-controls">
        <input class="mood-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Avanzamento Mood Song: ${safeName}" disabled>
        <div class="mood-time"><span class="mood-current">0:00</span><span class="mood-total">0:00</span></div>
      </div>
      <audio class="mood-audio" preload="metadata" src="${safeFile}"></audio>
    </div>`;
  }

  function createPlayerCard(player, options = {}) {
    if (!player?.nome) return "";

    const name = String(player.nome);
    const descriptions = Array.isArray(player.descrizione)
      ? player.descrizione
      : player.descrizione ? [player.descrizione] : [];
    const achievements = Array.isArray(player.imprese) ? player.imprese : [];
    const image = typeof player.immagine === "string" ? player.immagine.trim() : "";
    const statusClass = player.ALive === false ? " member-dead" : "";
    const layoutClass = options.fullWidth || options.coordinator ? " member-fullwidth" : "";
    const coordinatorClass = options.coordinator ? " member-coordinator" : "";
    const imageMarkup = image
      ? `<img class="member-portrait" src="${escapeHtml(image)}" alt="Ritratto di ${escapeHtml(name)}" loading="lazy">`
      : `<i class="image-placeholder" role="img" aria-label="Ritratto non disponibile per ${escapeHtml(name)}"></i>`;
    const achievementMarkup = achievements.length
      ? `<div class="member-achievements"><h4>Imprese</h4><ul>${achievements.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
      : "";

    return `<article class="member${layoutClass}${coordinatorClass}${statusClass}" id="${escapeHtml(options.anchor || `personaggio-${slugify(name)}`)}">
      ${imageMarkup}
      <div class="member-copy">
        <h3>${escapeHtml(name)}</h3>
        <dl class="member-facts">
          <div><dt>Classe</dt><dd>${formatClass(player.classe)}</dd></div>
          <div><dt>Razza</dt><dd>${escapeHtml(player.razza || "—")}</dd></div>
          <div><dt>Background</dt><dd>${escapeHtml(player.background || "—")}</dd></div>
        </dl>
        <div class="member-description">${descriptions.map(line => `<p>${escapeHtml(line)}</p>`).join("")}${renderSong(player.song, name)}</div>
      </div>
      ${achievementMarkup}
    </article>`;
  }

  function insertPlayerCard(container, player, options = {}) {
    if (!container) return null;
    const markup = createPlayerCard(player, options);
    if (!markup) return null;

    container.insertAdjacentHTML("beforeend", markup);
    const card = container.lastElementChild;
    const portrait = card.querySelector(".member-portrait");
    if (portrait) {
      portrait.addEventListener("error", () => {
        const placeholder = document.createElement("i");
        placeholder.className = "image-placeholder";
        placeholder.setAttribute("role", "img");
        placeholder.setAttribute("aria-label", `Ritratto non disponibile per ${player.nome}`);
        portrait.replaceWith(placeholder);
      }, { once: true });
    }
    return card;
  }

  function coordinatorOptions(options = {}) {
    return { ...options, fullWidth: true, coordinator: true };
  }

  function createCoordinatorCard(player, options = {}) {
    return createPlayerCard(player, coordinatorOptions(options));
  }

  function insertCoordinatorCard(container, player, options = {}) {
    return insertPlayerCard(container, player, coordinatorOptions(options));
  }

  window.createPlayerCard = createPlayerCard;
  window.insertPlayerCard = insertPlayerCard;
  window.createCoordinatorCard = createCoordinatorCard;
  window.insertCoordinatorCard = insertCoordinatorCard;
})();
