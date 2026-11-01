# Lift Log

A personal, offline-first workout tracker built as an iPhone home-screen PWA.
Vanilla HTML/CSS/JS, no frameworks, no build step, no backend, no accounts.
All data lives in your browser's localStorage; export a JSON backup from Settings.

## Features

- **Splits**: Push/Pull/Legs, Upper/Lower, Full Body, Anterior/Posterior and Bro Split presets.
  Duplicate and edit them or build your own. One split is "active" and the Today tab
  suggests the next day based on what you last logged.
- **Exercise library**: ~65 built-in movements with equipment, primary/secondary muscles and
  rest time. Add, edit and delete custom exercises.
- **Logging**: reps × weight per set, ghost text showing last session's numbers, tap to
  complete, add/remove sets, add unplanned exercises. In-progress workouts autosave.
- **Rest timer**: auto-starts on set completion, +15 / −15 / skip, accurate across screen
  lock (end timestamp based), generated beep, screen flash, optional local notification.
- **Muscle map**: stylised front/back SVG figure highlighting primary and secondary muscles per
  exercise and per split day, plus a 7-day heatmap on the History tab.
- **History**: workout list and detail, per-exercise sessions, best set, estimated 1RM
  (Epley), and a top-set weight line chart.
- **Settings**: kg/lb, default rest, bar weight, light/dark/system theme, export/import JSON, reset.
- **Focused workout mode**: one exercise per screen, swipe or arrow keys between them, ± steppers,
  "repeat last" fill, swipe-left to delete a set, long-press to duplicate, long-press the weight
  for the plate calculator, warm-up set generator, PR detection with confetti.
- **Equipment-aware workouts**: gym profiles (Settings → My gyms) with a 20-item equipment picker
  and a coverage check showing which muscle groups the selection can train plus the cheapest fix.
  Split days are resolved against the active gym: unavailable exercises are auto-swapped for the
  best alternative (same movement pattern, shared secondary muscles, logged before, fewer pieces)
  and marked "Swapped", or greyed as "Unavailable here" with what's missing. "Build a day for my
  gym" generates a Push/Pull/Legs/Upper/Lower/Full-body/custom day from the gym's equipment, with
  per-exercise swaps, save-as-split-day and start-now. During a workout, long-press an exercise
  title (or tap ⇄) for "Not available right now" substitutes, with an "Always use this at [gym]"
  option. All rules-based and offline; every exercise carries its equipment requirements,
  movement pattern and compound/isolation tag in `js/data.js`.
- **Exercise demos + coaching**: every exercise opens a sheet with photos (crossfading, pausable)
  or an animated side-view stick figure of its movement pattern, the muscle map, a one-line cue,
  setup, steps, common mistakes, tempo, equipment needed and your last session. Custom exercises
  can hold up to two of your own photos (resized, stored in IndexedDB).
- **Guided workout mode**: turn on "Guide me" on the Today tab for a 5 s "Get set" countdown
  before each exercise, a 3 s "Next up" screen between exercises, auto-advance after the last set
  and a summary (duration, sets, volume, muscles hit, PRs) when everything is done.
- **Design**: the "Enamel" system, a boxing-gym enamel-sign look in cream and racing green with one
  signal red, heavy 2px outlines, pills and tiles, and self-hosted Bricolage Grotesque (500/800).
  All tokens live in `:root` in `styles.css`; dark mode swaps the cream and green tokens.
- **Polish**: centred phone frame on desktop, spring motion system with reduced-motion support,
  bottom sheets instead of native dialogs, 12-week contribution calendar.

## Run locally

Any static file server works. The app uses ES modules, so it must be served over
HTTP rather than opened as a `file://` URL.

```bash
cd workout-tracker
python3 -m http.server 8000
# then open http://localhost:8000
```

`npx serve` or VS Code's Live Server also work. The service worker registers on
`localhost` without HTTPS.

## Deploy for free

The service worker (and therefore offline support and "Add to Home Screen" as a real
PWA) **requires HTTPS**. Both options below provide it automatically.

### GitHub Pages

1. Create a repository and push this folder's contents to the root (or a `docs/` folder).
2. In the repo, open **Settings → Pages**, choose the branch (and folder), save.
3. Your app is at `https://<user>.github.io/<repo>/`. All paths in the app are relative,
   so a sub-path works fine.

### Netlify

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag the
   `workout-tracker` folder onto the page, or connect the GitHub repo.
2. No build command, publish directory is the folder root.

## Install on iPhone

1. Open the HTTPS URL in **Safari** (not Chrome; only Safari can install PWAs on iOS).
2. Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Launch it from the home screen. It runs full-screen and works offline after that
   first load.

Notes for iOS:

- Rest notifications need the app installed to the home screen (iOS 16.4 or later) and
  permission granted via the toggle in Settings. Without that, the beep and screen flash
  still fire when you return to the app.
- The beep uses Web Audio and respects the ring/silent switch.
- Data is stored per-site in Safari's storage. If you reinstall the app or clear website
  data you lose it, so export a backup from Settings now and then.

## RPE, progression, supersets and weekly targets

- **RPE**: each set can carry an effort rating from 6 to 10 in half steps. By default the picker
  opens after you tick a set (Settings → Logging). You can display RPE or RIR (reps in reserve,
  RIR = 10 − RPE); RPE is what gets stored. Last session's RPE shows as ghost text.
