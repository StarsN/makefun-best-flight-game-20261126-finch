// missions.js — the Kestrel Ridge sortie: take off from Kestrel Field,
// thread eight glowing rings around the valley and over the lake, then
// bring her home and land on the runway before the fuel runs out. This
// module owns the course, the phase machine and the score; it reads the
// flight state and emits events the HUD and audio react to.

import { heightAt } from './terrain.js';
import { buildRingMesh, poseRing } from './world.js';

const COURSE_XZ = [
  [0, 470], [-430, 40], [-860, -540], [-330, -1180],
  [330, -1280], [760, -640], [540, 90], [-60, 1480],
];
export const RING_RADIUS = 15;
const PAR_SECONDS = 300;

export class Sortie {
  constructor(scene) {
    this.rings = COURSE_XZ.map(([x, z], i) => {
      const y = Math.max(heightAt(x, z) + 55, 68);
      const mesh = buildRingMesh();
      mesh.position.set(x, y, z);
      // Face each ring along the line of flight: from the previous point
      // (or the runway for the first) toward the next.
      const prev = i === 0 ? [0, 1180] : COURSE_XZ[i - 1];
      const next = i === COURSE_XZ.length - 1 ? [0, 1050] : COURSE_XZ[i + 1];
      const dirx = next[0] - prev[0], dirz = next[1] - prev[1];
      mesh.rotation.y = Math.atan2(dirx, dirz);
      scene.add(mesh);
      return {
        mesh, centre: new THREE.Vector3(x, y, z),
        normal: new THREE.Vector3(dirx, 0, dirz).normalize(),
        passed: false,
      };
    });
    this.reset();
  }

  reset() {
    for (const r of this.rings) r.passed = false;
    this.nextIndex = 0;
    this.phase = 'takeoff';   // takeoff -> rings -> final -> done | over
    this.score = 0;
    this.elapsed = 0;
    this.started = false;
    this.finished = false;
    this.success = false;
    this.banner = null;       // { text, sub, until } transient centre message
    this.finalScore = null;
  }

  get nextRing() { return this.rings[this.nextIndex] || null; }
  get ringsDone() { return this.nextIndex; }

  say(text, sub, seconds, now) {
    this.banner = { text, sub, until: now + seconds };
  }

  update(state, dt, now) {
    const events = [];
    if (this.finished) return events;
    if (this.started && !state.crashed) this.elapsed += dt;

    // Flight-state events feed the phase machine.
    for (const e of state.events) {
      if (e === 'airborne' && this.phase === 'takeoff') {
        this.phase = 'rings';
        this.started = true;
        this.say('AIRBORNE', 'Thread the orange rings — follow the marker', 3.2, now);
        events.push('airborne');
      }
      if (e === 'hard-landing') { this.say('HEAVY LANDING', 'The gear took a beating', 2.4, now); events.push('thud'); }
      if (e === 'forced-landing') {
        this.finish(false, 'FORCED LANDING', 'Down in one piece, but the sortie is over.', state);
        events.push('over');
      }
      if (e === 'crash') {
        this.finish(false, 'CRASHED', state.crashReason || '', state);
        events.push('crash');
      }
      if (e === 'stopped' && state.landed) {
        if (this.phase === 'final') {
          const fuelBonus = Math.round(state.fuel) * 4;
          const timeBonus = Math.max(0, Math.round((PAR_SECONDS - this.elapsed)) * 2);
          this.score += 600 + fuelBonus + timeBonus;
          this.finish(true, 'SORTIE COMPLETE', `Landing +600 · fuel bonus +${fuelBonus} · time bonus +${timeBonus}`, state);
          events.push('success');
        } else {
          this.finish(false, 'BACK EARLY', 'You landed before finishing the course.', state);
          events.push('over');
        }
      }
    }

    // Ring crossing: sign change of the plane-side dot product while
    // inside the hoop's radius counts as threading it.
    const ring = this.nextRing;
    if (ring && state.airborne && !state.crashed) {
      const rel = state.pos.clone().sub(ring.centre);
      const side = rel.dot(ring.normal);
      if (this._lastSide !== undefined && Math.sign(side) !== Math.sign(this._lastSide) && Math.abs(side) < 30) {
        const radial = rel.clone().addScaledVector(ring.normal, -side).length();
        if (radial < RING_RADIUS + 2.5) {
          ring.passed = true;
          this.nextIndex++;
          const centreBonus = radial < RING_RADIUS * 0.45 ? 50 : 0;
          this.score += 250 + centreBonus;
          events.push('ring');
          if (this.nextRing) {
            this.say(`RING ${this.nextIndex} OF ${this.rings.length}`, centreBonus ? `Dead centre! +${250 + centreBonus}` : `+250 — next ring marked`, 2.2, now);
          } else {
            this.phase = 'final';
            this.say('ALL RINGS FLOWN', 'Come home: gear down, land on the runway', 3.4, now);
            events.push('final');
          }
        }
      }
      this._lastSide = side;
    } else {
      this._lastSide = undefined;
    }

    if (state.fuel <= 0 && state.airborne && !state.onGround) {
      // Gliding home on fumes is allowed; the phase stays, the engine is dead.
      if (!this._flamedOut) { this._flamedOut = true; this.say('FUEL EXHAUSTED', 'Glide her home — or put her down gently', 3, now); events.push('flameout'); }
    }
    return events;
  }

  finish(success, title, sub, state) {
    this.finished = true;
    this.success = success;
    this.phase = success ? 'done' : 'over';
    this.finalScore = this.score;
    this.say(title, sub, 1e9, performance.now() / 1000);
    this.endTitle = title;
    this.endSub = sub;
  }

  // Ring visuals for this frame.
  dressRings(timeSec) {
    this.rings.forEach((r, i) => {
      poseRing(r.mesh, r.passed ? 'done' : (i === this.nextIndex ? 'next' : 'todo'), timeSec);
    });
  }

  objectiveText(state) {
    switch (this.phase) {
      case 'takeoff': return 'Take off northbound — full throttle, ease her up at 40 m/s';
      case 'rings': return `Thread the rings · ${this.ringsDone}/${this.rings.length} flown`;
      case 'final': return state.gearDown ? 'Final: land on the runway and stop' : 'Final: lower the gear (G) and land on the runway';
      case 'done': return 'Sortie complete';
      default: return 'Sortie over';
    }
  }
}
