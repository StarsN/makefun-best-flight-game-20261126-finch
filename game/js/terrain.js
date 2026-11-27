// terrain.js — procedural low-poly heightfield for the Kestrel Ridge valley.
//
// One seeded value-noise field drives everything: the visible mesh, the
// scattered pines and the ground-collision query all read heightAt(), so
// what you see is exactly what you can hit. A flat valley runs north-south
// (x near 0) with the airfield pad carved into it; ridged mountains climb
// away to the east and west, and a bowl in the north-east holds the lake.

import { mulberry32, makeValueNoise } from './noise.js';

const WORLD_HALF = 3000;          // terrain spans -3000..3000 on both axes
const SEGMENTS = 190;             // mesh resolution (191 x 191 vertices)
const PAD = { x: 0, z: 1050, halfW: 78, halfL: 225, height: 14 };
const LAKE = { x: 760, z: -640, radius: 430, floor: 9 };
export const WATER_LEVEL = 23;

const fbmLow = makeValueNoise(1379, 4);    // broad rolling shapes
const fbmRidge = makeValueNoise(9241, 5);  // sharp mountain ridges
const fbmDetail = makeValueNoise(517, 3);  // small bumps on the valley floor

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp01(x) { return Math.min(1, Math.max(0, x)); }

// Height of the ground at a world position, in metres. Pure and cheap:
// the flight model calls this every step.
export function heightAt(x, z) {
  const distCentre = Math.hypot(x, z);
  const rise = smoothstep(130, 950, Math.abs(x));            // 0 valley, 1 high country
  const rolling = fbmLow(x * 0.0011, z * 0.0011);           // -1..1
  const ridgeRaw = 1 - Math.abs(fbmRidge(x * 0.00042, z * 0.00042)); // 0..1, 1 on crests
  const ridge = Math.pow(ridgeRaw, 1.7);

  let h = ridge * 430 * rise
        + rolling * 26 * rise
        + fbmDetail(x * 0.006, z * 0.006) * 5 * (1 - rise)
        + rolling * 7 * (1 - rise)
        + 16;

  // Enclose the world: ground climbs past the rim so nobody flies off the edge.
  if (distCentre > 2350) h += (distCentre - 2350) * 0.22;

  // Carve the lake bowl in the north-east high country.
  const lakeDist = Math.hypot(x - LAKE.x, z - LAKE.z);
  const lakeMask = 1 - smoothstep(LAKE.radius * 0.45, LAKE.radius, lakeDist);
  h = h * (1 - lakeMask * 0.92) + LAKE.floor * (lakeMask * 0.92);

  // Flatten the airfield pad into the valley floor.
  const rectT = Math.max(Math.abs(x - PAD.x) / PAD.halfW, Math.abs(z - PAD.z) / PAD.halfL);
  const padMask = 1 - smoothstep(0.82, 1.2, rectT);
  h = h * (1 - padMask) + PAD.height * padMask;

  return h;
}

// True when a point hangs over the lake's water (inside the bowl's rim).
export function overWater(x, z) {
  return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius * 0.9;
}

export function runwayInfo() {
  return {
    centreX: PAD.x, centreZ: PAD.z, groundY: PAD.height,
    halfWidth: 15, halfLength: 165, heading: 0, // runway axis runs along Z
  };
}

// Colour a vertex by altitude and slope: meadow, pine dark, rock, snow.
// Sand belongs only to the lake shore — the valley floor is meadow even
// though it sits lower than the waterline of a lake it never touches.
function vertexColour(x, z, h, slope, out, i) {
  const jitter = fbmDetail(x * 0.05, z * 0.05) * 0.05;
  const lakeDist = Math.hypot(x - LAKE.x, z - LAKE.z);
  let r, g, b;
  if (lakeDist < LAKE.radius * 1.02 && h < WATER_LEVEL + 3) { r = 0.76; g = 0.70; b = 0.47; } // shore sand
  else if (h > 235) { r = 0.93; g = 0.95; b = 0.99; }                      // snow line
  else if (slope > 0.85) { r = 0.44; g = 0.42; b = 0.44; }                 // steep rock
  else if (h > 120) { r = 0.31; g = 0.44; b = 0.26; }                      // high pasture
  else { r = 0.34; g = 0.56; b = 0.27; }                                   // valley meadow
  out[i] = r + jitter; out[i + 1] = g + jitter; out[i + 2] = b + jitter;
}

export function buildTerrain(scene) {
  const size = WORLD_HALF * 2;
  const geo = new THREE.PlaneGeometry(size, size, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
  }
  geo.computeVertexNormals();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const e = 14;
    const slope = Math.abs(heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e)
                + Math.abs(heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    vertexColour(x, z, pos.getY(i), slope, colours, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Instanced pine trees on the gentler green slopes, kept off the pad and
// out of the water. Two instanced meshes: trunks and canopies.
export function buildForest(scene) {
  const rand = mulberry32(20261126);
  const spots = [];
  for (let i = 0; i < 5200 && spots.length < 900; i++) {
    const x = (rand() * 2 - 1) * 2700;
    const z = (rand() * 2 - 1) * 2700;
    const h = heightAt(x, z);
    if (h < WATER_LEVEL + 4 || h > 205) continue;
    if (Math.abs(x - PAD.x) < 120 && Math.abs(z - PAD.z) < 280) continue;
    const e = 10;
    const slope = Math.abs(heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e)
                + Math.abs(heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    if (slope > 0.5) continue;
    spots.push({ x, z, h, s: 0.75 + rand() * 0.9, rot: rand() * Math.PI * 2 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true, roughness: 1 });
  const coneGeo = new THREE.ConeGeometry(3.1, 10.5, 6);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x2c5a34, flatShading: true, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.rot);
    v.set(s.x, s.h + 1.4 * s.s, s.z); sc.set(s.s, s.s, s.s);
    m.compose(v, q, sc); trunks.setMatrixAt(i, m);
    v.set(s.x, s.h + (3.2 + 4.6) * s.s, s.z);
    m.compose(v, q, sc); cones.setMatrixAt(i, m);
  });
  cones.castShadow = true;
  scene.add(trunks, cones);
  return spots.length;
}

export function buildLake(scene) {
  const geo = new THREE.CircleGeometry(LAKE.radius * 0.92, 40);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2e7fb8, transparent: true, opacity: 0.82,
    roughness: 0.15, metalness: 0.35, flatShading: true,
  });
  const lake = new THREE.Mesh(geo, mat);
  lake.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
  scene.add(lake);
  return lake;
}