- **Progression** (per exercise, editable in the exercise form):
  - *Linear*: if every working set hit the target reps and the hardest set was at or under the
    RPE cap, add one increment. If reps fell short two sessions in a row, drop about 10%,
    rounded to the increment. Otherwise repeat.
  - *Double*: if every set reached the top of the rep range with RPE at or under the cap, add one
    increment and reset reps to the bottom of the range. Otherwise keep the weight and aim for
    one more rep on the weakest set.
  - Defaults: increment 2.5 kg barbell, 1 kg dumbbells, 5 kg machines and cables, 0 bodyweight;
    rep range 5–8 for compounds, 10–15 for isolations; RPE cap 8. Without RPE only the rep
    rules apply. Weight never changes by more than one increment per session. The workout card
    shows the target and pre-fills the sets; "Why?" explains the rule and the sessions used.
- **Supersets**: in a day editor tick 2–3 consecutive exercises and tap "Group as superset". In
  the workout they run round by round (A1, A2, rest, A1, A2 …) with one rest timer per round.
  History and volume count each exercise's sets individually.
- **Weekly targets** (Settings → Weekly targets): a hard set is 5+ reps or RPE 7+, not a warm-up;
  it counts 1 for the primary muscle and 0.5 per secondary. Presets Minimal / Standard / High or
  edit per muscle; rolling 7 days or Monday-to-Sunday weeks. The History tab shows each muscle
  against its range (Under / In range / Over) and the generator and swap suggestions prefer
  muscles that are under target.

## Exercise photos (import script)

Photos and full instructions come from the public-domain
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (CC0 1.0). They are imported once
with a script, not fetched at runtime, so the app stays offline:

```bash
cd scripts && npm install && cd ..      # installs sharp for the script only
node scripts/import-exercises.mjs       # downloads, matches, resizes, writes /exercises
```

The script matches each library exercise by name using the `ALIASES` table at the top of
`scripts/import-exercises.mjs` (edit it if something is unmatched; the script prints the three
closest dataset names), writes `exercises/<id>/0.jpg` and `1.jpg` at max 800px wide, generates
`js/generated/exercise-db.js` (instructions and dataset muscles mapped onto this app's ids) and
`sw-media.js` (precache list), and prints the total size of `/exercises`. Our own equipment
mapping and muscle ids in `js/data.js` are never overwritten. Bump `CACHE_VERSION` afterwards.

## Updating a deployed app

Edit the files, then bump `CACHE_VERSION` in `sw.js` (for example `v1` → `v2`) and
redeploy. Open installed copies show an "Update available" toast with a Reload button.

## Project layout

```
index.html            app shell, tab bar, overlays
styles.css            theme variables, layout, components
app.js                entry: seed, tabs, service worker registration
js/db.js              localStorage persistence, export/import/reset
js/data.js            muscle groups, built-in exercises, split presets
js/exercises.js       library resolution (built-ins + overrides + customs), history queries
js/muscles.js         SVG muscle map and highlight/heat helpers
js/timer.js           rest timer, beep, flash, notification
js/ui.js              DOM helpers, panel stack, toast, empty states, gestures, units
js/sheet.js           bottom sheets (confirm / prompt / custom) with swipe-to-dismiss
js/plates.js          plate calculator sheet + warm-up set generator
js/engine.js          equipment engine: availability, substitution, day resolution, generation, coverage
js/icons.js           inline SVG equipment icons
js/figures.js         eight animated side-view movement figures (SMIL)
js/coaching.js        setup / steps / cue / mistakes / tempo per exercise
js/photos.js          user photos in IndexedDB (resize + store)
js/progression.js     progression configs and next-session suggestions
js/volume.js          weekly hard sets per muscle vs targets
js/views/targets.js   Settings → Weekly targets
js/generated/         exercise-db.js written by the import script
js/views/exercise-sheet.js  exercise detail sheet + demo tile
exercises/            dataset photos, 2 per exercise (CC0)
scripts/              import-exercises.mjs (one-off, needs sharp)
js/confetti.js        canvas confetti burst for PRs
js/views/*.js         Today, Workout, Splits, Library, History, Settings screens
sw.js                 service worker (precache, cache-first, versioned)
manifest.webmanifest  PWA manifest
icons/                SVG + PNG icons
fonts/                Bricolage Grotesque variable woff2 (latin + latin-ext), precached
```

## Data model

All weights are stored in kilograms and converted for display. See `js/db.js` and the
comments at the top of each module. A JSON export looks like:

```json
{
  "app": "lift-log", "schema": 1, "exportedAt": "...",
  "settings": { "units": "kg", "defaultRestSec": 90, "theme": "dark", "activeSplitId": "...", "notifications": false },
  "exercises": [ { "id": "c_...", "name": "...", "equipment": "cable", "primary": ["lats"], "secondary": [], "restSec": null } ],
  "splits": [ { "id": "s_...", "name": "Push / Pull / Legs", "days": [ { "id": "d_...", "name": "Push", "exerciseIds": ["bench-press"] } ] } ],
  "workouts": [ { "id": "w_...", "splitId": "...", "dayId": "...", "dayName": "Push", "startedAt": 0, "finishedAt": 0, "durationSec": 0,
                  "exercises": [ { "exerciseId": "bench-press", "name": "Bench Press", "sets": [ { "reps": 8, "weightKg": 60 } ] } ] } ],
  "active": null
}
```
