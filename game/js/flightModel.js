// flightModel.js — an arcade flight model with real discipline in it:
// throttle spools the engine, banks turn the aircraft (rudder only helps),
// slow flight stalls and sinks, and the ground is judged honestly — a
// gentle gear-down arrival on the runway is a landing, anything else is
// a crash or a very rough forced landing. Orientation is kept as
// heading/pitch/roll angles and composed into a quaternion each step,
// which keeps the model stable and the camera calm.

import { heightAt, runwayInfo, overWater, WATER_LEVEL } from './terrain.js';

export const MAX_SPEED = 84;      // m/s at full throttle, level
export const STALL_SPEED = 25;
const GEAR_CLEARANCE = 1.62;      // belly-to-ground with gear down
const BELLY_CLEARANCE = 0.82;     // gear up

export class FlightState {
  constructor() { this.reset(); }

  reset() {
    const rw = runwayInfo();
    this.pos = new THREE.Vector3(rw.centreX, rw.groundY + GEAR_CLEARANCE, rw.centreZ + 128);
    this.heading = 0; // facing -Z (north), the full runway ahead
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.gearDown = true;
    this.gear01 = 1;
    this.fuel = 100;
    this.hull = 100;
    this.onGround = true;
    this.airborne = false;
    this.crashed = false;
    this.landed = false;
    this.verticalSpeed = 0;
    this.events = [];
    this.quaternion = new THREE.Quaternion();
    this.syncQuaternion();
  }

