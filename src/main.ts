import { syncCsvFilesToDatabase } from "./csvSync";
import { rowsToMusicDocument } from "./csvMusic";
import { deleteMusic, getAllMusics, getMusic, putMusic, type StoredMusic } from "./db";
import { extractSpreadsheetId, getAllSpreadsheetTabValues } from "./googleSheets";
import type { MusicSchema } from "./musicTypes";
import { createMetronome, type BeatInfo } from "./metronome";

const FLASH_MS = 80;

const tempoInput = document.querySelector<HTMLInputElement>("#tempo")!;
const accentInput = document.querySelector<HTMLInputElement>("#accent")!;
const counterInput = document.querySelector<HTMLInputElement>("#counter")!;
const ttsEnabledInput = document.querySelector<HTMLInputElement>("#ttsEnabled");
const playPauseBtn = document.querySelector<HTMLButtonElement>("#playPause")!;
const beatIndicator = document.querySelector<HTMLDivElement>("#beatIndicator")!;
const syncStatus = document.querySelector<HTMLParagraphElement>("#syncStatus")!;
const emptyLibraryActions = document.querySelector<HTMLDivElement>("#emptyLibraryActions");
const loadPresetBtn = document.querySelector<HTMLButtonElement>("#loadPresetBtn");
const showLoremBtn = document.querySelector<HTMLButtonElement>("#showLoremBtn");
const musicList = document.querySelector<HTMLUListElement>("#musicList")!;
const prompterPanel = document.querySelector<HTMLFieldSetElement>("#prompterPanel")!;
const prompterTitle = document.querySelector<HTMLParagraphElement>("#prompterTitle")!;
const navUp = document.querySelector<HTMLButtonElement>("#navUp")!;
const navDown = document.querySelector<HTMLButtonElement>("#navDown")!;
const closePiece = document.querySelector<HTMLButtonElement>("#closePiece")!;
const lyricsViewport = document.querySelector<HTMLDivElement>("#lyricsViewport")!;
const lyricsRows = document.querySelector<HTMLDivElement>("#lyricsRows")!;
const sheetUrlInput = document.querySelector<HTMLInputElement>("#sheetUrl");
const sheetRangeInput = document.querySelector<HTMLInputElement>("#sheetRange");
const sheetImportBtn = document.querySelector<HTMLButtonElement>("#sheetImportBtn");
const sheetImportStatus = document.querySelector<HTMLParagraphElement>("#sheetImportStatus");

const LYRIC_SCROLL_MS = 900;
const LYRIC_FOCUS_TOP_GUTTER_PX = 96;

let flashTimeout: ReturnType<typeof setTimeout> | null = null;
let lyricScrollRaf: number | null = null;

let reflectCounterFromModel = false;

/** Downbeat count since Play when no piece is loaded. */
let downbeatCount = 0;

let currentMusic: StoredMusic | null = null;
let activeKey: number | null = null;
let beatsElapsedInSegment = 0;

function setSheetImportStatus(msg: string): void {
  if (!sheetImportStatus) return;
  sheetImportStatus.textContent = msg;
}

function toSheetRecordId(spreadsheetId: string, sheetId: number): string {
  return `gsheet:${spreadsheetId}:${sheetId}`;
}

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
  if (!Number.isFinite(comp)) return 1;
  return Math.max(0, Math.floor(comp));
}

function beatsPerBar(): number {
  const n = parseInt(accentInput.value, 10);
  return Number.isFinite(n) && n > 0 ? n : metronome.getAccent();
}

function totalBeatsForRow(row: StoredMusic["music_schema"][number]): number {
  return Math.max(1, barsForRow(row) * beatsPerBar());
}

function normalizeCompassosValue(raw: string): string {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return "0";
  return String(Math.floor(n));
}

function nextKeyAfter(key: number): number | null {
  if (!currentMusic) return null;
  const keys = sortedSchemaKeys(currentMusic.music_schema);
  const idx = keys.indexOf(key);
  if (idx < 0 || idx >= keys.length - 1) return null;
  return keys[idx + 1]!;
}

