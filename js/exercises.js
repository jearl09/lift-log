/* ==========================================================================
   exercises.js — resolves the exercise library (built-ins + user overrides
   + custom exercises) and provides per-exercise history queries.
   ========================================================================== */

import { db } from './db.js';
import { BUILTIN_EXERCISES, MUSCLE_NAME } from './data.js';
import { uid, est1RM } from './ui.js';
import { EXERCISE_DB } from './generated/exercise-db.js';

/** Merge dataset-derived secondary muscles into an exercise (ours stay authoritative). */
function withDataset(ex) {
  const d = EXERCISE_DB[ex.id];
  if (!d) return ex;
  const extra = [...(d.primary || []), ...(d.secondary || [])].filter((m) => !ex.primary.includes(m) && !(ex.secondary || []).includes(m));
  return extra.length ? { ...ex, secondary: [...(ex.secondary || []), ...extra] } : ex;
}

const builtinById = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));

export function allExercises() {
  const stored = new Map(db.exercises.map((e) => [e.id, e]));
  const list = [];
  for (const b of BUILTIN_EXERCISES) {
    const o = stored.get(b.id);
    list.push(withDataset(o ? { ...b, ...o, builtin: true } : b));
    stored.delete(b.id);
  }
  for (const c of stored.values()) list.push({ ...c, builtin: false });
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function getExercise(id) {
  const stored = db.exercises.find((e) => e.id === id);
  const b = builtinById.get(id);
  if (b) return withDataset(stored ? { ...b, ...stored, builtin: true } : b);
  if (stored) return { ...stored, builtin: false };
  return null;
}

export function restFor(exercise) {
  if (exercise && exercise.restSec != null && exercise.restSec > 0) return exercise.restSec;
  return db.settings.defaultRestSec;
}

export function muscleNames(ids) {
  return (ids || []).map((m) => MUSCLE_NAME[m] || m).join(', ');
}

export function createExercise(fields) {
  const ex = {
    id: uid('c_'),
    name: fields.name.trim(),
    equipment: fields.equipment || 'other',
    primary: fields.primary || [],
    secondary: fields.secondary || [],
    restSec: fields.restSec || null,
    equip: fields.equip && fields.equip.length ? fields.equip : undefined,
    pattern: fields.pattern || undefined,
    kind: fields.kind || 'isolation',
    setup: fields.setup != null ? fields.setup : undefined,
  };
  db.exercises.push(ex);
  db.save('exercises');
  return ex;
}

export function updateExercise(id, fields) {
  const idx = db.exercises.findIndex((e) => e.id === id);
  const base = idx >= 0 ? db.exercises[idx] : { id };
  const next = { ...base, ...fields, id };
  if (idx >= 0) db.exercises[idx] = next;
  else db.exercises.push(next);
  db.save('exercises');
}

export function deleteExercise(id) {
  db.exercises = db.exercises.filter((e) => e.id !== id);
  db.save('exercises');
  if (!builtinById.has(id)) {
    for (const s of db.splits) for (const d of s.days) d.exerciseIds = d.exerciseIds.filter((x) => x !== id);
    db.save('splits');
  }
}

export function isBuiltin(id) { return builtinById.has(id); }

/* ---------- History ---------- */

/** Sessions for an exercise, newest first: [{ workoutId, date, sets[] }] */
export function exerciseSessions(exerciseId) {
  const out = [];
  for (const w of db.workouts) {
    for (const ex of w.exercises) {
      if (ex.exerciseId === exerciseId && ex.sets.length) {
        out.push({ workoutId: w.id, date: w.finishedAt || w.startedAt, sets: ex.sets });
      }
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

/** Working (non warm-up) sets from the most recent session, for ghost text. */
export function lastSets(exerciseId) {
  const s = exerciseSessions(exerciseId)[0];
  return s ? s.sets.filter((x) => !x.warmup) : [];
}

/** Best single set by estimated 1RM (falls back to most reps for bodyweight). */
export function bestSet(sets) {
  let best = null;
  for (const s of sets) {
    if (s.warmup) continue;
    const score = s.weightKg != null ? est1RM(s.weightKg, s.reps) : s.reps / 1000;
    if (!best || score > best.score) best = { ...s, score };
  }
  return best;
}

/** Highest estimated 1RM ever logged for an exercise (kg), or 0. */
export function bestEst1RM(exerciseId) {
  let best = 0;
  for (const s of exerciseSessions(exerciseId)) for (const x of s.sets) {
    if (x.warmup || x.weightKg == null) continue;
    best = Math.max(best, est1RM(x.weightKg, x.reps) || 0);
  }
  return best;
}

/** Top set weight per session, oldest first, for charting. */
export function topSetSeries(exerciseId) {
  return exerciseSessions(exerciseId)
    .map((s) => {
      const weights = s.sets.filter((x) => !x.warmup).map((x) => x.weightKg).filter((w) => w != null);
      return weights.length ? { date: s.date, kg: Math.max(...weights) } : null;
    })
    .filter(Boolean)
    .reverse();
}
