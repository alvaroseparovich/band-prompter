import { syncCsvFilesToDatabase } from "./csvSync";
import { getAllMusics } from "./db";
import { createMetronome, type BeatInfo } from "./metronome";

const FLASH_MS = 80;

const tempoInput = document.querySelector<HTMLInputElement>("#tempo")!;
const accentInput = document.querySelector<HTMLInputElement>("#accent")!;
const counterInput = document.querySelector<HTMLInputElement>("#counter")!;
const playPauseBtn = document.querySelector<HTMLButtonElement>("#playPause")!;
const beatIndicator = document.querySelector<HTMLDivElement>("#beatIndicator")!;
const syncStatus = document.querySelector<HTMLParagraphElement>("#syncStatus")!;
const musicList = document.querySelector<HTMLUListElement>("#musicList")!;

let flashTimeout: ReturnType<typeof setTimeout> | null = null;

/** Prevents counter `change` feedback when the value is set from the metronome. */
let reflectCounterFromModel = false;

/** Downbeat count since Play when no piece is loaded (1.1.0). */
let downbeatCount = 0;

function setBeatVisual(on: boolean): void {
  beatIndicator.classList.toggle("beep-on", on);
}

function reflectCounterToInput(): void {
  reflectCounterFromModel = true;
  counterInput.value = String(downbeatCount);
  reflectCounterFromModel = false;
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

    if (info.accented) {
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
  downbeatCount = Math.max(0, Math.floor(v));
  reflectCounterToInput();
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
    downbeatCount = 0;
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
