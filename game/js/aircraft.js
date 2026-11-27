// aircraft.js — the Kestrel, a high-wing single-prop tourer built entirely
// from three.js primitives: a lathed fuselage, tapered wing boxes, struts,
// a spinning prop with a blur disc, deflecting control surfaces, blinking
// nav lights and landing gear that folds away. Nose points down -Z, which
// is the flight model's forward direction.

const PAINT = 0xf3ead8;      // warm cream
const ACCENT = 0xc8402a;     // kestrel red
const DARK = 0x2b2f36;

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, metalness: 0.08, ...opts });
}

function box(w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function buildFuselage() {
  // Lathe profile from spinner (front, -Z) to tail cone. Lathe rotates
  // around Y, so build along +Y then rotate to lie along Z.
  const pts = [];
  const profile = [
    [0.01, -4.6], [0.34, -4.55], [0.62, -4.2], [0.78, -3.4], [0.86, -2.2],
    [0.88, -0.8], [0.84, 0.6], [0.72, 1.9], [0.52, 3.1], [0.30, 4.1], [0.10, 4.7], [0.02, 4.9],
  ];
  for (const [r, y] of profile) pts.push(new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 14);
  const body = new THREE.Mesh(geo, mat(PAINT, { roughness: 0.45 }));
  body.rotation.x = Math.PI / 2; // +Y becomes -Z... lathe axis now along Z
  body.castShadow = true;
  return body;
}

function buildPropeller() {
  const group = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 10), mat(ACCENT));
  hub.rotation.x = -Math.PI / 2;
  group.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.16, 2.35, 0.05);
  const bladeMat = mat(DARK, { roughness: 0.4 });
  const bladeA = new THREE.Mesh(bladeGeo, bladeMat);
  const bladeB = new THREE.Mesh(bladeGeo, bladeMat);
  bladeB.rotation.z = Math.PI / 2;
  group.add(bladeA, bladeB);
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(1.22, 28),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  blur.position.z = 0.03;
  group.add(blur);
  group.position.set(0, 0.05, -4.72);
  group.userData = { blur, blades: [bladeA, bladeB] };
  return group;
}

function buildWing() {
  const group = new THREE.Group();
  const wingGeo = new THREE.BoxGeometry(11.4, 0.16, 1.55);
  // Taper the tips by scaling the geometry's outer vertices.
  const p = wingGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const t = Math.abs(x) / 5.7;
    if (t > 0.55) p.setZ(i, p.getZ(i) * (1 - (t - 0.55) * 0.9));
  }
  wingGeo.computeVertexNormals();
  const wing = new THREE.Mesh(wingGeo, mat(PAINT, { roughness: 0.5 }));
  wing.castShadow = true;
  group.add(wing);
  const tipL = box(0.9, 0.18, 1.0, ACCENT, -5.35, 0, 0.12);
  const tipR = box(0.9, 0.18, 1.0, ACCENT, 5.35, 0, 0.12);
  group.add(tipL, tipR);
  // Ailerons: separate thin boxes at the trailing edge that deflect.
  const ailGeo = new THREE.BoxGeometry(2.5, 0.07, 0.5);
  const ailMat = mat(ACCENT, { roughness: 0.5 });
  const ailL = new THREE.Mesh(ailGeo, ailMat); ailL.position.set(-4.1, 0, 0.95);
  const ailR = new THREE.Mesh(ailGeo, ailMat); ailR.position.set(4.1, 0, 0.95);
  group.add(ailL, ailR);
  // Wing struts: angled braces whose ends land inside the wing and the
  // fuselage, so they read as structure rather than stilts.
  const strutGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6);
  const strutMat = mat(DARK);
  for (const sx of [-1.5, 1.5]) {
    const s = new THREE.Mesh(strutGeo, strutMat);
    s.position.set(sx, -0.55, 0.1);
    s.rotation.z = sx > 0 ? 0.95 : -0.95;
    group.add(s);
  }
  group.position.set(0, 1.02, -0.55);
  group.userData = { ailL, ailR };
  return group;
}

function buildTail() {
  const group = new THREE.Group();
  const stab = box(3.6, 0.12, 1.0, PAINT, 0, 0.18, 4.35);
  const fin = box(0.12, 1.45, 1.15, ACCENT, 0, 0.75, 4.45);
  const elevator = box(3.3, 0.06, 0.45, ACCENT, 0, 0.18, 4.95);
  const rudder = box(0.06, 1.25, 0.5, PAINT, 0, 0.7, 5.0);
  group.add(stab, fin, elevator, rudder);
  group.userData = { elevator, rudder };
  return group;
}

