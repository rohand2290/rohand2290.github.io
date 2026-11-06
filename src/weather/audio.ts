// Thunder, a quiet rain loop, and interface cues. The cues are built like console menu sounds:
// a very short attack tick, a pitched FM pluck for the body, and a little room around it. They
// share one key (D major) so overlapping cues stay in tune; opening rises, closing falls.
// Sound is off by default; the choice is remembered. If public/audio/*.ogg exist they are
// used; otherwise the sounds are synthesized, so the site never ships broken audio.

const STORAGE_KEY = 'archipelago:sound';

/** Every interface cue the site can play. */
export type Cue =
  | 'noteOpen'
  | 'noteClose'
  | 'notePick'
  | 'panelOpen'
  | 'panelClose'
  | 'stepGrass'
  | 'stepPuddle'
  | 'stepPlank'
  | 'whoosh'
  | 'jump'
  | 'click'
  | 'hover'
  | 'soundOn';

/**
 * Optional recorded replacements for synthesized cues, as paths under public/audio/.
 * Only listed files are fetched (so missing ones never 404). Example:
 *   noteOpen: 'sfx/note-open.ogg',
 */
const CUE_FILES: Partial<Record<Cue, string>> = {};

/** Minimum gap between repeats of the same cue, in seconds (stops stacking on rapid input). */
const CUE_GAP: Partial<Record<Cue, number>> = { click: 0.04, hover: 0.05, notePick: 0.06, whoosh: 0.3, jump: 0.15 };

/** D major, in Hz. */
const D5 = 587.33;
const FS5 = 739.99;
const A5 = 880;
const B5 = 987.77;
const D6 = 1174.66;
const E6 = 1318.51;
const FS6 = 1479.98;
const A6 = 1760;

/** Moving between items walks up and down this scale, like a menu cursor. */
const PICK_NOTES = [A5, B5, D6, E6, FS6, E6, D6, B5];

function readPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function writePref(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: the toggle still works for this visit */
  }
}

export class Sound {
  enabled = readPref();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Interface cues mix here, through a limiter, so stacked cues never clip. */
  private ui: GainNode | null = null;
  /** Send into the short room reverb. */
  private room: GainNode | null = null;
  private pickStep = 0;
  private rainNode: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private wantRain = true;
  private thunderFiles: AudioBuffer[] = [];
  private rainFile: AudioBuffer | null = null;
  private cueFiles = new Map<Cue, AudioBuffer>();
  private lastCue = new Map<Cue, number>();
  private white: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;

  /** Must be called from a user gesture the first time (autoplay rules). */
  async setEnabled(on: boolean) {
    this.enabled = on;
    writePref(on);
    if (on) {
      this.ensureContext();
      await this.ctx!.resume();
      await this.load();
      this.syncRain();
    } else {
      this.stopRain();
      await this.ctx?.suspend();
    }
  }

  /** Rain loop only plays when sound is on and it is actually raining. */
  setRaining(raining: boolean) {
    this.wantRain = raining;
    if (this.enabled && this.ctx) this.syncRain();
  }

