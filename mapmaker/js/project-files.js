(() => {
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportProject(project) {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    download(blob, 'letherel-mapmaker.json');
  }

  function parseProject(text) {
    const project = JSON.parse(text);
    if (!project || !Array.isArray(project.states) || !Array.isArray(project.strokes) || !Array.isArray(project.labels)) {
      throw new Error('Il file non contiene un progetto Mapmaker valido.');
    }
    return project;
  }

  window.LetherelMapmakerFiles = { download, exportProject, parseProject };
})();
