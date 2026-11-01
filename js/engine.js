/* ==========================================================================
   engine.js — equipment-aware rules engine (offline, no AI).

   - Gym profiles: which equipment ids a gym has (bodyweight always).
   - availability(exercise, gym): can this exercise be done here?
   - substitutes(): ranked alternatives for the same primary muscle.
   - resolveDay(): a split day resolved against a gym (keep / swap / unavailable).
   - generateDay(): build a day from target muscles using only gym equipment.
   - coverage(): which muscles the gym can train, and the cheapest fix.
   ========================================================================== */

import { db } from './db.js';
import { EQUIPMENT_TYPES, EQUIPMENT_BY_ID, ALL_EQUIPMENT_IDS, MUSCLES, MUSCLE_NAME, DAY_TARGETS, PATTERNS } from './data.js';
import { allExercises, getExercise, exerciseSessions } from './exercises.js';
import { uid } from './ui.js';
import { underTargetSet } from './volume.js';

/* ---------- Gyms ---------- */

export function gyms() {
  if (!db.gyms.length) seedDefaultGym();
  return db.gyms;
}

export function seedDefaultGym() {
  const g = { id: uid('g_'), name: 'My gym', equipment: [...ALL_EQUIPMENT_IDS] };
  db.gyms.push(g);
  db.settings.activeGymId = g.id;
  db.save('gyms'); db.save('settings');
  return g;
}

export function activeGym() {
  const list = gyms();
  return list.find((g) => g.id === db.settings.activeGymId) || list[0];
}

export function setActiveGym(id) {
  db.settings.activeGymId = id;
  db.save('settings');
}

export function createGym(name, equipment = [...ALL_EQUIPMENT_IDS]) {
  const g = { id: uid('g_'), name, equipment: [...new Set(['bodyweight', ...equipment])] };
  db.gyms.push(g);
  db.save('gyms');
  return g;
}

export function deleteGym(id) {
  db.gyms = db.gyms.filter((g) => g.id !== id);
  if (db.overrides) delete db.overrides[id];
  db.save('gyms'); db.save('overrides');
  if (db.settings.activeGymId === id) setActiveGym(db.gyms[0] ? db.gyms[0].id : null);
  if (!db.gyms.length) seedDefaultGym();
}

export function gymSet(gym) {
  return new Set(['bodyweight', ...(gym ? gym.equipment : [])]);
}

export function equipmentNames(ids) {
  return ids.map((id) => (EQUIPMENT_BY_ID[id] ? EQUIPMENT_BY_ID[id].name : id)).join(', ');
}

/* ---------- Per-gym overrides ("always use X here") ---------- */

export function getOverride(gymId, exerciseId) {
  return db.overrides && db.overrides[gymId] ? db.overrides[gymId][exerciseId] : null;
}

export function setOverride(gymId, exerciseId, substituteId) {
  if (!db.overrides) db.overrides = {};
  if (!db.overrides[gymId]) db.overrides[gymId] = {};
  if (substituteId) db.overrides[gymId][exerciseId] = substituteId;
  else delete db.overrides[gymId][exerciseId];
  db.save('overrides');
}

/* ---------- Availability ---------- */

/** Requirement sets for an exercise; customs without a mapping fall back to their display category. */
export function equipFor(ex) {
  if (ex.equip && ex.equip.length) return ex.equip;
  const fallback = { barbell: [['barbell']], dumbbell: [['dumbbells']], cable: [['cable-single'], ['cable-dual']], machine: [['chest-press']], bodyweight: [['bodyweight']], other: [['bodyweight']] };
  return fallback[ex.equipment] || [['bodyweight']];
}

/** { ok, missing[] } — missing lists what the closest requirement set lacks. */
export function availability(ex, gym, extraMissing = []) {
  const have = gymSet(gym);
  for (const id of extraMissing) have.delete(id);
  let best = null;
  for (const set of equipFor(ex)) {
    const missing = set.filter((id) => !have.has(id));
    if (!missing.length) return { ok: true, missing: [] };
    if (!best || missing.length < best.length) best = missing;
  }
  return { ok: false, missing: best || [] };
}

