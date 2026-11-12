(() => {
  let rootHandle = null;

  function pathParts(path) {
    const parts = String(path).split("/");
    if (!parts.length || parts.some(part => !part || part === "." || part === "..")) {
      throw new Error(`Percorso non valido: ${path}`);
    }
    return parts;
  }

  async function fileHandle(path, create = false) {
    if (!rootHandle) throw new Error("Collega prima la cartella del progetto.");
    const parts = pathParts(path);
    let directory = rootHandle;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    return { directory, file: await directory.getFileHandle(parts.at(-1), { create }) };
  }

  async function readText(path) {
    const { file } = await fileHandle(path);
    return (await file.getFile()).text();
  }

  async function readJson(path) {
    try {
      return JSON.parse(await readText(path));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`${path} non contiene JSON valido: ${error.message}`);
      throw error;
    }
  }

  async function writeText(path, content, { create = false } = {}) {
    const { file } = await fileHandle(path, create);
    const writable = await file.createWritable();
    try {
      await writable.write(content);
      await writable.close();
    } catch (error) {
      await writable.abort?.();
      throw error;
    }
  }

  function writeJson(path, value, options) {
    return writeText(path, `${JSON.stringify(value, null, 2)}\n`, options);
  }

  async function exists(path) {
    try {
      await fileHandle(path);
      return true;
    } catch (error) {
      if (error.name === "NotFoundError") return false;
      throw error;
    }
  }

  async function removeFile(path) {
    const { directory, file } = await fileHandle(path);
    await directory.removeEntry(file.name);
  }

  async function connect() {
    if (!window.isSecureContext || typeof window.showDirectoryPicker !== "function") {
      throw new Error("Serve Chrome o Edge aggiornato per autorizzare la cartella locale del progetto.");
    }

    const selectedRoot = await window.showDirectoryPicker({ id: "letherel-local-admin", mode: "readwrite" });
    rootHandle = selectedRoot;
    try {
      await Promise.all([
        readJson("assets/data/player-cards/index.json"),
        readJson("assets/data/player-cards/roster.json"),
        readJson("assets/data/bacheca.json"),
        readJson("assets/data/info.json"),
        readJson("assets/data/calendario.json")
      ]);
    } catch (error) {
      rootHandle = null;
      throw new Error("La cartella selezionata non sembra essere la radice di LetherelWorld: servono index.json, roster.json, bacheca.json, calendario.json e info.json.");
    }
    return selectedRoot.name;
  }

  window.LocalRepository = { connect, exists, readJson, removeFile, writeJson };
})();
