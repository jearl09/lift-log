/* ==========================================================================
   volume.js — weekly hard sets per muscle group versus a target range.

   Counting rule: a hard set is ≥5 reps, or RPE ≥7 when logged, and not a
   warm-up. It counts 1.0 for the primary muscle and 0.5 for each secondary.
   "Week" is a rolling 7 days by default, or a calendar week from Monday.
   ========================================================================== */

import { db } from './db.js';
import { MUSCLES, MUSCLE_NAME } from './data.js';
import { getExercise } from './exercises.js';
import { dayStart } from './ui.js';

const LARGE = ['chest', 'upper-back', 'lats', 'quads', 'hamstrings', 'glutes'];
const MEDIUM = ['front-delts', 'side-delts', 'rear-delts', 'biceps', 'triceps'];
const SMALL = ['calves', 'abs', 'forearms', 'lower-back', 'obliques'];

export const TARGET_PRESETS = {
  minimal:  { large: [6, 12],  medium: [4, 10],  small: [3, 8] },
  standard: { large: [10, 20], medium: [8, 16],  small: [6, 12] },
  high:     { large: [14, 24], medium: [10, 20], small: [8, 14] },
};

export function presetTargets(name = 'standard') {
  const p = TARGET_PRESETS[name] || TARGET_PRESETS.standard;
  const out = {};
  for (const m of LARGE) out[m] = [...p.large];
  for (const m of MEDIUM) out[m] = [...p.medium];
  for (const m of SMALL) out[m] = [...p.small];
  return out;
}

/** Current targets ({ muscle: [min, max] }), seeding the Standard preset once. */
export function targets() {
  if (!db.settings.targets || typeof db.settings.targets !== 'object') {
    db.settings.targets = presetTargets('standard');
    db.settings.targetPreset = 'standard';
    db.save('settings');
  }
  const t = db.settings.targets;
  for (const m of MUSCLES) if (!t[m.id]) t[m.id] = presetTargets('standard')[m.id];
  return t;
}

export function sizeOf(muscle) {
  return LARGE.includes(muscle) ? 'large' : MEDIUM.includes(muscle) ? 'medium' : 'small';
}

/** Start timestamp of the current week window. */
export function weekStart() {
  if (db.settings.weekMode === 'calendar') {
    const today = dayStart();
    const dow = (new Date(today).getDay() + 6) % 7; // Monday = 0
    return today - dow * 86400000;
  }
  return Date.now() - 7 * 86400000;
}

/** Fraction of the current week that has elapsed (0..1). Rolling windows are always 1. */
export function weekElapsed() {
  if (db.settings.weekMode !== 'calendar') return 1;
  return Math.min(1, Math.max(0, (Date.now() - weekStart()) / (7 * 86400000)));
}

export function isHardSet(s) {
  if (s.warmup) return false;
  if (s.rpe != null) return s.rpe >= 7 || s.reps >= 5;
  return s.reps >= 5;
}

/**
 * { muscle: { count, contributors: [{ exerciseId, name, sets, credit }] } } for the current week.
 * `extra` lets callers include an in-progress workout's completed sets.
 */
export function weeklyVolume({ includeActive = true } = {}) {
  const since = weekStart();
  const out = {};
  for (const m of MUSCLES) out[m.id] = { count: 0, contributors: [] };
  const add = (muscle, exerciseId, name, n, credit) => {
    const slot = out[muscle];
    if (!slot) return;
    slot.count += n * credit;
    let c = slot.contributors.find((x) => x.exerciseId === exerciseId);
    if (!c) { c = { exerciseId, name, sets: 0, credit }; slot.contributors.push(c); }
    c.sets += n;
  };
  const tally = (exercises) => {
    for (const e of exercises) {
      const def = getExercise(e.exerciseId);
      if (!def) continue;
      const n = e.sets.filter(isHardSet).length;
      if (!n) continue;
      def.primary.forEach((m) => add(m, def.id, def.name, n, 1));
      def.secondary.forEach((m) => add(m, def.id, def.name, n, 0.5));
    }
  };
  for (const w of db.workouts) if ((w.finishedAt || w.startedAt) >= since) tally(w.exercises);
  if (includeActive && db.active) tally(db.active.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.filter((s) => s.done && s.reps > 0) })));
  for (const m of Object.keys(out)) out[m].count = Math.round(out[m].count * 10) / 10;
  return out;
}

export function statusFor(count, [min, max]) {
  if (count < min) return 'Under';
  if (count > max) return 'Over';
  return 'In range';
}

/** Sorted rows for the This week list: Under first, then In range, then Over. */
export function weeklyRows() {
  const vol = weeklyVolume();
  const t = targets();
  const order = { Under: 0, 'In range': 1, Over: 2 };
  return MUSCLES.map((m) => {
    const range = t[m.id];
    const count = vol[m.id].count;
    return { muscle: m.id, name: m.name, count, range, status: statusFor(count, range), contributors: vol[m.id].contributors, deficit: Math.max(0, range[0] - count) };
  }).sort((a, b) => (order[a.status] - order[b.status]) || (b.deficit - a.deficit) || a.name.localeCompare(b.name));
}

/** Muscles currently under target, most behind first (used by generator / swaps). */
export function underTargetSet() {
  const set = new Map();
  for (const r of weeklyRows()) if (r.status === 'Under') set.set(r.muscle, r.deficit);
  return set;
}

/** One nudge line for the Today tab, or null: "Rear delts: 2 of 8 sets this week". */
export function underTargetLine() {
  const elapsed = weekElapsed();
  const threshold = db.settings.weekMode === 'calendar' ? Math.max(0.3, elapsed) : 0.5;
  const rows = weeklyRows().filter((r) => r.status === 'Under' && r.count < r.range[0] * threshold);
  if (!rows.length) return null;
  const r = rows[0];
  return `${MUSCLE_NAME[r.muscle]}: ${Math.round(r.count)} of ${r.range[0]} sets this week`;
}

export const SIZE_GROUPS = { large: LARGE, medium: MEDIUM, small: SMALL };
