
this project should use TypeScript

## Versioning and Git releases

- **`package.json` `version`** must match the semver release (e.g. `1.2.0`).
- After completing work for a release, **commit** the changes (including the version bump), then create an **annotated tag** `vX.Y.Z` (example: `git tag -a v1.2.0 -m "Release 1.2.0: …"`).
- Do not bump to the next version until the current release is committed and tagged.
- Legacy tag **`1.0.0`** may exist on the same commit as **`v1.0.0`**; prefer the `v`-prefixed form for new tags.

# 1.0.0 first version
## metronome feature

it is a simple metronome
it should have a module having 3 functionalities
1. play and pause control
2. tempo, how many beats per second (bpm)
3. accent (ex: if 4, make a cicle of 4 beats and an accent on first beat)

and an html importing this module.
having 3 options
set accent
set tempo (default 120 bpm)
play and pause

the beap should be a sound.
and there should be a div showing a color when beep is on.

# 1.1.0 
## Counter control
Add an counter for each accent of the metronome.
show this number in the UI
this value should be editable, so the user can edit this value. this value should be stored in a var in the js, and just reflected in the html.

# 1.2.0
## lyrics music

it should read files located on csvs.
it will load it every time the page loads, process this file and save.
files there will have this format.

Compassos,Description,Letra,Cifra,,Conf,Conf-Val
4,Violão,,,,bpm,90
1,Entra vózes,"Jesus, em Tua presença",   E/G#          A2  ,,Tempo Por Compasso,4
1,,Reunimo-nos aqui,   B4         C#m,,,
1,,Contemplamos Tua face,  E/G#      A2     ,,,

## how to transform

each line should be transformed into other jsons, one json per line, containing just Compassos,Description,Letra,Cifra.
insert them into a Mater one, called `const music_schema`
there should be a logic to the key, the first one should be in the propertie 0 ( music_schema.0 )
the next should be in other key. it should use the last key (0) plus the last Compoassos (4)
as example of the given csv above would be:
{
  0: {...},
  4: {...},
  5: {...},
  6: {...},
  7: {...}
}  

all values on Conf,Conf-value should be treated as one json `const conf` with key value.
as example of csv given above:
{
  "bpm": "90",
  "Tempo Por Compasso":"4"
}
then save all this into a object like this
{
  "conf": {...},
  "music_schema": {...}
}

this object should be well typed.

this should be saved in indexDb
and the front should show all musics saved in indexDb

# 1.3.0
## Display Music in tempo.
At this point it works as a prompt for musicians 
when the user clicks in a music saved in indexDb it should load in the same screen the lyrics.
it should change the focus on each part of the lyrics based on tempo.

### how it works
there should be an display with the value of each item in music_schema
As the click counter change the count number, the focus should change to the same number in music_schema.
the focused part should be greater than others.
as the list is vertical, the focused part should be at the top, and when the part focused becomes the next, the last disapear from the screen because the focused part now is in the top, and the last is no more visible.

### Other funcionality
there should be a arrow button, up and down to goes back and forward in the music.
this should change the counter of metronome, as a side effect of other logic already implemented, the lyrics goes forward or backwards.
but cliking in a part of the lyrics should also change the metronome counter.
lets say the counter is in 6, if the user clicks in the lyrics of index 4, it should goes there, and if he clicks again in 7, the counter and lyrics focus on the 7.

### Counter vs music_schema keys (1.3.0)

When a piece is loaded from IndexedDB, the **transport position** is the `music_schema` **key** (e.g. `0`, `4`, `5`). The same number is shown in the counter field and updates with arrows, row clicks, and automatic advance after each segment’s `Compassos` downbeats. With no piece loaded, the counter is a simple **downbeat count** since Play.