async function saveCompassosForRow(key: number, rawValue: string): Promise<void> {
  if (!currentMusic) return;
  const row = currentMusic.music_schema[key];
  if (!row) return;
  const normalized = normalizeCompassosValue(rawValue);
  if (row.Compassos === normalized) return;
  row.Compassos = normalized;
  currentMusic.updatedAt = Date.now();
  await putMusic(currentMusic);
  if (activeKey === key) {
    const activeRow = currentMusic.music_schema[activeKey];
    if (activeRow) {
      beatsElapsedInSegment = Math.min(beatsElapsedInSegment, totalBeatsForRow(activeRow));
      handleBeatTransport();
    }
  }
  renderPrompter();
}

function speakRowDescriptionOnStart(): void {
  if (!("speechSynthesis" in window)) return;
  if (ttsEnabledInput && !ttsEnabledInput.checked) return;
  if (!currentMusic || activeKey === null) return;
  const row = currentMusic.music_schema[activeKey];
  const text = row?.Description.trim() ?? "";
  if (text === "") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find((v) => v.lang.toLowerCase().startsWith("pt-br"));
  if (preferredVoice) utterance.voice = preferredVoice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function updateFocusedRowBeatProgress(): void {
  if (!currentMusic || activeKey === null) return;
  const row = currentMusic.music_schema[activeKey];
  if (!row) return;
  const total = totalBeatsForRow(row);
  const filled = Math.max(0, Math.min(beatsElapsedInSegment, total));
  const focusedRow = lyricsRows.querySelector<HTMLElement>(`.lyric-row[data-key="${activeKey}"]`);
  if (!focusedRow) return;
  const cells = focusedRow.querySelectorAll<HTMLElement>(".lyric-progress-cell");
  cells.forEach((cell, idx) => {
    cell.classList.toggle("filled", idx < filled);
  });
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
  const rowBars = barsForRow(row);
  if (rowBars === 0) {
    const next = nextKeyAfter(activeKey);
    if (next !== null) {
      setTransportKey(next);
      return;
    }
  }
  beatsElapsedInSegment = 0;
  speakRowDescriptionOnStart();
  reflectCounterToInput();
  updatePrompterFocus();
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function scrollLyricRowIntoViewSlow(row: HTMLElement): void {
  const vp = lyricsViewport;
  if (lyricScrollRaf !== null) {
    cancelAnimationFrame(lyricScrollRaf);
    lyricScrollRaf = null;
  }
  const startTop = vp.scrollTop;
  const topGutter = Math.max(LYRIC_FOCUS_TOP_GUTTER_PX, Math.round(vp.clientHeight * 0.12));
  const targetTop =
    vp.scrollTop +
    (row.getBoundingClientRect().top - vp.getBoundingClientRect().top) -
    topGutter;
  const maxTop = Math.max(0, vp.scrollHeight - vp.clientHeight);
  const clampedTargetTop = Math.max(0, Math.min(targetTop, maxTop));
  const dist = clampedTargetTop - startTop;
  if (Math.abs(dist) < 2) return;

  const t0 = performance.now();
  function frame(now: number): void {
    const elapsed = now - t0;
    const t = Math.min(1, elapsed / LYRIC_SCROLL_MS);
    vp.scrollTop = startTop + dist * easeInOutQuad(t);
    if (t < 1) {
      lyricScrollRaf = requestAnimationFrame(frame);
    } else {
      lyricScrollRaf = null;
    }
  }
  lyricScrollRaf = requestAnimationFrame(frame);
}

function updatePrompterFocus(): void {
  if (!currentMusic || activeKey === null) return;
  let focusedEl: HTMLElement | null = null;
  document.querySelectorAll<HTMLElement>(".lyric-row").forEach((el) => {
    const k = Number(el.dataset.key);
    const focused = k === activeKey;
    el.classList.toggle("focused", focused);
    if (focused) focusedEl = el;
  });
  updateFocusedRowBeatProgress();
  if (focusedEl) scrollLyricRowIntoViewSlow(focusedEl);
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

    const progress = document.createElement("div");
    progress.className = "lyric-progress";
    const totalBeats = totalBeatsForRow(row);
    progress.style.gridTemplateColumns = `repeat(${totalBeats}, minmax(0, 1fr))`;
    for (let i = 0; i < totalBeats; i += 1) {
      const cell = document.createElement("div");
      cell.className = "lyric-progress-cell";
      progress.appendChild(cell);
    }
    div.appendChild(progress);

    const compassos = document.createElement("input");
    compassos.className = "lyric-compassos";
    compassos.type = "number";
    compassos.min = "0";
    compassos.step = "1";
    compassos.value = normalizeCompassosValue(row.Compassos);
    compassos.addEventListener("click", (e) => e.stopPropagation());
    compassos.addEventListener("mousedown", (e) => e.stopPropagation());
    compassos.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const input = e.currentTarget as HTMLInputElement;
        void saveCompassosForRow(k, input.value);
        input.blur();
      }
    });
    compassos.addEventListener("change", () => {
      void saveCompassosForRow(k, compassos.value);
    });
    compassos.addEventListener("blur", () => {
      void saveCompassosForRow(k, compassos.value);
    });
    div.appendChild(compassos);

    const content = document.createElement("div");
    content.className = "lyric-main";
    if (row.Description.trim() !== "") {
      const desc = document.createElement("div");
      desc.className = "lyric-desc";
      desc.textContent = row.Description;
      content.appendChild(desc);
    }
    if (row.Cifra.trim() !== "") {
      const cifra = document.createElement("div");
      cifra.className = "lyric-cifra";
      cifra.textContent = row.Cifra;
      content.appendChild(cifra);
    }
    if (row.Letra.trim() !== "") {
      const letra = document.createElement("div");
      letra.className = "lyric-letra";
      letra.textContent = row.Letra;
      content.appendChild(letra);
    }
    div.appendChild(content);
    div.addEventListener("click", () => setTransportKey(k));
    lyricsRows.appendChild(div);
  }
  updatePrompterFocus();
}

