# Workout Tracker — Build Plan

Offline-first iPhone PWA. Vanilla HTML/CSS/JS, no build step.

## Files
```
workout-tracker/
  index.html            app shell, 4 views + modals, inline muscle SVG template
  styles.css            dark default, light via [data-theme="light"], safe-area insets
  app.js                ES module entry; imports the modules below
  js/
    db.js               storage layer (localStorage, versioned, debounced writes)
    data.js             built-in exercise library (~60) + split presets
    muscles.js          SVG muscle map: render + highlight helpers
    timer.js            rest timer (timestamp-based) + beep + notification
    views/today.js, splits.js, history.js, settings.js
  sw.js                 cache-first service worker, CACHE_VERSION constant
  manifest.webmanifest
  icons/                icon.svg, icon-192.png, icon-512.png, apple-touch-icon.png
  README.md
```

## Storage choice
**localStorage**, one JSON blob per key: `wt.settings`, `wt.exercises` (custom only),
`wt.splits`, `wt.workouts`, `wt.active` (in-progress workout), `wt.meta` (schema version).
Reasons: data is small (years of logs under 1 MB), synchronous reads keep rendering simple,
and export/import is just JSON. Built-in exercises and presets live in code, not storage,
so library updates roll out with the app; user edits to built-ins are stored as overrides
keyed by id.

## Data model (weights stored in kg; times are ms epoch or seconds)

```js
Settings {
  units: 'kg' | 'lb',
  defaultRestSec: 90,
  theme: 'dark' | 'light',
  activeSplitId: string | null,
  notifications: boolean          // user opted in to local notifications
}

Exercise {
  id: 'bench-press' | 'c_<uuid>', // built-ins have slug ids, customs a 'c_' prefix
  name,
  equipment: 'barbell'|'dumbbell'|'cable'|'machine'|'bodyweight'|'other',
  primary:   ['chest', ...],      // muscle ids from the fixed list of 16
  secondary: ['triceps', ...],
  restSec: number | null,         // null = use settings.defaultRestSec
  builtin: boolean
}

Split {
  id, name, builtin: boolean,
  days: [ { id, name: 'Push', exerciseIds: ['bench-press', ...] } ]
}

Workout {
  id, splitId, dayId, dayName,    // dayName copied so history survives split edits
  startedAt, finishedAt, durationSec,
  exercises: [
    { exerciseId, name,           // name copied for the same reason
      sets: [ { reps: number, weightKg: number|null, done: boolean } ] }
  ]
}

ActiveWorkout = Workout without finishedAt, plus
  timer: { endsAt: ms|null, totalSec, exerciseId }   // persisted so the countdown
                                                     // survives app close / lock
```

Muscle ids: chest, front-delts, side-delts, rear-delts, biceps, triceps, forearms, abs,
obliques, upper-back, lats, lower-back, glutes, quads, hamstrings, calves.

## Screens
Bottom tabs: **Today / Splits / History / Settings**. Sub-screens are stacked panels
with a back button; pickers are modals.

1. **Today**: active split name, suggested next day (the day after the last logged day
   of that split, wrapping; falls back to day 1), chips to pick any day, combined muscle
   map for the chosen day, big "Start workout" button. If an in-progress workout exists,
   this tab shows "Resume" instead.
2. **Workout (live)**: elapsed-time header, one card per exercise. Each set row is
   reps input, weight input, checkmark (44px). Placeholders show last session's
   reps/weight for that set index. Buttons: add set, remove set, add exercise (library
   picker), finish. The rest timer is a sticky bar at the bottom that expands to a
   full-screen countdown with +15 / -15 / skip. Autosave on every change.
3. **Splits**: list with an "active" badge. Tap a split for its day list, tap a day for
   its exercise list (reorder with up/down buttons, add/remove). Duplicate preset, new
   custom split, rename, delete, set active. The day view shows the combined muscle map.
4. **Exercise library** (reached from the day editor, the workout "add exercise" button,
   and a Library button on the Splits tab): searchable list filtered by muscle and
   equipment. Detail view shows the muscle map (primary strong, secondary tint), rest
   override, edit/delete for customs, and per-exercise history: sessions with sets, best
   set, estimated 1RM (Epley), and an SVG line chart of top-set weight over time.
5. **History**: "This week" muscle heatmap (set-equivalents per muscle in the last 7
   days; a primary muscle counts 1 per set, secondary 0.5; 3 levels at >=1, >=6, >=12),
   then a month-grouped list of workouts. Tap one for full detail.
6. **Settings**: units, default rest, theme, notifications toggle (requests permission),
   export JSON (download), import JSON (file input, validates shape, confirms overwrite),
   reset all data (double confirm).

## Rest timer approach
- Completing a set stores `timer.endsAt = Date.now() + restSec * 1000` in the active
  workout, so it is persisted.
- A 250 ms interval only re-renders; remaining time is always `endsAt - Date.now()`.
- `visibilitychange`, `pageshow` and `focus` recompute immediately on resume. If
  `endsAt` already passed while backgrounded, the "done" state fires once (beep + flash)
  and the timer clears.
- Beep: Web Audio OscillatorNode, two short tones, no audio file. The AudioContext is
  created and resumed on the first user tap so iOS allows playback later.
- Flash: full-screen overlay with a short CSS animation.
- Notification: if permission is granted and the app runs standalone, the page calls
  `registration.showNotification()` when the timer finishes; if the page was suspended,
  it fires on resume instead. Skip cancels it. Everything is behind feature checks.

## Muscle SVG approach
- One inline SVG template in index.html, `viewBox="0 0 200 300"`: front figure at
  x 0-100, back figure at x 100-200. It is cloned wherever a map is shown.
- The body silhouette is a neutral grey path. Each muscle is its own `<path>` with
  `data-muscle="chest"`. Paired muscles have left and right paths sharing the same
  attribute. Some muscles appear on both views (side delts, obliques, forearms, calves).
- Front view: chest, front delts, side delts, biceps, forearms, abs, obliques, quads,
  calves. Back view: rear delts, side delts, upper back/traps, lats, lower back, triceps,
  forearms, glutes, hamstrings, calves.
- `muscles.js` exports `renderMap(container)` and `highlight(svg, {primary, secondary})`
  plus `heat(svg, {chest: 2, ...})`. These only set `data-role` / `data-level`
  attributes; all colours come from CSS so both themes work automatically.

## PWA / offline
- `sw.js`: a `CACHE_VERSION` string, precache the full file list on install, delete old
  caches on activate, cache-first for same-origin GETs with network fallback. Bumping the
  version is the update mechanism; the app shows an "Update available, reload" toast when
  a new worker takes control.
- Manifest: standalone display, dark background and theme colour, 192/512 icons.
- iOS meta tags as specified, `viewport-fit=cover`, and `env(safe-area-inset-*)` padding
  on the header and tab bar.

## Build order (app runnable after each step)
1. Shell, styles, tabs, db.js, Settings (units, rest, theme, export, import, reset).
2. Exercise library data, list and detail, muscle SVG, custom exercise CRUD.
3. Split presets, split editor, active split, Today suggestion.
4. Workout logging, autosave, rest timer with beep, flash and notification.
5. History list and detail, per-exercise history with 1RM and line chart, weekly heatmap.
6. Service worker, manifest, icons, README, then the 390x844, persistence, offline and
   backgrounded-timer checks.
