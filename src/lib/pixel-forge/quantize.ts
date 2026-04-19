type RGB = [number, number, number];

function bucketBounds(bucket: RGB[]): { range: number; axis: 0 | 1 | 2 } {
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
  for (const p of bucket) {
    if (p[0] < minR) minR = p[0]; if (p[0] > maxR) maxR = p[0];
    if (p[1] < minG) minG = p[1]; if (p[1] > maxG) maxG = p[1];
    if (p[2] < minB) minB = p[2]; if (p[2] > maxB) maxB = p[2];
  }
  const rR = maxR - minR, rG = maxG - minG, rB = maxB - minB;
  const axis: 0 | 1 | 2 = rR >= rG && rR >= rB ? 0 : rG >= rB ? 1 : 2;
  return { range: Math.max(rR, rG, rB), axis };
}

function bucketAverage(bucket: RGB[]): RGB {
  let r = 0, g = 0, b = 0;
  for (const p of bucket) { r += p[0]; g += p[1]; b += p[2]; }
  return [
    Math.round(r / bucket.length),
    Math.round(g / bucket.length),
    Math.round(b / bucket.length),
  ];
}

function medianCut(pixels: RGB[], k: number): RGB[] {
  if (pixels.length === 0 || k < 1) return [];
  const buckets: RGB[][] = [[...pixels]];
  while (buckets.length < k) {
    let maxRange = -1;
    let maxIdx = -1;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length < 2) continue;
      const { range } = bucketBounds(buckets[i]);
      if (range > maxRange) { maxRange = range; maxIdx = i; }
    }
    if (maxIdx < 0) break;
    const bucket = buckets[maxIdx];
    const { axis } = bucketBounds(bucket);
    bucket.sort((a, b) => a[axis] - b[axis]);
    const mid = Math.floor(bucket.length / 2);
    buckets.splice(maxIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
  }
  return buckets.map(bucketAverage);
}

export function quantizeImageData(imageData: ImageData, k: number): RGB[] {
  const d = imageData.data;
  const pixels: RGB[] = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] >= 128) pixels.push([d[i], d[i + 1], d[i + 2]]);
  }
  if (pixels.length === 0) return [];
  const centroids = medianCut(pixels, Math.min(k, pixels.length));
  if (centroids.length === 0) return [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    let minD = Infinity;
    let best = centroids[0];
    for (const c of centroids) {
      const dr = d[i] - c[0];
      const dg = d[i + 1] - c[1];
      const db = d[i + 2] - c[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minD) { minD = dist; best = c; }
    }
    d[i] = best[0]; d[i + 1] = best[1]; d[i + 2] = best[2];
  }
  return centroids;
}

export function rgbToHex(rgb: RGB): string {
  return '#' + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1).toUpperCase();
}

export function snapToTopKPalette(imageData: ImageData, palette: string[], k: number): string[] {
  if (palette.length === 0) return [];
  const d = imageData.data;
  const pal: RGB[] = palette.map(hex => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);
  const counts = new Array(pal.length).fill(0);
  const assignments = new Int32Array(d.length / 4);
  for (let i = 0, a = 0; i < d.length; i += 4, a++) {
    if (d[i + 3] < 128) { assignments[a] = -1; continue; }
    let bestD = Infinity;
    let bestIdx = 0;
    for (let p = 0; p < pal.length; p++) {
      const dr = d[i] - pal[p][0];
      const dg = d[i + 1] - pal[p][1];
      const db = d[i + 2] - pal[p][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestD) { bestD = dist; bestIdx = p; }
    }
    assignments[a] = bestIdx;
    counts[bestIdx]++;
  }
  const targetK = Math.min(k, pal.length);
  const sorted = counts
    .map((c, idx) => [c, idx] as [number, number])
    .sort((a, b) => b[0] - a[0]);
  const topKIndices = new Set<number>(sorted.slice(0, targetK).map(e => e[1]));
  const topKPal: RGB[] = Array.from(topKIndices).map(idx => pal[idx]);
  for (let i = 0, a = 0; i < d.length; i += 4, a++) {
    if (assignments[a] === -1) continue;
    if (topKIndices.has(assignments[a])) {
      d[i] = pal[assignments[a]][0];
      d[i + 1] = pal[assignments[a]][1];
      d[i + 2] = pal[assignments[a]][2];
      d[i + 3] = 255;
    } else {
      let bestD = Infinity;
      let best = topKPal[0];
      for (const c of topKPal) {
        const dr = d[i] - c[0];
        const dg = d[i + 1] - c[1];
        const db = d[i + 2] - c[2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestD) { bestD = dist; best = c; }
      }
      d[i] = best[0]; d[i + 1] = best[1]; d[i + 2] = best[2]; d[i + 3] = 255;
    }
  }
  return Array.from(topKIndices).map(idx => palette[idx]);
}
