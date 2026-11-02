/* ==========================================================================
   style.js — the user's training style: how many sets, how reps are
   prescribed, how long a session should be, and whether to prefer exercises
   that are quick to set up. Read by the day builder, swap suggestions, day
   resolution and set pre-fill.

   style = {
     preset: 'fast' | 'balanced' | 'strength' | 'custom',
     sets: 2,                 // working sets per exercise
     scheme: 'failure' | 'exercise' | 'fixed',
                              // failure  = take every set to failure inside
                              //            a rep window; weight goes up once
                              //            every set clears the top of it
                              // exercise = use each exercise's own progression
                              // fixed    = linear progression at `reps`
     reps: 5,                 // only for 'fixed'
     window: [8, 15],         // only for 'failure'
     minutes: 35,             // target session length
     quickSetup: true,        // avoid plate-loaded / slow-to-set-up lifts
   }
   ========================================================================== */

import { db } from './db.js';

export const STYLE_PRESETS = [
  { id: 'fast', name: 'Fast and effective', blurb: 'Short sessions, every set to failure, nothing slow to set up.',
    style: { sets: 2, scheme: 'failure', reps: 12, window: [8, 15], minutes: 35, quickSetup: true }, restSec: 60 },
  { id: 'balanced', name: 'Balanced', blurb: 'Three sets per exercise with each exercise’s own rep range.',
    style: { sets: 3, scheme: 'exercise', reps: 10, window: [8, 15], minutes: 55, quickSetup: false }, restSec: 90 },
  { id: 'strength', name: 'Strength', blurb: 'Heavy fives, longer rests, barbells welcome.',
    style: { sets: 4, scheme: 'fixed', reps: 5, window: [8, 15], minutes: 75, quickSetup: false }, restSec: 150 },
];

export const SETUP_LABEL = ['Quick setup', 'Some setup', 'Slow setup'];
export const SETUP_HINT = ['Grab and go: pin stacks, dumbbells, cables, bodyweight', 'A bench to adjust or a light bar to load', 'Plate loading, racks, heavy bars'];

/** Current style, seeding Balanced once. */
export function style() {
  if (!db.settings.style || typeof db.settings.style !== 'object') {
    db.settings.style = { preset: 'balanced', ...STYLE_PRESETS[1].style };
    db.save('settings');
  }
  const s = db.settings.style;
  if (!Array.isArray(s.window) || s.window.length !== 2) s.window = [8, 15];
  return s;
}

export function applyStylePreset(id) {
  const p = STYLE_PRESETS.find((x) => x.id === id);
  if (!p) return;
  db.settings.style = { preset: id, ...p.style, window: [...p.style.window] };
  db.settings.defaultRestSec = p.restSec;
  db.save('settings');
}

/** Mutate one field; the preset becomes Custom. */
export function setStyle(fields) {
  const s = style();
  Object.assign(s, fields);
  s.preset = 'custom';
  db.save('settings');
}

export function presetName(s = style()) {
  const p = STYLE_PRESETS.find((x) => x.id === s.preset);
  return p ? p.name : 'Custom';
}

/** "2 sets to failure" / "3 sets, exercise rep ranges" / "4 × 5" */
export function schemeLabel(s = style()) {
  if (s.scheme === 'failure') return `${s.sets} set${s.sets === 1 ? '' : 's'} to failure`;
  if (s.scheme === 'fixed') return `${s.sets} × ${s.reps}`;
  return `${s.sets} set${s.sets === 1 ? '' : 's'}, exercise rep ranges`;
}

/** One-line summary for Settings. */
export function describeStyle(s = style()) {
  return `${presetName(s)} · ${schemeLabel(s)} · ${s.minutes} min${s.quickSetup ? ' · quick setup' : ''}`;
}

/** Reps label for a generated day: "to failure", "5" or the exercise's range. */
export function repsLabelFor(ex, s = style()) {
  if (s.scheme === 'failure') return 'to failure';
  if (s.scheme === 'fixed') return String(s.reps);
  return ex.kind === 'compound' ? '5–8' : '10–15';
}

export function targetRepsFor(ex, s = style()) {
  if (s.scheme === 'failure') return null;
  if (s.scheme === 'fixed') return s.reps;
  return ex.kind === 'compound' ? 6 : 12;
}

/**
 * Minutes one exercise takes under this style: sets × (about 45 s of work +
 * rest) plus setup time (0.5 / 1.5 / 3 min by setup level).
 */
export function minutesFor(setup, s = style(), restSec = db.settings.defaultRestSec) {
  return s.sets * (0.75 + restSec / 60) + [0.5, 1.5, 3][Math.min(2, Math.max(0, setup || 0))];
}

/** How many exercises fit the target session length (3 to 10). */
export function exerciseCountFor(s = style()) {
  const typicalSetup = s.quickSetup ? 0 : 1;
  const per = minutesFor(typicalSetup, s);
  return Math.max(3, Math.min(10, Math.round(s.minutes / per)));
}
