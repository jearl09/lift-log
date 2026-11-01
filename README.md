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