function handleBeatTransport(): void {
  if (!currentMusic || activeKey === null) return;
  const row = currentMusic.music_schema[activeKey];
  if (!row) return;
  if (beatsElapsedInSegment < totalBeatsForRow(row)) return;

  const keys = sortedSchemaKeys(currentMusic.music_schema);
  const idx = keys.indexOf(activeKey);
  if (idx >= 0 && idx < keys.length - 1) {
    setTransportKey(keys[idx + 1]!);
  } else {
    beatsElapsedInSegment = 0;
    updateFocusedRowBeatProgress();
  }
}

function clearMusicSelection(): void {
  if (lyricScrollRaf !== null) {
    cancelAnimationFrame(lyricScrollRaf);
    lyricScrollRaf = null;
  }
  currentMusic = null;
  activeKey = null;
  beatsElapsedInSegment = 0;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
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

    if (currentMusic !== null && activeKey !== null) {
      beatsElapsedInSegment += 1;
      updateFocusedRowBeatProgress();
      handleBeatTransport();
    } else {
      if (!info.accented) return;
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
    const row = document.createElement("div");
    row.className = "music-list-row";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "music-open";
    openBtn.textContent = m.title;
    openBtn.addEventListener("click", () => {
      void selectMusic(m.id);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "music-delete";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      const ok = window.confirm(
        `Delete "${m.title}"? This removes the item from IndexedDB (not the CSV file).`,
      );
      if (!ok) return;
      void (async () => {
        await deleteMusic(m.id);
        if (currentMusic?.id === m.id) {
          clearMusicSelection();
        }
        await refreshMusicList();
      })();
    });

    row.appendChild(openBtn);
    row.appendChild(delBtn);
    li.appendChild(row);
    musicList.appendChild(li);
  }
  const hasMusicRows = musicList.querySelector(".music-list-row") !== null;
  if (emptyLibraryActions) emptyLibraryActions.hidden = hasMusicRows;
  syncStatus.textContent = hasMusicRows
    ? `${all.length} music(s) loaded.`
    : "No music loaded yet. Use preset data or import from Google Sheets.";
}

