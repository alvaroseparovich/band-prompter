import { createMetronome } from "./metronome";

const FLASH_MS = 80;

const tempoInput = document.querySelector<HTMLInputElement>("#tempo")!;
const accentInput = document.querySelector<HTMLInputElement>("#accent")!;
const playPauseBtn = document.querySelector<HTMLButtonElement>("#playPause")!;
const beatIndicator = document.querySelector<HTMLDivElement>("#beatIndicator")!;

let flashTimeout: ReturnType<typeof setTimeout> | null = null;

function setBeatVisual(on: boolean): void {
  beatIndicator.classList.toggle("beep-on", on);
}

const metronome = createMetronome({
  tempoBpm: Number(tempoInput.value) || 120,
  accent: Number(accentInput.value) || 4,
  onBeat() {
    if (flashTimeout !== null) {
      clearTimeout(flashTimeout);
    }
    setBeatVisual(true);
    flashTimeout = setTimeout(() => {
      setBeatVisual(false);
      flashTimeout = null;
    }, FLASH_MS);
  },
});

function syncControlsFromMetronome(): void {
  metronome.setTempo(Number(tempoInput.value) || 120);
  metronome.setAccent(Number(accentInput.value) || 4);
}

tempoInput.addEventListener("change", () => {
  metronome.setTempo(Number(tempoInput.value) || 120);
});

accentInput.addEventListener("change", () => {
  metronome.setAccent(Number(accentInput.value) || 4);
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
    await metronome.play();
    playPauseBtn.textContent = "Pause";
  }
});
