// Thunder, a quiet rain loop, and small interface cues (paper notes, footsteps, a whoosh).
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
  | 'click'
  | 'soundOn';

/**
 * Optional recorded replacements for synthesized cues, as paths under public/audio/.
 * Only listed files are fetched (so missing ones never 404). Example:
 *   noteOpen: 'sfx/note-open.ogg',
 */
const CUE_FILES: Partial<Record<Cue, string>> = {};

/** Minimum gap between repeats of the same cue, in seconds (stops stacking on rapid input). */
const CUE_GAP: Partial<Record<Cue, number>> = { click: 0.04, notePick: 0.06, whoosh: 0.3 };

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
      src.connect(this.master!);
      src.start();
      return;
    }

    // Tiny random detune so repeated cues (footsteps above all) don't sound mechanical.
    const v = () => 0.9 + Math.random() * 0.2;
    switch (cue) {
      case 'noteOpen':
        // Paper unfolding, then a soft two-note chime.
        this.rustle(now, 0.22, 2800 * v(), 0.18);
        this.rustle(now + 0.07, 0.16, 4200 * v(), 0.1);
        this.chime(now + 0.05, 659.25, 0.9, 0.07);
        this.chime(now + 0.13, 987.77, 1.1, 0.055);
        break;
      case 'noteClose':
        this.rustle(now, 0.16, 2200 * v(), 0.14);
        this.chime(now + 0.02, 783.99, 0.6, 0.045);
        this.chime(now + 0.09, 523.25, 0.8, 0.045);
        break;
      case 'notePick':
        this.rustle(now, 0.09, 3600 * v(), 0.09);
        this.chime(now, 1174.66, 0.35, 0.03);
        break;
      case 'panelOpen':
        // A page turning: a sweep of paper upward.
        this.sweep(now, 0.32, 900, 5200, 0.2, 2.2);
        this.chime(now + 0.18, 880, 0.9, 0.04);
        break;
      case 'panelClose':
        this.sweep(now, 0.26, 4600, 900, 0.16, 2.2);
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
      case 'click':
        this.chime(now, 1567.98, 0.08, 0.025);
        this.thud(now, 0.03, 2000, 0.03);
        break;
      case 'soundOn':
        this.chime(now, 523.25, 0.8, 0.05);
        this.chime(now + 0.09, 659.25, 0.8, 0.05);
        this.chime(now + 0.18, 783.99, 1.2, 0.05);
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
  private sweep(at: number, dur: number, from: number, to: number, gain: number, q: number, peakAt = 0.5) {
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
    src.connect(band).connect(env).connect(this.master!);
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

  /** A soft bell-like tone (sine plus a quiet octave partial). */
  private chime(at: number, freq: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    env.connect(this.master!);
    for (const [mult, level] of [[1, 1], [2, 0.25]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(env);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
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
