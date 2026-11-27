// hud.js — the instrument layer over the 3D view: two canvas gauges
// (airspeed and attitude), a compass strip, digital readouts, throttle /
// fuel / hull bars, a steering marker that points at the next ring, and
// the centre banners that call out rings, warnings and the result. All of
// it is plain DOM, styled by style.css, updated once a frame.

import { STALL_SPEED } from './flightModel.js';

const $ = (id) => document.getElementById(id);

export function headingDegrees(headingRad) {
  return ((THREE.MathUtils.radToDeg(-headingRad) % 360) + 360) % 360;
}

function drawSpeedGauge(ctx, speedMs) {
  const kt = speedMs * 1.944;
  const S = 150, c = S / 2, R = 62;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#10151c';
  ctx.beginPath(); ctx.arc(c, c, R + 12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3d4a5a'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#dfe9f2'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  for (let v = 0; v <= 160; v += 20) {
    const a = (-210 + (v / 170) * 240) * Math.PI / 180;
    const x1 = c + Math.cos(a) * (R - 8), y1 = c + Math.sin(a) * (R - 8);
    const x2 = c + Math.cos(a) * R, y2 = c + Math.sin(a) * R;
    ctx.strokeStyle = '#8fb4d8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillText(String(v), c + Math.cos(a) * (R - 22), c + Math.sin(a) * (R - 22) + 4);
  }
  // Stall band in amber, cruise band in green.
  ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(c, c, R + 4, (-210 + (48 / 170) * 240) * Math.PI / 180, (-210 + (58 / 170) * 240) * Math.PI / 180); ctx.stroke();
  const a = (-210 + (Math.min(kt, 170) / 170) * 240) * Math.PI / 180;
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + Math.cos(a) * (R - 14), c + Math.sin(a) * (R - 14)); ctx.stroke();
  ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(c, c, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7e93a8'; ctx.font = '10px monospace';
  ctx.fillText('AIRSPEED kt', c, c + 34);
}

function drawHorizon(ctx, pitch, roll) {
  const S = 150, c = S / 2, R = 62;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(c, c, R + 12, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#10151c'; ctx.fillRect(0, 0, S, S);
  ctx.translate(c, c);
  ctx.rotate(-roll);
  const lift = pitch * 95;
  ctx.fillStyle = '#3f8fd2'; ctx.fillRect(-S, -S + lift, S * 2, S);       // sky
  ctx.fillStyle = '#7a5c38'; ctx.fillRect(-S, lift, S * 2, S);            // ground
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-S, lift); ctx.lineTo(S, lift); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1.5;
  for (const off of [-28, 28]) {
    ctx.beginPath(); ctx.moveTo(-16, lift + off); ctx.lineTo(16, lift + off); ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol and bezel.
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(c - 30, c); ctx.lineTo(c - 9, c); ctx.lineTo(c, c + 7); ctx.lineTo(c + 9, c); ctx.lineTo(c + 30, c);
  ctx.stroke();
  ctx.strokeStyle = '#3d4a5a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(c, c, R + 12, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#7e93a8'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', c, c + 52);
}

function drawCompass(ctx, headingDeg) {
  const W = 340, H = 38;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(10,15,20,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#3d4a5a'; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
  const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  const first = Math.ceil((headingDeg - 62) / 5) * 5;
  for (let deg = first; deg <= headingDeg + 62; deg += 5) {
    const shown = ((deg % 360) + 360) % 360;
    const x = W / 2 + (deg - headingDeg) * 2.6;
    if (names[shown] !== undefined) {
      ctx.fillStyle = shown === 0 ? '#ff5a47' : '#dfe9f2';
      ctx.fillText(names[shown], x, 17);
    } else if (shown % 15 === 0) {
      ctx.fillStyle = '#5d7186';
      ctx.fillRect(x - 0.5, 22, 1, 8);
    }
  }
  ctx.fillStyle = '#ffb347';
  ctx.beginPath(); ctx.moveTo(W / 2 - 6, H - 2); ctx.lineTo(W / 2 + 6, H - 2); ctx.lineTo(W / 2, H - 10); ctx.fill();
}

export class Hud {
  constructor() {
    this.speedCtx = $('gauge-speed').getContext('2d');
    this.horizonCtx = $('gauge-horizon').getContext('2d');
    this.compassCtx = $('compass').getContext('2d');
    this.els = {
      alt: $('ro-alt'), spd: $('ro-spd'), hdg: $('ro-hdg'), vs: $('ro-vs'),
      thr: $('bar-throttle'), fuel: $('bar-fuel'), hull: $('bar-hull'),
      gear: $('gear-state'), score: $('stat-score'), time: $('stat-time'),
      objective: $('objective'), banner: $('banner'), bannerSub: $('banner-sub'),
      warning: $('warning'), marker: $('ring-marker'), markerDist: $('ring-marker-dist'),
      overlay: $('overlay'),
    };
    this._v3 = new THREE.Vector3();
  }

  showOverlay(html) { this.els.overlay.innerHTML = html; this.els.overlay.style.display = 'flex'; }
  hideOverlay() { this.els.overlay.style.display = 'none'; }

  update(state, sortie, camera, now) {
    const e = this.els;
    const altFt = Math.max(0, Math.round(state.pos.y * 3.281));
    const spdKt = Math.round(state.speed * 1.944);
    const hdg = Math.round(headingDegrees(state.heading));
    e.alt.textContent = String(altFt).padStart(4, '0');
    e.spd.textContent = String(spdKt).padStart(3, '0');
    e.hdg.textContent = String(hdg).padStart(3, '0');
    e.vs.textContent = `${state.verticalSpeed >= 0 ? '+' : ''}${(state.verticalSpeed * 196.85).toFixed(0)} fpm`;
    e.thr.style.width = `${Math.round(state.throttle * 100)}%`;
    e.fuel.style.width = `${Math.round(state.fuel)}%`;
    e.fuel.style.background = state.fuel < 25 ? '#e0483e' : '#57b25e';
    e.hull.style.width = `${Math.round(state.hull)}%`;
    e.hull.style.background = state.hull < 45 ? '#e0483e' : '#4d9fd6';
    e.gear.textContent = state.gear01 > 0.95 ? 'GEAR DOWN' : state.gear01 < 0.05 ? 'GEAR UP' : 'GEAR MOVING';
    e.gear.style.color = state.gearDown ? '#7dd87d' : '#e8a33d';
    e.score.textContent = sortie.score;
    const t = Math.floor(sortie.elapsed);
    e.time.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    e.objective.textContent = sortie.objectiveText(state);

    drawSpeedGauge(this.speedCtx, state.speed);
    drawHorizon(this.horizonCtx, state.pitch, state.roll);
    drawCompass(this.compassCtx, hdg);

    // Warnings, most urgent first.
    let warn = '';
    if (state.airborne && state.speed < STALL_SPEED + 4 && !state.crashed) warn = 'STALL';
    else if (sortie.phase === 'final' && !state.gearDown && state.pos.y < 160) warn = 'GEAR NOT DOWN';
    else if (state.fuel < 25 && state.fuel > 0) warn = 'LOW FUEL';
    else if (state.fuel <= 0 && state.airborne) warn = 'ENGINE DEAD — GLIDE';
    e.warning.textContent = warn;
    e.warning.style.visibility = warn ? 'visible' : 'hidden';

    // Banner from the sortie (ring calls, result), timed by the game clock.
    if (sortie.banner && now < sortie.banner.until) {
      e.banner.textContent = sortie.banner.text;
      e.bannerSub.textContent = sortie.banner.sub || '';
      e.banner.style.visibility = 'visible';
      e.bannerSub.style.visibility = 'visible';
    } else {
      e.banner.style.visibility = 'hidden';
      e.bannerSub.style.visibility = 'hidden';
    }

    // Next-ring steering marker: project the ring centre to the screen.
    const ring = sortie.nextRing;
    if (ring && state.airborne && !sortie.finished) {
      this._v3.copy(ring.centre).project(camera);
      const behind = this._v3.z > 1;
      let x = (this._v3.x * 0.5 + 0.5) * innerWidth;
      let y = (-this._v3.y * 0.5 + 0.5) * innerHeight;
      if (behind) { x = innerWidth - x; y = innerHeight - 40; }
      x = Math.max(46, Math.min(innerWidth - 46, x));
      y = Math.max(70, Math.min(innerHeight - 60, y));
      e.marker.style.transform = `translate(${x - 23}px, ${y - 23}px)`;
      e.marker.style.opacity = behind ? 0.45 : 1;
      const dist = Math.round(state.pos.distanceTo(ring.centre));
      e.markerDist.textContent = `${dist} m`;
      e.marker.style.visibility = 'visible';
    } else {
      e.marker.style.visibility = 'hidden';
    }
  }
}
