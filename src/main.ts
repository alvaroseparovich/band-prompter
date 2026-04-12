import { syncCsvFilesToDatabase } from "./csvSync";
import { getAllMusics, getMusic, type StoredMusic } from "./db";
import type { MusicSchema } from "./musicTypes";
import { createMetronome, type BeatInfo } from "./metronome";

const FLASH_MS = 80;

const tempoInput = document.querySelector<HTMLInputElement>("#tempo")!;
const accentInput = document.querySelector<HTMLInputElement>("#accent")!;
const counterInput = document.querySelector<HTMLInputElement>("#counter")!;
const playPauseBtn = document.querySelector<HTMLButtonElement>("#playPause")!;
const beatIndicator = document.querySelector<HTMLDivElement>("#beatIndicator")!;
const syncStatus = document.querySelector<HTMLParagraphElement>("#syncStatus")!;
const musicList = document.querySelector<HTMLUListElement>("#musicList")!;
const prompterPanel = document.querySelector<HTMLFieldSetElement>("#prompterPanel")!;
const prompterTitle = document.querySelector<HTMLParagraphElement>("#prompterTitle")!;
const navUp = document.querySelector<HTMLButtonElement>("#navUp")!;
const navDown = document.querySelector<HTMLButtonElement>("#navDown")!;
const closePiece = document.querySelector<HTMLButtonElement>("#closePiece")!;
const lyricsRows = document.querySelector<HTMLDivElement>("#lyricsRows")!;

let flashTimeout: ReturnType<typeof setTimeout> | null = null;

let reflectCounterFromModel = false;

/** Downbeat count since Play when no piece is loaded. */
let downbeatCount = 0;

let currentMusic: StoredMusic | null = null;
let activeKey: number | null = null;
let barsRemainingInSegment = 0;

function setBeatVisual(on: boolean): void {
  beatIndicator.classList.toggle("beep-on", on);
}

function sortedSchemaKeys(ms: MusicSchema): number[] {
  return Object.keys(ms)
    .map(Number)
    .sort((a, b) => a - b);
}

function snapToNearestKey(value: number, keys: number[]): number {
  if (keys.length === 0) return 0;
  if (keys.includes(value)) return value;
  return keys.reduce((best, k) =>
    Math.abs(k - value) < Math.abs(best - value) ? k : best,
  keys[0]!);
}

function barsForRow(row: StoredMusic["music_schema"][number]): number {
  const comp = parseInt(row.Compassos, 10);
  return Number.isFinite(comp) && comp > 0 ? comp : 1;
}

function reflectCounterToInput(): void {
  reflectCounterFromModel = true;
  const display =
    currentMusic !== null && activeKey !== null ? activeKey : downbeatCount;
  counterInput.value = String(display);
  reflectCounterFromModel = false;
}

function applyConfToMetronome(conf: StoredMusic["conf"]): void {
  const bpm = conf["bpm"];
  if (bpm !== undefined) {
    const n = parseInt(bpm, 10);
    if (Number.isFinite(n)) {
      tempoInput.value = String(n);
      metronome.setTempo(n);
    }
  }
  const tpc = conf["Tempo Por Compasso"];
  if (tpc !== undefined) {
    const n = parseInt(tpc, 10);
    if (Number.isFinite(n) && n > 0) {
      accentInput.value = String(n);
      metronome.setAccent(n);
    }
  }
}

function setTransportKey(rawKey: number): void {
  if (!currentMusic) return;
  const keys = sortedSchemaKeys(currentMusic.music_schema);
  activeKey = snapToNearestKey(rawKey, keys);
  const row = currentMusic.music_schema[activeKey];
  if (!row) return;
  barsRemainingInSegment = barsForRow(row);
  reflectCounterToInput();
  updatePrompterFocus();
}

function updatePrompterFocus(): void {
  if (!currentMusic || activeKey === null) return;
  document.querySelectorAll<HTMLElement>(".lyric-row").forEach((el) => {
    const k = Number(el.dataset.key);
    const focused = k === activeKey;
    el.classList.toggle("focused", focused);
    if (focused) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });
}

function renderPrompter(): void {
  lyricsRows.innerHTML = "";
  if (!currentMusic) return;
  const keys = sortedSchemaKeys(currentMusic.music_schema);
  for (const k of keys) {
    const row = currentMusic.music_schema[k]!;
    const div = document.createElement("div");
    div.className = "lyric-row";
    div.dataset.key = String(k);
    if (row.Description.trim() !== "") {
      const desc = document.createElement("div");
      desc.className = "lyric-desc";
      desc.textContent = row.Description;
      div.appendChild(desc);
    }
    if (row.Letra.trim() !== "") {
      const letra = document.createElement("div");
      letra.className = "lyric-letra";
      letra.textContent = row.Letra;
      div.appendChild(letra);
    }
    if (row.Cifra.trim() !== "") {
      const cifra = document.createElement("div");
      cifra.className = "lyric-cifra";
      cifra.textContent = row.Cifra;
      div.appendChild(cifra);
    }
    div.addEventListener("click", () => setTransportKey(k));
    lyricsRows.appendChild(div);
  }
  updatePrompterFocus();
}

