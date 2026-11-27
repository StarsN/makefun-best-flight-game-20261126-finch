// main.js — Kestrel Ridge, a valley flight game. Boots the renderer,
// builds the world (terrain, lake, forest, airfield, clouds), wires the
// flight model, sortie, HUD and sound together, and runs the loop: a
// chase camera that trails the Kestrel without fighting it, physics in
// fixed substeps, and a menu / flying / finished flow. A ?shot=<scene>
// URL poses the game for its screenshots (cover, approach, ridge,
// takeoff) with the simulation frozen at a photogenic moment.

import { buildTerrain, buildForest, buildLake } from './terrain.js';
import { buildSky, buildClouds, driftClouds, buildAirfield } from './world.js';
import { buildAircraft, dressAircraft, setGearPose } from './aircraft.js';
import { FlightState } from './flightModel.js';
import { Sortie } from './missions.js';
import { createInput } from './input.js';
import { Hud } from './hud.js';
import { SoundBoard } from './audio.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 14000);
camera.position.set(0, 30, 1250);

const sun = buildSky(scene);
scene.add(sun.target);
buildTerrain(scene);
buildForest(scene);
buildLake(scene);
const airfield = buildAirfield(scene);
const clouds = buildClouds(scene);

const plane = buildAircraft();
scene.add(plane.group);

const state = new FlightState();
const sortie = new Sortie(scene);
const input = createInput();
const hud = new Hud();
const sound = new SoundBoard();

let mode = 'menu';           // menu | flying | shot
let endShownAt = 0;
const SUN_OFFSET = new THREE.Vector3(-950, 760, -1250);

const TITLE_HTML = `
  <h1>KESTREL <span class="accent">RIDGE</span></h1>
  <p>One valley, one tank of fuel, eight rings. Take off from Kestrel Field,
     thread the glowing rings around the ridge and over the lake, then bring
     the Kestrel home and land her on the runway. Thread a ring dead centre
     for a bonus; mind the stall, and save enough fuel for the way back.</p>
  <div class="controls">
    <b>W / S or ↑ / ↓</b><span>pitch (nose up / down)</span>
    <b>A / D or ← / →</b><span>bank and turn</span>
    <b>Shift / F</b><span>throttle up / down (wheel trims too)</span>
    <b>Q / E</b><span>rudder</span>
    <b>G</b><span>landing gear</span>
    <b>Space</b><span>brakes / airbrake</span>
    <b>mouse drag</b><span>steer gently</span>
  </div>
  <div class="prompt">PRESS ENTER OR CLICK TO FLY</div>`;

function showTitle() { hud.showOverlay(TITLE_HTML); }
function startFlight() {
  sound.ensure();
  state.reset();
  sortie.reset();
  endShownAt = 0;
  hud.hideOverlay();
  mode = 'flying';
}
function showEnd() {
  const mins = Math.floor(sortie.elapsed / 60), secs = String(Math.floor(sortie.elapsed % 60)).padStart(2, '0');
  hud.showOverlay(`
    <h2>${sortie.endTitle || 'SORTIE OVER'}</h2>
    <p>${sortie.endSub || ''}</p>
    <div class="score-line">SCORE ${sortie.finalScore ?? sortie.score} &middot; RINGS ${sortie.ringsDone}/8 &middot; TIME ${mins}:${secs}</div>
    <div class="prompt">PRESS ENTER TO FLY AGAIN</div>`);
}

input.toggles.gear = () => { if (mode === 'flying') { sound.ensure(); state.toggleGear(); } };
input.toggles.action = () => {
  if (mode === 'menu') startFlight();
  else if (mode === 'flying' && sortie.finished) startFlight();
};
document.getElementById('overlay').addEventListener('click', () => input.toggles.action());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- screenshot scenes ---------------------------------------------------
// Frozen, composed moments for the entry screenshots: the sortie state is
// preset so the HUD tells the same story the picture shows.
const SHOT_SCENES = {
  cover: {
    pos: [30, 92, 592], heading: -0.1, pitch: -0.03, roll: -0.26, speed: 47,
    throttle: 0.74, gear: 0, fuel: 83, vs: -1.1, next: 0, phase: 'rings', score: 0, elapsed: 41,
  },
  approach: {
    pos: [7, 41, 1472], heading: 0.01, pitch: -0.05, roll: 0.02, speed: 33,
    throttle: 0.3, gear: 1, fuel: 39, vs: -2.7, next: 8, phase: 'final', score: 2050, elapsed: 214,
  },
  ridge: {
    pos: [-672, 336, -418], heading: -2.32, pitch: 0.04, roll: 0.55, speed: 56,
    throttle: 0.82, gear: 0, fuel: 61, vs: 0.9, next: 3, phase: 'rings', score: 800, elapsed: 98,
  },
  takeoff: {
    pos: [0, 15.62, 1152], heading: 0, pitch: 0, roll: 0, speed: 31,
    throttle: 1, gear: 1, fuel: 100, vs: 0, next: 0, phase: 'takeoff', score: 0, elapsed: 0, ground: true,
  },
};

