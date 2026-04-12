export type BeatInfo = {
  /** 1-based beat count since last play() */
  beatIndex: number;
  accented: boolean;
};

export type MetronomeOptions = {
  tempoBpm?: number;
  accent?: number;
  onBeat?: (info: BeatInfo) => void;
};

const MIN_BPM = 30;
const MAX_BPM = 300;
const DEFAULT_BPM = 120;
const CLICK_DURATION_S = 0.05;

function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

function playClick(ctx: AudioContext, accented: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = accented ? 1200 : 880;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  const peak = accented ? 0.28 : 0.18;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + CLICK_DURATION_S);
  osc.start(now);
  osc.stop(now + CLICK_DURATION_S + 0.01);
}

export function createMetronome(options: MetronomeOptions = {}) {
  let tempoBpm = clampBpm(options.tempoBpm ?? DEFAULT_BPM);
  let accent = Math.max(1, Math.floor(options.accent ?? 4));
  const onBeat = options.onBeat;

  let audioContext: AudioContext | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let beatCounter = 0;
  let playing = false;

  function ensureContext(): AudioContext {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    return audioContext;
  }

  function tick(): void {
    const ctx = ensureContext();
    beatCounter += 1;
    // Downbeat: first beat of each group (1, 1+n, 1+2n…), not the last beat of the bar.
    const accented = (beatCounter - 1) % accent === 0;
    playClick(ctx, accented);
    onBeat?.({ beatIndex: beatCounter, accented });
  }

  function schedule(): void {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    const ms = (60_000 / tempoBpm) | 0;
    intervalId = setInterval(tick, ms);
  }

  return {
    get playing(): boolean {
      return playing;
    },

    setTempo(bpm: number): void {
      tempoBpm = clampBpm(bpm);
      if (playing) {
        schedule();
      }
    },

    setAccent(n: number): void {
      accent = Math.max(1, Math.floor(n));
    },

    getAccent(): number {
      return accent;
    },

    getTempoBpm(): number {
      return tempoBpm;
    },

    async play(): Promise<void> {
      if (playing) return;
      const ctx = ensureContext();
      await ctx.resume();
      playing = true;
      beatCounter = 0;
      tick();
      schedule();
    },

    pause(): void {
      if (!playing) return;
      playing = false;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}

export type Metronome = ReturnType<typeof createMetronome>;
