(() => {
  const infoPath = "assets/data/info.json";
  const form = document.getElementById("info-form");
  const titleInput = document.getElementById("info-title");
  const sectionsRoot = document.getElementById("info-sections");
  const message = document.getElementById("info-message");
  let info = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
  }

  function setMessage(text, kind = "") {
    message.textContent = text;
    message.dataset.kind = kind;
  }

  function listItemMarkup(item, index) {
    const text = typeof item === "string" ? item : item?.text;
    const href = typeof item === "object" ? item?.href : "";
    return `<div class="info-bullet-row" data-info-bullet>
      <label>Voce elenco<input data-info-bullet-text value="${escapeHtml(text)}" maxlength="300" placeholder="Testo della voce"></label>
      <label>Link <small>Facoltativo</small><input data-info-bullet-href value="${escapeHtml(href)}" placeholder="https://…"></label>
      <button class="record-action danger" type="button" data-remove-info-bullet="${index}" aria-label="Rimuovi voce elenco" title="Rimuovi voce">×</button>
    </div>`;
  }

  function sectionMarkup(section, index) {
    const list = Array.isArray(section.list) ? section.list : [];
    return `<fieldset class="admin-fieldset info-editor-section" data-info-section="${index}">
      <legend>Sottosezione ${index + 1}</legend>
      <div class="admin-form-grid">
        <label class="form-span">Sottotitolo<input data-info-subtitle value="${escapeHtml(section.subtitle)}" maxlength="140" placeholder="Es. Pozioni di cura"></label>
        <label class="form-span">Paragrafo <small>Per più paragrafi, separali con una riga vuota.</small><textarea data-info-paragraph rows="4" placeholder="Testo della regola">${escapeHtml(section.paragraph)}</textarea></label>
        <div class="form-span info-bullet-editor">
          <div class="info-bullet-heading"><span>Elenco puntato <small>Facoltativo</small></span><button type="button" class="admin-button secondary" data-add-info-bullet="${index}">Aggiungi voce</button></div>
          <div class="info-bullet-list">${list.length ? list.map(listItemMarkup).join("") : '<p class="empty-state">Nessuna voce elenco.</p>'}</div>
        </div>
        <div class="form-span info-section-actions"><button type="button" class="admin-button secondary" data-remove-info-section="${index}">Rimuovi sottosezione</button></div>
      </div>
    </fieldset>`;
  }

  function render(nextInfo = info) {
    if (!nextInfo) return;
    info = nextInfo;
    titleInput.value = String(info.title || "");
    sectionsRoot.innerHTML = info.sections.length
      ? info.sections.map(sectionMarkup).join("")
      : '<p class="empty-state">Aggiungi una sottosezione per iniziare.</p>';
  }

  function collect() {
    const sections = [...sectionsRoot.querySelectorAll("[data-info-section]")].map(section => ({
      subtitle: section.querySelector("[data-info-subtitle]").value.trim(),
      paragraph: section.querySelector("[data-info-paragraph]").value.trim(),
      list: [...section.querySelectorAll("[data-info-bullet]")].map(row => ({
        text: row.querySelector("[data-info-bullet-text]").value.trim(),
        href: row.querySelector("[data-info-bullet-href]").value.trim()
      })).filter(item => item.text || item.href).map(item => item.href ? item : { text: item.text })
    }));
    return { ...info, title: titleInput.value.trim(), sections };
  }

  function validHref(href) {
    return /^(https?:\/\/|\.\.?\/|\/|#)/i.test(href);
  }

  async function load() {
    const data = await LocalRepository.readJson(infoPath);
    if (!data || typeof data.title !== "string" || !Array.isArray(data.sections)) {
      throw new Error("Il JSON di Info deve contenere un titolo e l’elenco delle sottosezioni.");
    }
    render(data);
  }

  async function save(event) {
    event.preventDefault();
    setMessage("");
    try {
      const nextInfo = collect();
      if (!nextInfo.title) throw new Error("Inserisci il titolo della scheda.");
      if (!nextInfo.sections.length) throw new Error("Aggiungi almeno una sottosezione.");
      nextInfo.sections.forEach((section, sectionIndex) => {
        if (!section.subtitle) throw new Error(`Inserisci il sottotitolo della sottosezione ${sectionIndex + 1}.`);
        section.list.forEach((item, itemIndex) => {
          if (!item.text) throw new Error(`Inserisci il testo della voce ${itemIndex + 1} in “${section.subtitle}”.`);
          if (item.href && !validHref(item.href)) throw new Error(`Il link della voce “${item.text}” deve iniziare con http://, https://, /, ./, ../ o #.`);
        });
      });
      await LocalRepository.writeJson(infoPath, nextInfo);
      render(nextInfo);
      setMessage("Contenuti della pagina Info aggiornati.", "success");
    } catch (error) {
      setMessage(`Salvataggio non completato: ${error.message}`, "error");
    }
  }

  function init() {
    form.addEventListener("submit", save);
    document.getElementById("info-add-section").addEventListener("click", () => {
      const nextInfo = collect();
      nextInfo.sections.push({ subtitle: "", paragraph: "", list: [] });
      render(nextInfo);
      sectionsRoot.lastElementChild?.querySelector("[data-info-subtitle]")?.focus();
    });
    sectionsRoot.addEventListener("click", event => {
      const addBullet = event.target.closest("[data-add-info-bullet]");
      const removeBullet = event.target.closest("[data-remove-info-bullet]");
      const removeSection = event.target.closest("[data-remove-info-section]");
      if (!addBullet && !removeBullet && !removeSection) return;

      const nextInfo = collect();
      const sectionElement = (addBullet || removeBullet || removeSection).closest("[data-info-section]");
      const index = Number(sectionElement?.dataset.infoSection);
      if (!Number.isInteger(index) || !nextInfo.sections[index]) return;
      if (addBullet) nextInfo.sections[index].list.push({ text: "", href: "" });
      else if (removeBullet) nextInfo.sections[index].list.splice(Number(removeBullet.dataset.removeInfoBullet), 1);
      else nextInfo.sections.splice(index, 1);
      render(nextInfo);
    });
  }

  window.InfoAdmin = { init, load };
})();
