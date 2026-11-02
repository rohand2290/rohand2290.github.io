// Thunder and a quiet rain loop. Sound is off by default; the choice is remembered.
// If public/audio/*.ogg exist they are used; otherwise the sounds are synthesized,
// so the site never ships broken audio.

const STORAGE_KEY = 'archipelago:sound';

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
    this.loading = Promise.all([
      get(`${base}audio/thunder-1.ogg`),
      get(`${base}audio/thunder-2.ogg`),
      get(`${base}audio/rain-loop.ogg`),
    ]).then(([t1, t2, rain]) => {
      this.thunderFiles = [t1, t2].filter((b): b is AudioBuffer => !!b);
      this.rainFile = rain;
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
