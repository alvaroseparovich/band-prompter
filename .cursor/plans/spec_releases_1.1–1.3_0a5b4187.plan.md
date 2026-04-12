---
name: SPEC releases 1.1–1.3
overview: Implement [SPEC/Project.md](SPEC/Project.md) in three semver releases (1.1.0 counter, 1.2.0 CSV/IndexedDB/catalog, 1.3.0 lyrics prompter synced to transport position), bumping [package.json](package.json) per release and tagging after commits. Baseline 1.0.0 is already implemented; align git tags with semver if needed.
todos:
  - id: release-workflow
    content: "Document git steps: commit, bump package.json, annotated tag per version; align with existing 1.0.0 tag"
    status: completed
  - id: v1-1-0-counter
    content: "Implement 1.1.0: counter state, UI, onBeat(accented), change-handler + sync guard; release commit + tag"
    status: completed
  - id: v1-2-0-csv-idb
    content: "Implement 1.2.0: CSV glob+parse, typed conf/music_schema, IndexedDB, catalog UI; release commit + tag"
    status: completed
  - id: v1-3-0-prompter
    content: "Implement 1.3.0: activeKey, lyrics list, scroll/focus, arrows+row click, downbeat advance vs Compassos; reconcile counter; release commit + tag"
    status: completed
isProject: false
---

# SPEC improvements: 1.1.0 → 1.3.0 + versioning

## Release and Git workflow (applies to every milestone)

Use **annotated tags** and keep **`package.json` `version`** in lockstep with the tag.

Recommended sequence for each version **after 1.0.0**:

1. Implement the feature on `master` (one or more commits is fine).
2. Set [`package.json`](package.json) `version` to the release (e.g. `1.1.0`).
3. **Commit** that release (feature + version bump together, or version-only commit immediately after—your preference; both satisfy “commit before the next version” as long as the tree is clean and tagged).
4. **Tag**: `git tag -a v1.1.0 -m "Release 1.1.0: counter control"` (use a `v` prefix for tags unless you standardize on the existing `1.0.0` style—pick one convention and rename old tag only if you care about consistency).

**Baseline:** Code already matches **1.0.0** metronome spec; [`package.json`](package.json) is `1.0.0`. If the existing tag is `1.0.0` without `v`, either keep that convention for all releases or add `v1.0.0` pointing at the same commit and document the convention in a one-line note in [`SPEC/Project.md`](SPEC/Project.md) (optional).

Do **not** tag the *next* version until the *current* version’s work is committed.

---

## 1.1.0 — Counter control ([SPEC/Project.md](SPEC/Project.md) §1.1.0)

**Goal:** A **downbeat / “accent” counter**: integer in JS, shown and editable in the UI; increments on each metronome **accent** (`accented === true` in [`BeatInfo`](src/metronome.ts)).

**Changes:**

- [`index.html`](index.html): add a labeled number input (or similar) for the counter.
- [`src/main.ts`](src/main.ts):
  - Hold `let barCounter = …` (initial value, e.g. `0` or `1`—document choice).
  - Extend `onBeat` to accept `info` (already available in [`createMetronome`](src/metronome.ts) if you change the callback signature to `onBeat?: (info: BeatInfo) => void`).
  - On `info.accented`, update `barCounter` and **reflect** to the input.
  - On user edit: listen on **`change`** (or blur) to avoid fighting keystrokes; parse and clamp; update `barCounter`. Use a **guard flag** (or “only write `input.value` when different”) when writing from the metronome so programmatic updates do not cause feedback loops (per your earlier constraint).

**Metronome API:** Optional small additions in [`src/metronome.ts`](src/metronome.ts) for 1.3.0 prep: e.g. `resetBeatCounter()` or external `setBeatPhase`—only if 1.3 needs it; otherwise keep 1.1.0 UI-only.

**Release:** `version` → `1.1.0` → commit → tag `v1.1.0`.

---

## 1.2.0 — Lyrics music: CSV → typed object → IndexedDB + list ([SPEC/Project.md](SPEC/Project.md) §1.2.0)

**Goal:** On each full page load, read CSVs under [`csvs/`](csvs/), parse into `{ conf, music_schema }`, persist in **IndexedDB**, show **all stored musics** in the UI.

**Data model (typed):**

