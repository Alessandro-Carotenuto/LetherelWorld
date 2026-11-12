(() => {
  function isSeaPixel(data, index) {
    return Math.abs(data[index] - 180) + Math.abs(data[index + 1] - 210) + Math.abs(data[index + 2] - 243) < 39;
  }

  function colorParts(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  function randomAt(seed, stamp, vertex) {
    let value = (seed + Math.imul(stamp + 1, 374761393) + Math.imul(vertex + 1, 668265263)) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function strokeSegments(stroke) {
    return stroke.segments || (stroke.points ? [stroke.points] : []);
  }

  window.LetherelMapmakerGeometry = { isSeaPixel, colorParts, randomAt, strokeSegments };
})();