  thunder(intensity = 1) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.55 * intensity;
    out.connect(this.master!);
    if (this.thunderFiles.length) {
      const src = ctx.createBufferSource();
      src.buffer = this.thunderFiles[Math.floor(Math.random() * this.thunderFiles.length)];
      src.connect(out);
      src.start();
      return;
    }
    // Synthesized: a short crack followed by a long low rumble.
    const now = ctx.currentTime;
    const dur = 3.5 + Math.random() * 2;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(dur + 0.5, 'brown');
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(900, now);
    low.frequency.exponentialRampToValueAtTime(140, now + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(1, now + 0.08);
    // A couple of rolling swells.
    env.gain.exponentialRampToValueAtTime(0.45, now + 0.6);
    env.gain.exponentialRampToValueAtTime(0.8, now + 1.0 + Math.random() * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    noise.connect(low).connect(env).connect(out);
    noise.start(now);
    noise.stop(now + dur + 0.1);
  }

  /** Play an interface cue. Silent when sound is off or not yet unlocked. */
  play(cue: Cue) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const gap = CUE_GAP[cue] ?? 0;
    if (gap && now - (this.lastCue.get(cue) ?? -1) < gap) return;
    this.lastCue.set(cue, now);

    const file = this.cueFiles.get(cue);
    if (file) {
      const src = ctx.createBufferSource();
      src.buffer = file;
      src.connect(this.ui!);
      src.start();
      return;
    }

    // Tiny random detune so repeated cues (footsteps above all) don't sound mechanical.
    const v = () => 0.9 + Math.random() * 0.2;
    switch (cue) {
      case 'noteOpen':
        // A bubble pops up, then a rising fifth lands with a shimmer on top.
        this.tick(now, 0.05, 3800);
        this.blip(now, 320, 880, 0.09, 0.09);
        this.pluck(now + 0.045, A5, 0.26, 0.085);
        this.pluck(now + 0.105, D6, 0.5, 0.1);
        this.pluck(now + 0.105, A6, 0.32, 0.022);
        break;
      case 'noteClose':
        // The same fifth falling: quicker and quieter than opening, so it reads as dismissed.
        this.tick(now, 0.035, 2600);
        this.blip(now, 760, 260, 0.1, 0.07);
        this.pluck(now, A5, 0.16, 0.06);
        this.pluck(now + 0.065, D5, 0.28, 0.08);
        break;
      case 'notePick':
        this.tick(now, 0.04, 3400);
        this.pluck(now, PICK_NOTES[this.pickStep], 0.2, 0.08);
        this.pickStep = (this.pickStep + 1) % PICK_NOTES.length;
        break;
      case 'panelOpen':
        // The biggest cue: air rising under a full arpeggio, for the full-screen reading panel.
        this.tick(now, 0.05, 3000);
        this.sweep(now, 0.24, 700, 4200, 0.045, 1.4, 0.6, this.ui!);
        this.blip(now, 170, 300, 0.12, 0.07);
        this.pluck(now, D5, 0.2, 0.065);
        this.pluck(now + 0.055, FS5, 0.2, 0.07);
        this.pluck(now + 0.11, A5, 0.24, 0.075);
        this.pluck(now + 0.165, D6, 0.6, 0.095);
        this.pluck(now + 0.165, FS6, 0.4, 0.02);
        break;
      case 'panelClose':
        this.tick(now, 0.04, 2400);
        this.sweep(now, 0.17, 3600, 800, 0.035, 1.4, 0.35, this.ui!);
        this.pluck(now, A5, 0.14, 0.06);
        this.pluck(now + 0.05, FS5, 0.15, 0.065);
        this.pluck(now + 0.1, D5, 0.3, 0.08);
        this.blip(now + 0.1, 240, 130, 0.09, 0.07);
        break;
      case 'stepGrass':
        this.thud(now, 0.07, 420 * v(), 0.05);
        this.rustle(now, 0.05, 2400 * v(), 0.012);
        break;
      case 'stepPuddle': {
        this.rustle(now, 0.09, 3200 * v(), 0.05);
        // A little bubble: a quick pitch drop.
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(1100 * v(), now);
        o.frequency.exponentialRampToValueAtTime(320, now + 0.07);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.035, now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        o.connect(g).connect(this.master!);
        o.start(now);
        o.stop(now + 0.1);
        break;
      }
      case 'stepPlank': {
        // A hollow wooden knock with a faint creak.
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        const f = 190 * v();
        o.frequency.setValueAtTime(f, now);
        o.frequency.exponentialRampToValueAtTime(f * 0.7, now + 0.09);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.07, now + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        o.connect(g).connect(this.master!);
        o.start(now);
        o.stop(now + 0.14);
        this.thud(now, 0.05, 900 * v(), 0.03);
        break;
      }
      case 'whoosh':
        this.sweep(now, 0.7, 300, 1800, 0.12, 1.2, 0.3);
        break;
      case 'jump':
        // A springy pitch lift with a little air.
        this.blip(now, 300, 760, 0.12, 0.05);
        this.sweep(now, 0.16, 600, 2400, 0.03, 1.4, 0.35, this.ui!);
        break;
      case 'click':
        this.tick(now, 0.055, 3400);
        this.pluck(now, D6, 0.09, 0.05, 0);
        break;
      case 'hover':
        // Barely there: a cursor tick, heard more as texture than as a note.
        this.tick(now, 0.02, 4800);
        this.pluck(now, E6, 0.05, 0.016, 0);
        break;
      case 'soundOn':
        this.pluck(now, D5, 0.25, 0.07);
        this.pluck(now + 0.08, A5, 0.25, 0.075);
        this.pluck(now + 0.16, D6, 0.3, 0.08);
        this.pluck(now + 0.24, FS6, 0.7, 0.085);
        break;
    }
  }

  /** Bandpassed noise burst: paper, grass, cloth. */
  private rustle(at: number, dur: number, freq: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoise();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = 0.9;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + dur * 0.15);
    // A slight flutter, like a sheet catching the air.
    env.gain.exponentialRampToValueAtTime(gain * 0.4, at + dur * 0.45);
    env.gain.exponentialRampToValueAtTime(gain * 0.7, at + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(band).connect(env).connect(this.master!);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  /** Noise swept through a bandpass from one frequency to another: page turns and whooshes. */
  private sweep(at: number, dur: number, from: number, to: number, gain: number, q: number, peakAt = 0.5, out: AudioNode = this.master!) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoise();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = q;
    band.frequency.setValueAtTime(from, at);
    band.frequency.exponentialRampToValueAtTime(to, at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + dur * peakAt);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(band).connect(env).connect(out);
    src.start(at, Math.random() * 0.3);
    src.stop(at + dur + 0.05);
  }