async function importFromGoogleSheets(): Promise<void> {
  if (!sheetUrlInput || !sheetImportBtn) return;

  const rawInput = sheetUrlInput.value.trim();
  const spreadsheetId = extractSpreadsheetId(rawInput);
  if (!spreadsheetId) {
    setSheetImportStatus("Invalid Google Sheets URL or sheet ID.");
    return;
  }

  const range = sheetRangeInput?.value.trim() || "A:G";

  sheetImportBtn.disabled = true;
  setSheetImportStatus("Requesting Google authorization and loading tabs...");

  try {
    const tabValues = await getAllSpreadsheetTabValues(spreadsheetId, range);
    if (tabValues.length === 0) {
      setSheetImportStatus("No tabs were found in this spreadsheet.");
      return;
    }

    let importedCount = 0;
    const failures: string[] = [];

    for (const tab of tabValues) {
      try {
        const doc = rowsToMusicDocument(tab.values);
        const record: StoredMusic = {
          id: toSheetRecordId(spreadsheetId, tab.sheetId),
          title: tab.title,
          conf: doc.conf,
          music_schema: doc.music_schema,
          updatedAt: Date.now(),
        };
        await putMusic(record);
        importedCount += 1;
      } catch (e) {
        const detail = e instanceof Error ? e.message : "Unknown import error";
        failures.push(`${tab.title}: ${detail}`);
      }
    }

    await refreshMusicList();
    if (failures.length === 0) {
      setSheetImportStatus(
        `Imported ${importedCount} tab(s) from spreadsheet ${spreadsheetId}.`,
      );
      return;
    }
    setSheetImportStatus(
      `Imported ${importedCount} tab(s), ${failures.length} failed.\n${failures.join("\n")}`,
    );
  } catch (e) {
    setSheetImportStatus(
      e instanceof Error ? `Import failed: ${e.message}` : "Import failed.",
    );
  } finally {
    sheetImportBtn.disabled = false;
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

function spaceShouldControlMetronome(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  if (target.isContentEditable) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  if (target.closest("input, textarea, select")) return false;
  return true;
}

async function togglePlayPause(): Promise<void> {
  if (metronome.playing) {
    metronome.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
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
    } else {
      beatsElapsedInSegment = 0;
      updateFocusedRowBeatProgress();
    }
    reflectCounterToInput();
    await metronome.play();
    playPauseBtn.textContent = "Pause";
  }
}

playPauseBtn.addEventListener("click", () => {
  void togglePlayPause();
});

sheetImportBtn?.addEventListener("click", () => {
  void importFromGoogleSheets();
});

loadPresetBtn?.addEventListener("click", () => {
  void (async () => {
    loadPresetBtn.disabled = true;
    syncStatus.textContent = "Loading preset CSV data...";
    try {
      await syncCsvFilesToDatabase();
      await refreshMusicList();
      syncStatus.textContent = "Preset CSV data loaded.";
    } catch (e) {
      syncStatus.textContent =
        e instanceof Error ? `Failed to load preset data: ${e.message}` : "Failed to load preset data.";
    } finally {
      loadPresetBtn.disabled = false;
    }
  })();
});

showLoremBtn?.addEventListener("click", () => {
  window.alert(
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  );
});

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  if (!spaceShouldControlMetronome(e.target)) return;
  e.preventDefault();
  void togglePlayPause();
});

void (async () => {
  try {
    await refreshMusicList();
  } catch (e) {
    syncStatus.textContent =
      e instanceof Error ? e.message : "Failed to load musics.";
  }
})();

reflectCounterToInput();