function buildGear() {
  const group = new THREE.Group();
  const legMat = mat(DARK, { roughness: 0.4, metalness: 0.4 });
  const tyreMat = mat(0x1c1e22, { roughness: 0.9 });
  function wheel(x, y, z) {
    const w = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 6), legMat);
    leg.position.y = 0.35;
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.26, 12), tyreMat);
    tyre.rotation.z = Math.PI / 2;
    tyre.castShadow = true;
    w.add(leg, tyre);
    w.position.set(x, y, z);
    return w;
  }
  group.add(wheel(-1.05, -1.15, -0.9), wheel(1.05, -1.15, -0.9), wheel(0, -1.05, 2.6));
  return group;
}

export function buildAircraft() {
  const group = new THREE.Group();
  const body = buildFuselage();
  group.add(body);

  // Red cheatline: a lathe band floated a hair above the fuselage skin,
  // following its curve — a box would slab straight through the body.
  const bandPts = [
    new THREE.Vector2(0.875, -1.8), new THREE.Vector2(0.9, -0.8),
    new THREE.Vector2(0.875, 0.6), new THREE.Vector2(0.79, 1.6),
  ];
  const band = new THREE.Mesh(
    new THREE.LatheGeometry(bandPts, 14),
    mat(ACCENT, { roughness: 0.5 }),
  );
  band.rotation.x = Math.PI / 2;
  band.scale.set(1, 1, 0.42); // squash vertically into a stripe, not a shell
  band.position.y = 0.1;
  group.add(band);

  // Canopy: a squashed glossy sphere segment.
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat(0x22384a, { roughness: 0.12, metalness: 0.55 }),
  );
  canopy.scale.set(0.82, 0.72, 1.5);
  canopy.position.set(0, 0.62, -0.7);
  group.add(canopy);

  const wing = buildWing();
  group.add(wing);
  const tail = buildTail();
  group.add(tail);
  const prop = buildPropeller();
  group.add(prop);
  const gear = buildGear();
  group.add(gear);

  // Exhaust stub and pitot, the small truths that sell a model.
  const exhaust = box(0.12, 0.12, 0.7, DARK, 0.55, -0.55, -3.6);
  group.add(exhaust);

  // Nav lights: red port, green starboard, white tail, red beacon on fin.
  const lightGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const mk = (color, x, y, z) => {
    const s = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color }));
    s.position.set(x, y, z);
    group.add(s);
    return s;
  };
  mk(0xff2a22, -5.8, 1.02, -0.4);
  mk(0x2aff5a, 5.8, 1.02, -0.4);
  mk(0xffffff, 0, 0.2, 5.05);
  const beacon = mk(0xff3020, 0, 1.55, 4.45);

  return {
    group,
    prop,
    gear,
    beacon,
    surfaces: {
      elevator: tail.userData.elevator,
      rudder: tail.userData.rudder,
      ailL: wing.userData.ailL,
      ailR: wing.userData.ailR,
    },
  };
}

// Per-frame dressing: spin the prop with engine rpm, cross-fade the blur
// disc in as it gets fast, blink the beacon, pose the control surfaces.
export function dressAircraft(plane, input, rpm01, timeSec) {
  const spin = rpm01 * 55;
  plane.prop.rotation.z += spin * 0.016;
  const { blur, blades } = plane.prop.userData;
  blur.material.opacity = Math.max(0, (rpm01 - 0.25)) * 0.35;
  for (const b of blades) b.visible = rpm01 < 0.55;
  plane.beacon.material.color.setScalar(0);
  const pulse = (timeSec % 1.2) < 0.12 ? 1 : 0.06;
  plane.beacon.material.color.setRGB(pulse, pulse * 0.12, pulse * 0.08);
  plane.surfaces.elevator.rotation.x = input.pitch * 0.45;
  plane.surfaces.rudder.rotation.y = input.yaw * 0.4;
  plane.surfaces.ailL.rotation.x = -input.roll * 0.5;
  plane.surfaces.ailR.rotation.x = input.roll * 0.5;
}

// Gear folds by scaling the gear group toward the belly; gear01 1 = down.
export function setGearPose(plane, gear01) {
  plane.gear.visible = gear01 > 0.03;
  plane.gear.scale.set(1, Math.max(0.03, gear01), 1);
  plane.gear.position.y = (1 - gear01) * 0.55;
}