function handleDownbeatTransport(): void {
  if (!currentMusic || activeKey === null) return;
  barsRemainingInSegment -= 1;
  if (barsRemainingInSegment > 0) return;

  const keys = sortedSchemaKeys(currentMusic.music_schema);
  const idx = keys.indexOf(activeKey);
  if (idx >= 0 && idx < keys.length - 1) {
    setTransportKey(keys[idx + 1]!);
  } else {
    barsRemainingInSegment = barsForRow(currentMusic.music_schema[activeKey]!);
  }
}

function clearMusicSelection(): void {
  currentMusic = null;
  activeKey = null;
  barsRemainingInSegment = 0;
  prompterPanel.hidden = true;
  prompterTitle.textContent = "";
  lyricsRows.innerHTML = "";
  reflectCounterToInput();
}

async function selectMusic(id: string): Promise<void> {
  const m = await getMusic(id);
  if (!m) return;
  currentMusic = m;
  prompterTitle.textContent = m.title;
  prompterPanel.hidden = false;
  applyConfToMetronome(m.conf);
  const keys = sortedSchemaKeys(m.music_schema);
  const first = keys[0];
  if (first === undefined) {
    clearMusicSelection();
    return;
  }
  setTransportKey(first);
  renderPrompter();
}

const metronome = createMetronome({
  tempoBpm: Number(tempoInput.value) || 120,
  accent: Number(accentInput.value) || 4,
  onBeat(info: BeatInfo) {
    if (flashTimeout !== null) {
      clearTimeout(flashTimeout);
    }
    setBeatVisual(true);
    flashTimeout = setTimeout(() => {
      setBeatVisual(false);
      flashTimeout = null;
    }, FLASH_MS);

    if (!info.accented) return;

    if (currentMusic !== null && activeKey !== null) {
      handleDownbeatTransport();
    } else {
      downbeatCount += 1;
      reflectCounterToInput();
    }
  },
});

function syncControlsFromMetronome(): void {
  metronome.setTempo(Number(tempoInput.value) || 120);
  metronome.setAccent(Number(accentInput.value) || 4);
}

async function refreshMusicList(): Promise<void> {
  const all = await getAllMusics();
  musicList.innerHTML = "";
  for (const m of all) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = m.title;
    btn.addEventListener("click", () => {
      void selectMusic(m.id);
    });
    li.appendChild(btn);
    musicList.appendChild(li);
  }
}

tempoInput.addEventListener("change", () => {
  metronome.setTempo(Number(tempoInput.value) || 120);
});

accentInput.addEventListener("change", () => {
  metronome.setAccent(Number(accentInput.value) || 4);
});

counterInput.addEventListener("change", () => {
  if (reflectCounterFromModel) return;
  const v = parseInt(counterInput.value, 10);
  if (!Number.isFinite(v)) return;
  if (currentMusic !== null) {
    setTransportKey(v);
  } else {
    downbeatCount = Math.max(0, Math.floor(v));
    reflectCounterToInput();
  }
});

navUp.addEventListener("click", () => {
  if (!currentMusic || activeKey === null) return;
  const keys = sortedSchemaKeys(currentMusic.music_schema);
  const idx = keys.indexOf(activeKey);
  if (idx > 0) setTransportKey(keys[idx - 1]!);
});

navDown.addEventListener("click", () => {
  if (!currentMusic || activeKey === null) return;
  const keys = sortedSchemaKeys(currentMusic.music_schema);
  const idx = keys.indexOf(activeKey);
  if (idx >= 0 && idx < keys.length - 1) setTransportKey(keys[idx + 1]!);
});

closePiece.addEventListener("click", () => {
  clearMusicSelection();
});

playPauseBtn.addEventListener("click", async () => {
  if (metronome.playing) {
    metronome.pause();
    playPauseBtn.textContent = "Play";
    setBeatVisual(false);
    if (flashTimeout !== null) {
      clearTimeout(flashTimeout);
      flashTimeout = null;
    }
  } else {
    syncControlsFromMetronome();
    if (currentMusic === null) {
      downbeatCount = 0;
    } else if (activeKey !== null) {
      const row = currentMusic.music_schema[activeKey];
      if (row) barsRemainingInSegment = barsForRow(row);
    }
    reflectCounterToInput();
    await metronome.play();
    playPauseBtn.textContent = "Pause";
  }
});

void (async () => {
  try {
    await syncCsvFilesToDatabase();
    syncStatus.textContent = "CSVs synced to IndexedDB.";
    await refreshMusicList();
  } catch (e) {
    syncStatus.textContent =
      e instanceof Error ? e.message : "Failed to sync CSVs.";
  }
})();

reflectCounterToInput();
