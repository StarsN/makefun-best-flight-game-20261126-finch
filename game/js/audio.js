// audio.js — all sound is synthesised with WebAudio, no audio files: a
// puttering engine whose pitch follows the throttle, wind that rises
// with airspeed, a two-note chime for each ring, a thud for a heavy
// landing and a small brass figure when the sortie is complete. The
// context is created lazily on the first pilot input, as browsers ask.

export class SoundBoard {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: two detuned saws through a lowpass, gain tied to throttle.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter);
    osc2.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    osc2.start();
    this.engineOsc2 = osc2;
    this.engineFilter = engineFilter;

    // Wind: looped white noise through a bandpass.
    const len = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 640;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    noise.start();
  }

  update(throttle, speed, onGround) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 55 + throttle * 145;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 0.5 + 1.5, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + throttle * 700, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.13, t, 0.1);
    const wind = Math.min(0.22, Math.max(0, (speed - 12) / 84) * 0.22);
    this.windGain.gain.setTargetAtTime(onGround ? wind * 0.3 : wind, t, 0.15);
  }

  blip(freq, at, dur, type = 'sine', gain = 0.16) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  ring() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(880, t, 0.35);
    this.blip(1318, t + 0.09, 0.45);
  }

  thud() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.blip(72, t, 0.3, 'triangle', 0.4);
    this.blip(49, t + 0.02, 0.42, 'sine', 0.35);
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = ctx.sampleRate * 0.7;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.7);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  success() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, t + i * 0.13, 0.5, 'triangle', 0.18));
  }
}