function applyShot(name) {
  const s = SHOT_SCENES[name] || SHOT_SCENES.cover;
  state.pos.set(...s.pos);
  state.heading = s.heading; state.pitch = s.pitch; state.roll = s.roll;
  state.speed = s.speed; state.throttle = s.throttle;
  state.gear01 = s.gear; state.gearDown = s.gear > 0.5;
  state.fuel = s.fuel; state.verticalSpeed = s.vs;
  state.onGround = !!s.ground; state.airborne = !s.ground;
  state.syncQuaternion();
  sortie.nextIndex = s.next;
  sortie.rings.forEach((r, i) => { r.passed = i < s.next; });
  sortie.phase = s.phase;
  sortie.score = s.score; sortie.elapsed = s.elapsed; sortie.started = s.elapsed > 0;
  mode = 'shot';
  hud.hideOverlay();
}

const shotName = new URLSearchParams(location.search).get('shot');
if (shotName) applyShot(shotName); else showTitle();

// --- camera ---------------------------------------------------------------
const camPos = new THREE.Vector3(24, 26, 1240);
let camSnapped = false;
const camTarget = new THREE.Vector3();
const desired = new THREE.Vector3();
const lookPoint = new THREE.Vector3();
const planeUp = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function updateCamera(dt, now) {
  if (mode === 'menu') {
    const a = now * 0.1;
    desired.set(state.pos.x + Math.sin(a) * 25, state.pos.y + 6.5, state.pos.z + Math.cos(a) * 25);
    camPos.lerp(desired, 1 - Math.exp(-dt * 2.2));
    camera.position.copy(camPos);
    camera.up.copy(WORLD_UP);
    camera.lookAt(state.pos.x, state.pos.y + 1.2, state.pos.z);
    return;
  }
  desired.set(0, 3.0, 14.4).applyQuaternion(state.quaternion).add(state.pos);
  if (mode === 'shot' && !camSnapped) {
    // Screenshots must not depend on the camera flying in: start posed.
    camPos.copy(desired);
    camTarget.copy(state.pos).addScaledVector(state.forward, 30);
    camSnapped = true;
  }
  camPos.lerp(desired, 1 - Math.exp(-dt * (mode === 'shot' ? 6 : 3.6)));
  camera.position.copy(camPos);
  planeUp.set(0, 1, 0).applyQuaternion(state.quaternion);
  camera.up.copy(planeUp).multiplyScalar(0.38).add(WORLD_UP).normalize();
  lookPoint.copy(state.forward).multiplyScalar(30).add(state.pos);
  lookPoint.y += 1.1;
  camTarget.lerp(lookPoint, 1 - Math.exp(-dt * 6));
  camera.lookAt(camTarget);
}

// --- main loop --------------------------------------------------------------
let last = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now() / 1000;
  let dt = Math.min(0.05, (performance.now() - last) / 1000);
  last = performance.now();

  const axes = input.poll();

  if (mode === 'flying') {
    const sub = 2, sdt = dt / sub;
    for (let i = 0; i < sub; i++) state.step(sdt, axes);
    const events = sortie.update(state, dt, now);
    for (const e of events) {
      if (e === 'ring') sound.ring();
      else if (e === 'thud') sound.thud();
      else if (e === 'crash') sound.crash();
      else if (e === 'success') sound.success();
    }
    sound.update(state.throttle, state.speed, state.onGround);
    if (sortie.finished && !endShownAt) endShownAt = now + 1.4;
    if (sortie.finished && endShownAt && now >= endShownAt && mode === 'flying') {
      showEnd();
      endShownAt = -1;
    }
  }

  // Dress the world.
  plane.group.position.copy(state.pos);
  plane.group.quaternion.copy(state.quaternion);
  const rpm01 = mode === 'menu' ? 0.14 : state.throttle;
  dressAircraft(plane, mode === 'flying' ? axes : { pitch: 0, roll: 0, yaw: 0 }, rpm01, now);
  setGearPose(plane, state.gear01);
  sortie.dressRings(now);
  driftClouds(clouds, dt);
  if (airfield.userData.sock) airfield.userData.sock.rotation.y = Math.sin(now * 1.7) * 0.3;
  sun.position.copy(state.pos).add(SUN_OFFSET);
  sun.target.position.copy(state.pos);

  updateCamera(dt, now);
  hud.update(state, sortie, camera, now);
  renderer.render(scene, camera);
}
frame();
