(() => {
  const viewTitles = { dashboard: "Dashboard", players: "Personaggi", board: "Bacheca", adventures: "Avventure", calendar: "Calendario", cards: "Carte stampabili", cassa: "Cassa Distretto", info: "Info" };
  const viewPanels = [...document.querySelectorAll("[data-panel]")];
  const viewButtons = [...document.querySelectorAll("[data-view]")];
  const title = document.getElementById("view-title");
  const connectButton = document.getElementById("connect-button");
  const connectionLabel = document.getElementById("connection-label");
  const globalMessage = document.getElementById("global-message");
  let connected = false;

  function showMessage(text, kind = "") {
    globalMessage.textContent = text;
    globalMessage.dataset.kind = kind;
  }

  function setRepositoryReady(ready) {
    document.querySelectorAll("[data-requires-repository]").forEach(section => {
      section.inert = !ready;
      section.setAttribute("aria-disabled", String(!ready));
    });
  }

  async function openView(view) {
    viewPanels.forEach(panel => { panel.hidden = panel.dataset.panel !== view; });
    viewButtons.forEach(button => button.classList.toggle("active", button.dataset.view === view));
    title.textContent = viewTitles[view] || viewTitles.dashboard;
    if (!connected) return;
    try {
      if (view === "players") await PlayerAdmin.load();
      if (view === "board") await BoardAdmin.load();
      if (view === "adventures") await AdventuresAdmin.load();
      if (view === "calendar") await CalendarAdmin.load();
      if (view === "cards") await CardsAdmin.load();
      if (view === "cassa") await CassaAdmin.load();
      if (view === "info") await InfoAdmin.load();
    } catch (error) {
      showMessage(`Lettura dei dati non riuscita: ${error.message}`, "error");
    }
  }

  async function connect() {
    connectButton.disabled = true;
    connectButton.textContent = "Collegamento…";
    showMessage("");
    try {
      const folderName = await LocalRepository.connect();
      connected = true;
      connectionLabel.textContent = `Cartella collegata: ${folderName}`;
      connectionLabel.title = folderName;
      await Promise.all([PlayerAdmin.load(), BoardAdmin.load(), AdventuresAdmin.load(), CalendarAdmin.load(), CardsAdmin.load(), CassaAdmin.load(), InfoAdmin.load()]);
      setRepositoryReady(true);
      showMessage("Cartella pronta. Le modifiche verranno scritte nei file del progetto.", "success");
    } catch (error) {
      if (error.name === "AbortError") {
        showMessage("Selezione annullata. Nessun file è stato modificato.");
        return;
      }
      connected = false;
      setRepositoryReady(false);
      connectionLabel.textContent = "Cartella non collegata";
      showMessage(error.message, "error");
    } finally {
      connectButton.disabled = false;
      connectButton.textContent = connected ? "Cambia cartella" : "Collega cartella";
    }
  }

  function init() {
    PlayerAdmin.init();
    BoardAdmin.init();
    AdventuresAdmin.init();
    CalendarAdmin.init();
    CardsAdmin.init();
    CassaAdmin.init();
    InfoAdmin.init();
    setRepositoryReady(false);
    viewButtons.forEach(button => button.addEventListener("click", () => openView(button.dataset.view)));
    connectButton.addEventListener("click", connect);
    if (!window.isSecureContext || typeof window.showDirectoryPicker !== "function") {
      showMessage("L’accesso diretto ai file richiede Chrome o Edge aggiornato. Apri questa pagina nel browser e prova di nuovo.", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