/** Smallest requirement set size (fewer pieces = easier). */
function pieces(ex) {
  return Math.min(...equipFor(ex).map((s) => s.length));
}

/** Equipment ids an exercise actually uses in this gym (first satisfied set). */
export function usedEquipment(ex, gym) {
  const have = gymSet(gym);
  return equipFor(ex).find((set) => set.every((id) => have.has(id))) || equipFor(ex)[0];
}

const loggedCount = (id) => exerciseSessions(id).length;

/* ---------- Substitution ---------- */

/**
 * Score a candidate as a stand-in for `orig`:
 * same movement pattern > shared secondary muscles > logged before > fewer pieces.
 */
export function scoreSubstitute(orig, cand) {
  let s = 0;
  if (underTargetSet().has(cand.primary[0])) s += 15;
  if (orig.pattern && cand.pattern === orig.pattern) s += 100;
  if (cand.kind === orig.kind) s += 20;
  const sec = new Set(orig.secondary || []);
  s += (cand.secondary || []).filter((m) => sec.has(m)).length * 10;
  if (cand.primary[0] === orig.primary[0]) s += 8;
  if (loggedCount(cand.id) > 0) s += 5;
  s += Math.max(0, 4 - pieces(cand));
  return s;
}

/** Ranked substitutes for an exercise using only the gym's equipment. */
export function substitutes(exerciseId, gym, { exclude = [], excludeEquipment = [], n = 3 } = {}) {
  const orig = getExercise(exerciseId);
  if (!orig) return [];
  const main = orig.primary[0];
  const skip = new Set([exerciseId, ...exclude]);
  return allExercises()
    .filter((ex) => !skip.has(ex.id) && ex.primary.includes(main) && availability(ex, gym, excludeEquipment).ok)
    .map((ex) => ({ ex, score: scoreSubstitute(orig, ex) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ ex, score }) => ({ ...ex, score, why: whySubstitute(orig, ex) }));
}

function whySubstitute(orig, cand) {
  const bits = [];
  if (orig.pattern && cand.pattern === orig.pattern) bits.push(`same ${PATTERNS[cand.pattern] ? PATTERNS[cand.pattern].toLowerCase() : 'pattern'}`);
  else bits.push(`also hits ${MUSCLE_NAME[orig.primary[0]].toLowerCase()}`);
  if (loggedCount(cand.id) > 0) bits.push('you have logged it before');
  return bits.join(', ');
}

/* ---------- Resolve a split day against a gym ---------- */

/**
 * Returns [{ exerciseId, status: 'ok'|'swapped'|'unavailable', originalId, reason, missing[] }]
 * Per-gym overrides win; then the engine's best substitute; otherwise keep it, greyed.
 */
export function resolveDay(day, gym) {
  const out = [];
  const taken = new Set(day.exerciseIds);
  for (const id of day.exerciseIds) {
    const ex = getExercise(id);
    if (!ex) continue;
    const override = getOverride(gym.id, id);
    if (override && override !== id) {
      const sub = getExercise(override);
      if (sub && availability(sub, gym).ok) {
        out.push({ exerciseId: sub.id, status: 'swapped', originalId: id, reason: `You chose ${sub.name} instead of ${ex.name} at ${gym.name}`, missing: [] });
        taken.add(sub.id);
        continue;
      }
    }
    const av = availability(ex, gym);
    if (av.ok) { out.push({ exerciseId: id, status: 'ok', reason: '', missing: [] }); continue; }
    const missingText = equipmentNames(av.missing).toLowerCase();
    const [sub] = substitutes(id, gym, { exclude: [...taken], n: 1 });
    if (sub) {
      out.push({ exerciseId: sub.id, status: 'swapped', originalId: id, reason: `No ${missingText} at ${gym.name} · ${sub.why}`, missing: av.missing });
      taken.add(sub.id);
    } else {
      out.push({ exerciseId: id, status: 'unavailable', reason: `Needs ${missingText}`, missing: av.missing });
    }
  }
  return out;
}

/* ---------- Generate a day ---------- */

