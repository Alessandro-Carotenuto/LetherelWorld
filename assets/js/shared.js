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

  async function loadJson(url, { context, resource = context, validate, invalidMessage, fallback }) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${resource} JSON non disponibile (HTTP ${response.status}).`);

      const data = await response.json();
      if (validate && !validate(data)) throw new Error(invalidMessage);
      return data;
    } catch (error) {
      console.warn(`[${context}] JSON non caricato.`, error);
      return typeof fallback === "function" ? fallback() : fallback;
    }
  }

  window.LetherelShared = { escapeHtml, loadJson };
})();