- **`music_schema`:** keys are **cumulative compass offsets** as in the spec: first row key `0`, next key `previousKey + previousRow.Compassos` (e.g. `0 + 4 → 4`, then `4 + 1 → 5`, …). Each value: `{ Compassos, Description, Letra, Cifra }` (strings; empty cells → `""`). Use a TypeScript type alias for the row and for `Record<number, Row>` (or a branded numeric key type if you prefer).
- **`conf`:** collect **Conf / Conf-Val** column pairs into `Record<string, string>` (spec examples: `bpm`, `Tempo Por Compasso`). Rows without Conf keys can be skipped.

**CSV loading in the browser:**

- Browsers cannot directory-list `csvs/` at runtime. Use **Vite** [`import.meta.glob`](https://vitejs.dev/guide/features.html#glob-import) over `../csvs/*.csv` (path relative to a module under `src/`) with `as: 'raw'` (or fetch URLs from glob) so **every CSV in the folder is included at build time**.
- On load: for each file, parse text → build `{ conf, music_schema }` → write to IndexedDB (store name e.g. `musics`, key = **filename** or slug).

**Parsing:**

- Implement a **small RFC4180-style parser** (quoted fields, commas) or add a tiny dependency (e.g. `papaparse`) if you want less maintenance—tradeoff: one devDependency vs ~50 lines of code.

**UI:**

- Section listing **titles** (e.g. filename or first `Description`) of all entries in IndexedDB; enough for 1.3 “click a music” (click handler can be stubbed in 1.2 or wired to a detail panel later).

**Release:** `version` → `1.2.0` → commit → tag `v1.2.0`.

---

## 1.3.0 — Display music in tempo (prompter) ([SPEC/Project.md](SPEC/Project.md) §1.3.0)

**Goal:** Selecting a stored music shows **lyrics/chords** from `music_schema`; **focus** follows a **transport position** keyed by the same numbers as `music_schema` keys; layout scrolls so the **focused block stays at the top** and earlier lines leave the viewport; **up/down** and **click row** change that position (and stay consistent with the counter from 1.1.0 / metronome behavior).

**Position model (important):** Spec ties focus to **`music_schema` keys** (`0`, `4`, `5`, …), not necessarily “measure 1, 2, 3”. Plan to introduce a single app-level **`activeKey: number`** (must be one of the keys, or snap to nearest). Reconcile the **1.1.0 counter** with this: either **replace** the simple incrementing counter with `activeKey` when a piece is loaded, or **derive** display from `activeKey` only in “performance mode.” Document the chosen rule in [`SPEC/Project.md`](SPEC/Project.md) in one sentence to avoid ambiguity.

**Behavior sketch:**

- **Load music:** read object from IndexedDB; render a **vertical list** of segments (sorted keys), each showing `Letra` / `Cifra` / `Description` as needed.
- **Focus:** CSS (larger font / weight) on the row whose key === `activeKey`; `scrollIntoView({ block: 'start' })` or a scroll container with `scrollTop` tuned so the focused row pins to the top (iterate until behavior matches “previous disappears”).
- **Metronome sync:** On each **downbeat**, advance an internal **“bars remaining in current segment”** counter using the current row’s `Compassos` and `conf["Tempo Por Compasso"]` / beats-per-measure from the metronome’s `accent` (exact formula should match your musical intent—default: one **downbeat** = one **compasso** if `Compassos` counts measures). When the segment is exhausted, set `activeKey` to the **next** row’s key.
- **Arrows:** move `activeKey` to **previous/next** key in sorted key order (no metronome tick required).
- **Click row:** set `activeKey` to that row’s key (spec: counter at 6, click 4 → jump to 4; click 7 → jump to 7—implies keys exist for those indices).

**Metronome module:** May need **`setExternalDownbeatPosition`**, **`getAccentInterval`**, or pausing auto-advance when user overrides—keep orchestration mostly in [`src/main.ts`](src/main.ts) or a new `src/prompter.ts` to avoid bloating [`src/metronome.ts`](src/metronome.ts).

**Release:** `version` → `1.3.0` → commit → tag `v1.3.0`.

---

## Dependency / layout notes

- No extra runtime dependency required for IndexedDB.
- Optional: `papaparse` for CSV (dev/runtime tradeoff above).
- Ensure [`csvs/*.csv`](csvs/) remains discoverable via Vite glob (path + `tsconfig` include if needed).

---

## Verification per release

- `npm run build` passes.
- Manual smoke: metronome (1.0.x baseline), counter (1.1.0), import + list + IDB (1.2.0), prompter + nav (1.3.0).
- `git describe` or tag list shows `v1.0.0` … `v1.3.0` aligned with `package.json`.
