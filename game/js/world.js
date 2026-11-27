// world.js — the dressing that makes the valley read at a glance: a
// gradient sky dome with a low warm sun, drifting low-poly clouds, the
// Kestrel Field airfield (runway, hangars, windsock, approach lights) and
// the glowing course rings the sortie is flown through.

import { mulberry32 } from './noise.js';
import { runwayInfo } from './terrain.js';

export function buildSky(scene) {
  // Big inverted sphere with a three-stop vertical gradient baked into
  // vertex colours: warm horizon, mid blue, deep zenith.
  const geo = new THREE.SphereGeometry(5200, 24, 14);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  const horizon = new THREE.Color(0xf6c98f);
  const mid = new THREE.Color(0x8ec9e8);
  const zenith = new THREE.Color(0x2e6db4);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 5200);
    if (t < 0.28) c.lerpColors(horizon, mid, t / 0.28);
    else c.lerpColors(mid, zenith, (t - 0.28) / 0.72);
    colours[i * 3] = c.r; colours[i * 3 + 1] = c.g; colours[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xffe3b3, 2.6);
  sun.position.set(-2600, 2100, -3400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 2600;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x5d7a4a, 0.85));
  scene.fog = new THREE.Fog(0xd9e6ee, 900, 4600);
  return sun;
}

export function buildClouds(scene) {
  const rand = mulberry32(777);
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);
  // Unlit material: a cloud's lit side is never the one facing the pilot,
  // and a flat bright puff reads as stylised cloud at any angle.
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xf7fbff, transparent: true, opacity: 0.88 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(puffGeo, puffMat);
      const s = 14 + rand() * 26;
      puff.scale.set(s, s * 0.52, s * 0.72);
      puff.position.set((rand() - 0.5) * 46, (rand() - 0.5) * 6, (rand() - 0.5) * 22);
      cloud.add(puff);
    }
    cloud.position.set((rand() * 2 - 1) * 2600, 420 + rand() * 260, (rand() * 2 - 1) * 2600);
    cloud.userData.speed = 1.2 + rand() * 1.6;
    clouds.add(cloud);
  }
  scene.add(clouds);
  return clouds;
}

export function driftClouds(clouds, dt) {
  for (const cloud of clouds.children) {
    cloud.position.x += cloud.userData.speed * dt;
    if (cloud.position.x > 2900) cloud.position.x = -2900;
  }
}

function buildRunway(scene) {
  const info = runwayInfo();
  const group = new THREE.Group();
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(info.halfWidth * 2, info.halfLength * 2),
    new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.95 }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(info.centreX, info.groundY + 0.12, info.centreZ);
  asphalt.receiveShadow = true;
  group.add(asphalt);

  // Centreline dashes and threshold bars, slightly above the asphalt.
  const paintMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
  for (let z = -info.halfLength + 18; z < info.halfLength - 12; z += 26) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 11), paintMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(info.centreX, info.groundY + 0.2, info.centreZ + z);
    group.add(dash);
  }
  for (const end of [-1, 1]) {
    for (let b = -2; b <= 2; b++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 9), paintMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(info.centreX + b * 4.6, info.groundY + 0.2, info.centreZ + end * (info.halfLength - 7));
      group.add(bar);
    }
  }
  // Edge lights: small warm spheres down both sides.
  const lightGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  for (let z = -info.halfLength; z <= info.halfLength; z += 30) {
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(lightGeo, lightMat);
      s.position.set(info.centreX + side * (info.halfWidth + 1.6), info.groundY + 0.55, info.centreZ + z);
      group.add(s);
    }
  }
  scene.add(group);
  return group;
}

function buildHangars(scene) {
  const info = runwayInfo();
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, flatShading: true, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xb0483a, flatShading: true, roughness: 0.7 });
  function hangar(x, z, rotY, w = 26, d = 20, h = 8) {
    const g = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    walls.position.y = h / 2;
    walls.castShadow = true;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.52, w * 0.52, d, 12, 1, false, 0, Math.PI), roofMat);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.scale.y = 1;
    roof.position.y = h;
    roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.85), new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.9 }));
    door.position.set(0, h * 0.43, d / 2 + 0.06);
    g.add(walls, roof, door);
    g.position.set(x, info.groundY, z);
    g.rotation.y = rotY;
    return g;
  }
  group.add(hangar(-52, info.centreZ - 120, 0.35));
  group.add(hangar(-58, info.centreZ - 55, 0.12, 20, 16, 7));
  group.add(hangar(54, info.centreZ + 130, -0.3, 18, 14, 6.5));

  // Crates, fuel drums and a windsock complete the field.
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xa9803e, flatShading: true, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), crateMat);
    crate.position.set(-34 + (i % 3) * 3, info.groundY + 1.1 + Math.floor(i / 3) * 2.2, info.centreZ + 40 + (i % 2) * 3);
    crate.castShadow = true;
    group.add(crate);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 6), wallMat);
  pole.position.set(30, info.groundY + 4.5, info.centreZ - 160);
  group.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.6, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xe87e2a, flatShading: true, side: THREE.DoubleSide }));
  sock.rotation.z = Math.PI / 2 - 0.25;
  sock.position.set(31.8, info.groundY + 8.6, info.centreZ - 160);
  group.add(sock);
  group.userData.sock = sock;
  scene.add(group);
  return group;
}

export function buildAirfield(scene) {
  buildRunway(scene);
  return buildHangars(scene);
}

// One course ring: a fat torus that floats over the terrain. The active
// ring burns orange; passed rings cool to green and shrink a little.
export function buildRingMesh() {
  const geo = new THREE.TorusGeometry(15, 1.15, 10, 36);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff8c1a, emissive: 0xff6a00, emissiveIntensity: 1.6,
    roughness: 0.35, metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  return mesh;
}

export function poseRing(mesh, state, timeSec) {
  // state: 'next' (pulse), 'todo' (dim), 'done' (green, calm)
  const m = mesh.material;
  if (state === 'next') {
    const pulse = 1.5 + Math.sin(timeSec * 5) * 0.55;
    m.emissiveIntensity = pulse;
    m.color.setHex(0xffa63d);
    m.emissive.setHex(0xff6a00);
    mesh.scale.setScalar(1 + Math.sin(timeSec * 5) * 0.03);
  } else if (state === 'done') {
    m.emissiveIntensity = 0.7;
    m.color.setHex(0x3fae5a);
    m.emissive.setHex(0x1d7a38);
    mesh.scale.setScalar(0.94);
  } else {
    m.emissiveIntensity = 0.55;
    m.color.setHex(0xd97c22);
    m.emissive.setHex(0x8a4a08);
    mesh.scale.setScalar(1);
  }
}