  /** Short lowpassed noise: a soft footfall or tap. */
  private thud(at: number, dur: number, cutoff: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoise();
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(low).connect(env).connect(this.master!);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.05);
  }

  /**
   * The body of every cue: a two-operator FM pluck. The modulator's brightness dies away much
   * faster than the note, which gives the woody, kalimba-like strike, and the pitch settles
   * from just above the note, which makes the start feel snappy.
   */
  private pluck(at: number, freq: number, dur: number, gain: number, wet = 0.3) {
    const ctx = this.ctx!;
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq * 1.025, at);
    carrier.frequency.exponentialRampToValueAtTime(freq, at + 0.018);

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * 4;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(freq * 1.1, at);
    depth.gain.exponentialRampToValueAtTime(1, at + Math.min(dur, 0.14));
    mod.connect(depth).connect(carrier.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    carrier.connect(env);
    this.sendUi(env, wet);
    mod.start(at);
    carrier.start(at);
    mod.stop(at + dur + 0.02);
    carrier.stop(at + dur + 0.02);
  }

  /** A sine sliding between two pitches: the "bloop" of a pop-up, or low weight under a cue. */
  private blip(at: number, from: number, to: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(env);
    this.sendUi(env, 0.1);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** A few milliseconds of bright noise: the tactile "click" that makes a cue feel instant. */
  private tick(at: number, gain: number, freq: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.whiteNoise();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    band.Q.value = 1.1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.014);
    src.connect(band).connect(env);
    this.sendUi(env, 0);
    src.start(at, Math.random() * 0.5);
    src.stop(at + 0.03);
  }

  private sendUi(node: AudioNode, wet: number) {
    node.connect(this.ui!);
    if (!wet) return;
    const send = this.ctx!.createGain();
    send.gain.value = wet;
    node.connect(send).connect(this.room!);
  }

  /** A half-second of decaying, darkening noise, used as a small room's impulse response. */
  private roomImpulse(): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const coef = 0.55 - 0.4 * t; // highs fade first
        last += coef * (Math.random() * 2 - 1 - last);
        d[i] = last * Math.pow(1 - t, 4);
      }
    }
    return buf;
  }

  private whiteNoise(): AudioBuffer {
    if (this.white) return this.white;
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.white = buf;
    return buf;
  }

  private ensureContext() {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);

    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 6;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    limiter.connect(this.master);
    this.ui = this.ctx.createGain();
    this.ui.connect(limiter);

    const verb = this.ctx.createConvolver();
    verb.buffer = this.roomImpulse();
    this.room = this.ctx.createGain();
    this.room.connect(verb).connect(this.ui);
  }

  private load(): Promise<void> {
    if (this.loading) return this.loading;
    const ctx = this.ctx!;
    const get = async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok || !(res.headers.get('content-type') ?? '').includes('audio')) return null;
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    };
    const base = import.meta.env.BASE_URL;
    const cues = Object.entries(CUE_FILES) as [Cue, string][];
    this.loading = Promise.all([
      get(`${base}audio/thunder-1.ogg`),
      get(`${base}audio/thunder-2.ogg`),
      get(`${base}audio/rain-loop.ogg`),
      Promise.all(cues.map(([, path]) => get(`${base}audio/${path}`))),
    ]).then(([t1, t2, rain, cueBufs]) => {
      this.thunderFiles = [t1, t2].filter((b): b is AudioBuffer => !!b);
      this.rainFile = rain;
      cues.forEach(([cue], i) => {
        const buf = cueBufs[i];
        if (buf) this.cueFiles.set(cue, buf);
      });
    });
    return this.loading;
  }

  private syncRain() {
    if (this.wantRain && !this.rainNode) this.startRain();
    if (!this.wantRain) this.stopRain();
  }

  private startRain() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(this.rainFile ? 0.35 : 0.06, ctx.currentTime + 1.5);
    if (this.rainFile) {
      src.buffer = this.rainFile;
      src.connect(gain);
    } else {
      src.buffer = this.noiseBuffer(4, 'pink');
      const band = ctx.createBiquadFilter();
      band.type = 'lowpass';
      band.frequency.value = 2600;
      const hi = ctx.createBiquadFilter();
      hi.type = 'highpass';
      hi.frequency.value = 250;
      src.connect(hi).connect(band).connect(gain);
    }
    gain.connect(this.master!);
    src.start();
    this.rainNode = src;
    this.rainGain = gain;
  }

  private stopRain() {
    if (!this.rainNode || !this.ctx) return;
    const node = this.rainNode;
    this.rainGain!.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
    setTimeout(() => node.stop(), 1500);
    this.rainNode = null;
    this.rainGain = null;
  }

  private noiseBuffer(seconds: number, color: 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (color === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    } else {
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
      // Cross-fade the ends so the loop has no click.
      const fade = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        d[i] = d[i] * k + d[len - fade + i] * (1 - k);
      }
    }
    return buf;
  }
}
