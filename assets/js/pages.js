(() => {
  const { escapeHtml } = window.LetherelShared;

  function renderInfoPage(data) {
    const sections = Array.isArray(data.sections) ? data.sections : [];
    const contentMarkup = sections.map(section => {
      const subtitle = String(section?.subtitle || "").trim();
      const paragraphs = String(section?.paragraph || "").split(/\r?\n\s*\r?\n/).map(text => text.trim()).filter(Boolean);
      const paragraphMarkup = paragraphs.map(text => `<p>${escapeHtml(text)}</p>`).join("");
      const items = (Array.isArray(section?.list) ? section.list : []).map(item => {
        const text = String(typeof item === "string" ? item : item?.text || "").trim();
        if (!text) return "";

        const rawHref = String(typeof item === "object" ? item?.href || "" : "").trim();
        const href = /^(https?:\/\/|\.{1,2}\/|\/|#)/i.test(rawHref) ? rawHref : "";
        const external = /^https?:\/\//i.test(href);
        const label = escapeHtml(text);
        return `<li>${href ? `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${label}</a>` : label}</li>`;
      }).join("");
      const listMarkup = items ? `<ul class="info-list">${items}</ul>` : "";

      if (!subtitle && !paragraphMarkup && !listMarkup) return "";
      return `<section class="info-subsection">${subtitle ? `<h3>${escapeHtml(subtitle)}</h3>` : ""}${paragraphMarkup}${listMarkup}</section>`;
    }).join("");

    return `<section class="page-intro"><div class="eyebrow">Regole del tavolo</div><h1 class="page-title">Info</h1><p class="page-lede">Regole e informazioni concordate per la campagna.</p></section><section class="info-section"><h2>${escapeHtml(String(data.title || "Regole aggiuntive"))}</h2>${contentMarkup || "<p>Le informazioni non sono disponibili.</p>"}</section>`;
  }

  function renderCalendarPage(data) {
    const timeline = (data.timeline || []).map(item => {
      const text = escapeHtml(String(item.text || ""));
      if (item.marker === "link") return `<div class="calendar-connector"><span class="calendar-connector-line" aria-hidden="true"></span><em class="calendar-connector-label">${text}</em></div>`;
      if (item.marker !== "diamond") return "";

      const current = item.current === true;
      const description = String(item.description || "").trim();
      const descriptionMarkup = description ? `<span class="calendar-event-description">${escapeHtml(description)}</span>` : "";
      return `<div class="calendar-event${current ? " calendar-event-current" : ""}"${current ? ' aria-current="date"' : ""}><span class="calendar-diamond" aria-hidden="true"></span><div class="calendar-event-copy"><div class="calendar-event-heading"><span class="calendar-event-date">${text}</span>${current ? `<span class="calendar-current-label"><span class="calendar-current-dot" aria-hidden="true"></span>${escapeHtml(data.currentLabel || "Tempo attuale")}</span>` : ""}</div>${descriptionMarkup}</div></div>`;
    }).join("");

    return `<article class="lore-copy"><h1>Calendario</h1><p>A Letherel il tempo si conta come nel mondo reale, fino alle settimane.</p><p>Le settimane sono raggruppate in 13 cicli lunari ogni anno, numerati in ordine: Prima Luna, Seconda Luna, Terza Luna, Quarta Luna, Quinta Luna, Sesta Luna, Settima Luna, Ottava Luna, Nona Luna, Decima Luna, Undicesima Luna, Penultima Luna e Ultima Luna.</p></article><section class="calendar-timeline" aria-label="Linea temporale">${timeline}</section>`;
  }

  function renderAdventurePage(data) {
    const entries = Array.isArray(data.adventures) ? data.adventures : [];
    const cards = entries.map(adventure => {
      const artwork = adventure.artwork || {};
      const image = artwork.src
        ? `<img class="adventure-art" src="${escapeHtml(artwork.src)}" alt="${escapeHtml(artwork.alt || "")}" loading="lazy">`
        : `<div class="adventure-art image-placeholder" role="img" aria-label="Immagine non disponibile per ${escapeHtml(adventure.title || "avventura")}"></div>`;
      const participants = Array.isArray(adventure.participants) ? adventure.participants : [];
      const participantLines = ["PC", "NPC"].map(group => {
        const names = participants
          .filter(person => person?.group === group && String(person.name || "").trim())
          .map(person => person.inactive ? `<s>${escapeHtml(person.name)}</s>` : escapeHtml(person.name));
        return names.length ? `<li><strong>${group}:</strong> ${names.join(", ")}</li>` : "";
      }).filter(Boolean);
      const participantsMarkup = participantLines.length ? `<h3>Partecipanti:</h3><ul>${participantLines.join("")}</ul>` : "";
      const detail = (label, value) => String(value ?? "").trim() ? `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>` : "";
      const players = Array.isArray(adventure.players) ? adventure.players.filter(Boolean) : [];
      const playersMarkup = players.length ? `<div class="adventure-players"><strong>Giocatori</strong><span>${players.map(escapeHtml).join(", ")}</span></div>` : "";

      return `<article class="adventure-entry">${image}<div class="adventure-details"><h2>${escapeHtml(adventure.title || "Avventura")}${adventure.subtitle ? ` <small>(${escapeHtml(adventure.subtitle)})</small>` : ""}</h2>${participantsMarkup}${detail("Contraente", adventure.contractor)}${detail("Ricompensa", adventure.reward)}${detail("Sessioni", adventure.sessions)}${detail("Note", adventure.notes)}${playersMarkup}</div></article>`;
    }).join("");

    return `<section class="page-intro"><div class="eyebrow">${escapeHtml(data.district || "Distretto Rovere")}</div><h1 class="page-title">${escapeHtml(data.title || "Avventure")}</h1></section>${cards || '<p class="empty-state">Nessuna avventura pubblicata.</p>'}`;
  }

  window.LetherelSitePages = { renderInfoPage, renderCalendarPage, renderAdventurePage };
})();