export const TARGET_PRESETS = [
  { id: 'push', name: 'Push', targets: DAY_TARGETS.push },
  { id: 'pull', name: 'Pull', targets: DAY_TARGETS.pull },
  { id: 'legs', name: 'Legs', targets: DAY_TARGETS.legs },
  { id: 'upper', name: 'Upper', targets: DAY_TARGETS.upper },
  { id: 'lower', name: 'Lower', targets: DAY_TARGETS.lower },
  { id: 'full', name: 'Full body', targets: DAY_TARGETS.full },
];

export const LENGTHS = [{ id: 'short', name: 'Short', count: 4 }, { id: 'standard', name: 'Standard', count: 6 }, { id: 'long', name: 'Long', count: 8 }];

/**
 * Build a day: one compound per target first (if any), then isolations to fill.
 * Never two exercises with the same primary AND pattern. Prefers logged exercises.
 * Returns [{ exerciseId, kind, sets, repsLabel, targetReps, reason }]
 */
export function generateDay({ targets, length = 6, gym }) {
  const avail = allExercises().filter((ex) => availability(ex, gym).ok);
  const key = (ex) => `${ex.primary[0]}|${ex.pattern}`;
  const usedIds = new Set();
  const usedKeys = new Set();
  const out = [];

  const under = underTargetSet();
  const deficit = (ex) => under.get(ex.primary[0]) || 0;
  const rank = (muscle) => (a, b) =>
    (deficit(b) - deficit(a)) ||
    (loggedCount(b.id) - loggedCount(a.id)) ||
    ((b.primary[0] === muscle) - (a.primary[0] === muscle)) ||
    (pieces(a) - pieces(b));

  const pick = (muscle, kind) => {
    const c = avail.filter((ex) => ex.kind === kind && ex.primary.includes(muscle) && !usedIds.has(ex.id) && !usedKeys.has(key(ex)));
    c.sort(rank(muscle));
    return c[0] || null;
  };
  const add = (ex, muscle, why) => {
    usedIds.add(ex.id); usedKeys.add(key(ex));
    const first = ex.kind === 'compound' && !out.some((e) => e.kind === 'compound');
    out.push({
      exerciseId: ex.id, kind: ex.kind,
      sets: ex.kind === 'compound' ? (first ? 4 : 3) : 3,
      repsLabel: ex.kind === 'compound' ? '5–8' : '10–15',
      targetReps: ex.kind === 'compound' ? 6 : 12,
      reason: `${why} for ${MUSCLE_NAME[muscle].toLowerCase()}${loggedCount(ex.id) ? ' · you have logged it before' : ''}`,
    });
  };

  for (const m of targets) { if (out.length >= length) break; const ex = pick(m, 'compound'); if (ex) add(ex, m, 'Compound'); }
  let guard = 0;
  while (out.length < length && guard++ < 20) {
    let added = false;
    for (const m of targets) {
      if (out.length >= length) break;
      const ex = pick(m, 'isolation') || pick(m, 'compound');
      if (ex) { add(ex, m, ex.kind === 'isolation' ? 'Isolation' : 'Second compound'); added = true; }
    }
    if (!added) break;
  }
  return out;
}

/* ---------- Coverage ---------- */

/** { trainable: Set<muscle>, untrainable: [muscle], fix: { equipId, muscles: [] } | null } */
export function coverage(gym) {
  const trainable = new Set();
  for (const ex of allExercises()) if (availability(ex, gym).ok) ex.primary.forEach((m) => trainable.add(m));
  const untrainable = MUSCLES.map((m) => m.id).filter((m) => !trainable.has(m));
  if (!untrainable.length) return { trainable, untrainable, fix: null };
  let fix = null;
  const have = gymSet(gym);
  for (const eq of EQUIPMENT_TYPES) {
    if (have.has(eq.id)) continue;
    const trial = { ...gym, equipment: [...gym.equipment, eq.id] };
    const gained = new Set();
    for (const ex of allExercises()) if (availability(ex, trial).ok) ex.primary.forEach((m) => { if (!trainable.has(m)) gained.add(m); });
    if (gained.size && (!fix || gained.size > fix.muscles.length || (gained.size === fix.muscles.length && eq.cost < EQUIPMENT_BY_ID[fix.equipId].cost))) {
      fix = { equipId: eq.id, muscles: [...gained] };
    }
  }
  return { trainable, untrainable, fix };
}
