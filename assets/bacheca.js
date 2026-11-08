(() => {
  const dataUrl = "./assets/bacheca.json";
  let boardPromise;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  function loadBoard() {
    if (!boardPromise) {
      boardPromise = fetch(dataUrl, { cache: "no-store" })
        .then(response => {
          if (!response.ok) throw new Error(`Bacheca JSON non disponibile (HTTP ${response.status}).`);
          return response.json();
        })
        .then(board => {
          if (!board?.page || !Array.isArray(board.missions)) {
            throw new Error("Il JSON della Bacheca non contiene pagina e missioni.");
          }
          return board;
        })
        .catch(error => {
          boardPromise = null;
          throw error;
        });
    }
    return boardPromise;
  }

  function createMissionCard(mission, board = {}) {
    if (!mission?.title) return "";

    const labels = board.labels || {};
    const artwork = mission.artwork || {};
    const imageMarkup = artwork.src
      ? `<img class="mission-art" src="${escapeHtml(artwork.src)}" alt="${escapeHtml(artwork.alt || "")}" loading="lazy">`
      : `<div class="mission-art image-placeholder" role="img" aria-label="Immagine non disponibile per ${escapeHtml(mission.title)}"></div>`;
    const companions = mission.companions || {};
    const companionEntries = [
      ...(Array.isArray(companions.fixed) ? companions.fixed : []),
      ...(companions.alternatives?.names?.length
        ? [companions.alternatives.names.join(` ${companions.alternatives.joiner || "o"} `)]
        : [])
    ];
    const companionMarkup = companionEntries.length
      ? `<div class="mission-companions"><strong>${escapeHtml(labels.recommendedCompanions || "Compagni consigliati")}</strong><ul class="mission-companion-list">${companionEntries.map(name => `<li>${escapeHtml(name)}</li>`).join("")}</ul></div>`
      : "";
    const profileMarkup = (Array.isArray(mission.profile) ? mission.profile : []).map(metric => {
      const maximum = Math.max(0, Math.min(20, Number(metric.maximum) || 0));
      const value = Math.max(0, Math.min(maximum, Number(metric.value) || 0));
      return `<div class="metric">${escapeHtml(metric.label)}<strong aria-label="${value} su ${maximum}">${"■".repeat(value)}<span class="empty-bar">${"□".repeat(maximum - value)}</span></strong></div>`;
    }).join("");
    const reward = mission.reward || {};
    const rewardDetails = [reward.distribution, reward.note].filter(Boolean).map(escapeHtml).join(" · ");
    const duration = mission.duration;
    const durationMarkup = duration?.count != null
      ? `<span class="mission-duration"><span class="duration-content">${duration.approximate ? '<span class="duration-approx">≈</span>' : ""}<strong class="duration-number">${escapeHtml(duration.count)}</strong><span class="duration-unit">${escapeHtml(duration.unit)}</span></span></span>`
      : "";

    return `<article class="mission-card" data-mission-id="${escapeHtml(mission.id)}">
      ${imageMarkup}
      <div class="card-kicker"><span>${escapeHtml(mission.location)}</span></div>
      <h3>${escapeHtml(mission.title)}</h3>
      <p class="contractor">${escapeHtml(labels.contractor || "Contraente")} · ${escapeHtml(mission.contract?.client)}</p>
      <p>${escapeHtml(mission.contract?.description)}</p>
      ${companionMarkup}
      <div class="mission-bars">${profileMarkup}</div>
      <div class="mission-bottom">
        <span class="reward">${escapeHtml(reward.amount)}<small>${rewardDetails}</small></span>
        <div class="mission-bottom-meta">${durationMarkup}</div>
      </div>
    </article>`;
  }

  function insertMissionCard(container, mission, board = {}) {
    if (!container) return null;
    const markup = createMissionCard(mission, board);
    if (!markup) return null;

    container.insertAdjacentHTML("beforeend", markup);
    return container.lastElementChild;
  }

  function loadingMarkup() {
    return `<section class="page-intro"><div class="eyebrow">${escapeHtml("Distretto Rovere")}</div><h1 class="page-title">Bacheca</h1><p class="page-lede" role="status">Caricamento delle missioni…</p></section>`;
  }

  function createBoardMarkup(page) {
    return `<section class="page-intro"><div class="eyebrow">${escapeHtml(page.district)}</div><h1 class="page-title">${escapeHtml(page.title)}</h1>${(page.introduction || []).map(paragraph => `<p class="page-lede">${escapeHtml(paragraph)}</p>`).join("")}</section><div class="card-grid" data-mission-grid></div>`;
  }

  async function renderBacheca(root, isCurrent = () => true) {
    try {
      const board = await loadBoard();
      if (!isCurrent()) return;

      root.innerHTML = createBoardMarkup(board.page);
      const grid = root.querySelector("[data-mission-grid]");
      board.missions.forEach(mission => insertMissionCard(grid, mission, board));

      const count = document.querySelector("[data-bacheca-count]");
      if (count) count.textContent = String(board.missions.length);
    } catch (error) {
      console.error("[bacheca] Impossibile caricare le missioni.", error);
      if (isCurrent()) {
        const message = window.location?.protocol === "file:"
          ? "Hai aperto index.html come file locale: il browser blocca il caricamento del JSON. Avvia Avvia-LetherelWorld.bat oppure visita la versione pubblicata su GitHub Pages."
          : "Non è stato possibile caricare le missioni. Verifica che assets/bacheca.json sia disponibile e ricarica la pagina.";
        root.innerHTML = `<section class="page-intro"><div class="eyebrow">Distretto Rovere</div><h1 class="page-title">Bacheca</h1><p class="page-lede" role="alert">${escapeHtml(message)}</p></section>`;
      }
    }
  }

  window.LetherelBacheca = {
    createMissionCard,
    insertMissionCard,
    loadingMarkup,
    loadBoard,
    render: renderBacheca
  };
})();
