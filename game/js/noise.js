// noise.js — tiny seeded randomness helpers shared by the world builders.
// A mulberry32 PRNG for scatter placement, and tileable value noise with
// fractal octaves for the heightfield. Deterministic for a given seed, so
// the ridge looks the same on every visit and in every screenshot.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCell(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 974634211);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1; // -1..1
}

function fade(t) { return t * t * (3 - 2 * t); }

// Value noise at one frequency: smooth-interpolated hashed lattice values.
function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hashCell(ix, iz, seed);
  const b = hashCell(ix + 1, iz, seed);
  const c = hashCell(ix, iz + 1, seed);
  const d = hashCell(ix + 1, iz + 1, seed);
  const u = fade(fx), v = fade(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Returns an fBm sampler: f(x, z) in roughly -1..1.
export function makeValueNoise(seed, octaves) {
  return function fbm(x, z) {
    let sum = 0, amp = 0.55, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += valueNoise(x * freq, z * freq, seed + o * 131) * amp;
      norm += amp;
      amp *= 0.55;
      freq *= 2.03;
    }
    return sum / norm;
  };
}