  get forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
  }

  syncQuaternion() {
    // state.roll is pilot-signed (positive = bank right); the Euler z
    // angle that banks the model right is its negative.
    this.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.heading, -this.roll, 'YXZ'));
  }

  toggleGear() {
    if (!this.crashed) this.gearDown = !this.gearDown;
  }

  step(dt, input) {
    this.events.length = 0;
    if (this.crashed || this.landed) return;

    // --- engine and throttle -------------------------------------------
    const wheelTrim = input.wheelTrim || 0;
    this.throttle = Math.min(1, Math.max(0,
      this.throttle + input.throttleAxis * dt * 0.55));
    const throttleTarget = Math.max(this.throttle, wheelTrim > 0 ? wheelTrim : 0);
    const engineOut = this.fuel > 0 ? throttleTarget : 0;
    this.fuel = Math.max(0, this.fuel - dt * (0.14 + engineOut * 0.52));

    // Gear transit takes about two seconds.
    const gearTarget = this.gearDown ? 1 : 0;
    this.gear01 += Math.sign(gearTarget - this.gear01) * dt * 0.5;
    this.gear01 = Math.min(1, Math.max(0, this.gear01));

    // --- rotation --------------------------------------------------------
    const authority = Math.min(1, Math.max(0.22, this.speed / 40));
    if (this.onGround) {
      // On the roll the nose stays down until rotation speed, then the
      // elevator can lift it a little; the wing does the rest.
      const canRotate = this.speed > 37;
      const target = canRotate ? Math.max(0, input.pitch) * 0.30 : 0;
      this.pitch += (target - this.pitch) * Math.min(1, dt * 3.2);
      this.roll += (0 - this.roll) * Math.min(1, dt * 5);
      if (this.speed > 6) this.heading += input.yaw * dt * 0.25 * (this.speed / 40);
    } else {
      const rollTarget = input.roll * 1.02;
      this.roll += (rollTarget - this.roll) * Math.min(1, dt * 3.4);
      this.pitch += input.pitch * 0.95 * authority * dt;
      this.pitch = Math.min(0.72, Math.max(-0.95, this.pitch));
      // A banked wing turns the nose; rudder adds a little on top.
      const turnRate = -Math.sin(this.roll) * 10.5 / Math.max(this.speed, 21) * 1.5
                     + input.yaw * 0.30 * authority;
      this.heading += turnRate * dt;
      // Stall: the nose drops away when the wing gives up.
      if (this.speed < STALL_SPEED) this.pitch -= dt * 0.38;
    }
    this.syncQuaternion();

    // --- speed along the nose -------------------------------------------
    const fwd = this.forward;
    const engineAccel = engineOut * 23 * (1 - this.speed / 118);
    const dragQuad = 0.0036 * this.speed * this.speed;
    const dragGear = this.gear01 * 0.55;
    const dragBrake = input.brake && !this.onGround ? 2.4 : 0;
    const gravityAlong = -9.81 * fwd.y;
    let accel = engineAccel - dragQuad - dragGear - dragBrake + gravityAlong;
    if (this.onGround) {
      accel = engineAccel - this.speed * 0.06 - (input.brake ? 7.5 : 0.35);
    }
    this.speed = Math.max(0, this.speed + accel * dt);

    // --- translate --------------------------------------------------------
    const prevY = this.pos.y;
    const vel = fwd.clone().multiplyScalar(this.speed);
    if (!this.onGround && this.speed < STALL_SPEED) {
      vel.y -= (STALL_SPEED - this.speed) * 0.62; // the sink of a stalled wing
    }
    this.pos.addScaledVector(vel, dt);
    this.verticalSpeed = dt > 0 ? (this.pos.y - prevY) / dt : 0;

    // --- the ground -------------------------------------------------------
    const groundH = heightAt(this.pos.x, this.pos.z);
    const clearance = this.gearDown || this.gear01 > 0.5 ? GEAR_CLEARANCE : BELLY_CLEARANCE;
    const floorY = groundH + clearance;
    if (this.pos.y <= floorY) {
      this.pos.y = floorY;
      this.contact(groundH, vel);
    } else if (this.onGround && this.speed > 41 && this.pitch > 0.05) {
      this.onGround = false; // rotated and flying
      this.airborne = true;
      this.events.push('airborne');
    }
    if (!this.onGround && this.pos.y <= WATER_LEVEL + 0.4 && overWater(this.pos.x, this.pos.z)) {
      this.crash('You ditched in the lake.');
    }
  }

  contact(groundH, vel) {
    const rw = runwayInfo();
    const onRunway = Math.abs(this.pos.x - rw.centreX) <= rw.halfWidth
      && Math.abs(this.pos.z - rw.centreZ) <= rw.halfLength
      && Math.abs(groundH - rw.groundY) < 2.5;
    const wasAirborne = !this.onGround;
    if (wasAirborne) this.events.push('touchdown');

    if (onRunway && this.gearDown) {
      if (this.verticalSpeed < -8.5 || Math.abs(this.roll) > 0.42) {
        this.crash('The landing gear collapsed — that arrival was too hard.');
        return;
      }
      if (this.verticalSpeed < -4.2) {
        this.hull = Math.max(0, this.hull - (-this.verticalSpeed - 4.2) * 7);
        this.events.push('hard-landing');
      }
      this.onGround = true;
      if (this.airborne && this.speed < 0.6) {
        this.speed = 0;
        this.landed = true;
        this.events.push('stopped');
      }
    } else if (wasAirborne) {
      const rough = this.verticalSpeed > -3.4 && this.speed < 30 && Math.abs(this.roll) < 0.3 && !this.gearDown;
      if (rough) {
        this.hull = Math.max(0, this.hull - 34);
        this.onGround = true;
        this.speed = Math.min(this.speed, 12);
        this.events.push('forced-landing');
        if (this.speed < 0.6) { this.landed = true; this.events.push('stopped'); }
      } else {
        this.crash(this.gearDown
          ? 'You put down off the runway and the ridge won.'
          : 'That was a crash, not a landing.');
      }
    }
    if (this.hull <= 0 && !this.crashed) this.crash('The Kestrel broke up under the damage.');
  }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true;
    this.hull = 0;
    this.events.push('crash');
    this.crashReason = reason;
  }
}
