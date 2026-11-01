/* ==========================================================================
   progression.js — per-exercise progression config and next-session
   suggestions, computed from the last 1–3 sessions. Rules (plain language):

   linear  : every working set hit the target reps AND the hardest set was at
             or under the RPE cap → add one increment. Missed reps two
             sessions in a row → drop 10% (rounded to the increment).
             Otherwise repeat the same weight and reps.
   double  : every set reached the top of the rep range with RPE under the cap
             → add one increment and reset reps to the bottom of the range.
             Otherwise keep the weight and aim for one more rep on the
             weakest set.
   If no RPE was logged, only the rep rules apply. Weight never changes by
   more than one increment per session.
   ========================================================================== */

import { db } from './db.js';
import { getExercise, exerciseSessions } from './exercises.js';
import { fmtWeight, fmtDate } from './ui.js';

const KG_PER_LB = 0.45359237;

/** Default increment in kg by display equipment category. */
export function defaultIncrementKg(ex) {
  const lb = db.settings.units === 'lb';
  switch (ex.equipment) {
    case 'barbell': return lb ? 5 * KG_PER_LB : 2.5;
    case 'dumbbell': return lb ? 2.5 * KG_PER_LB : 1;
    case 'machine': case 'cable': return lb ? 10 * KG_PER_LB : 5;
    case 'bodyweight': return 0;
    default: return lb ? 5 * KG_PER_LB : 2.5;
  }
}

/** Effective progression config for an exercise (stored overrides win). */
export function getProgression(ex) {
  const base = {
    scheme: 'double',
    incrementKg: defaultIncrementKg(ex),
    repRange: ex.kind === 'compound' ? [5, 8] : [10, 15],
    rpeCap: 8,
  };
  const p = ex.progression || {};
  return {
    scheme: p.scheme === 'linear' ? 'linear' : 'double',
    incrementKg: p.incrementKg != null ? p.incrementKg : base.incrementKg,
    repRange: Array.isArray(p.repRange) && p.repRange.length === 2 ? [Number(p.repRange[0]), Number(p.repRange[1])] : base.repRange,
    rpeCap: p.rpeCap != null ? Number(p.rpeCap) : base.rpeCap,
  };
}

function roundTo(kg, inc) {
  if (!inc) return Math.round(kg * 4) / 4;
  return Math.round(kg / inc) * inc;
}

function mode(nums) {
  const counts = new Map();
  for (const n of nums) counts.set(n, (counts.get(n) || 0) + 1);
  let best = null;
  for (const [v, c] of counts) if (!best || c > best.c || (c === best.c && v > best.v)) best = { v, c };
  return best ? best.v : null;
}

function describeSession(s) {
  const working = s.sets.filter((x) => !x.warmup);
  const w = mode(working.map((x) => x.weightKg).filter((x) => x != null));
  const reps = working.map((x) => x.reps).join(', ');
  const rpes = working.map((x) => x.rpe).filter((x) => x != null);
  return `${fmtDate(s.date)} · ${w != null ? fmtWeight(w) : 'bodyweight'} × ${reps}${rpes.length ? ` · RPE up to ${Math.max(...rpes)}` : ''}`;
}

/**
 * Suggestion for the next session, or null with no history.
 * { weightKg, reps, sets, change: 'up'|'down'|'repeat'|'reps', fromKg, reason, sessions[] }
 */
export function suggest(exerciseId) {
  const ex = getExercise(exerciseId);
  if (!ex) return null;
  const sessions = exerciseSessions(exerciseId).slice(0, 3);
  if (!sessions.length) return null;
  const cfg = getProgression(ex);
  const [lo, hi] = cfg.repRange;
  const last = sessions[0];
  const working = last.sets.filter((s) => !s.warmup);
  if (!working.length) return null;
  const lastW = mode(working.map((s) => s.weightKg).filter((w) => w != null));
  const rpes = working.map((s) => s.rpe).filter((r) => r != null);
  const maxRpe = rpes.length ? Math.max(...rpes) : null;
  const rpeOk = maxRpe == null || maxRpe <= cfg.rpeCap;
  const minReps = Math.min(...working.map((s) => s.reps));
  const sets = working.length;
  const used = sessions.map(describeSession);
  const inc = cfg.incrementKg;
  const canLoad = lastW != null && inc > 0;

  if (cfg.scheme === 'linear') {
    const target = lo;
    const hit = working.every((s) => s.reps >= target);
    const prev = sessions[1];
    const prevFailed = prev && prev.sets.filter((s) => !s.warmup).some((s) => s.reps < target);
    if (hit && rpeOk) {
      if (canLoad) return { weightKg: roundTo(lastW + inc, inc), reps: target, sets, change: 'up', fromKg: lastW, sessions: used,
        reason: `All ${sets} sets hit ${target} reps${maxRpe != null ? ` at RPE ${maxRpe} or less` : ''}, so add one increment (${fmtWeight(inc)}).` };
      return { weightKg: lastW, reps: target + 1, sets, change: 'reps', fromKg: lastW, sessions: used, reason: `All sets hit ${target} reps and there is no weight to add, so aim for ${target + 1}.` };
    }
    if (!hit && prevFailed && canLoad) {
      return { weightKg: Math.max(inc, roundTo(lastW * 0.9, inc)), reps: target, sets, change: 'down', fromKg: lastW, sessions: used,
        reason: `Reps fell short of ${target} in the last two sessions, so drop about 10% and rebuild.` };
    }
    return { weightKg: lastW, reps: target, sets, change: 'repeat', fromKg: lastW, sessions: used,
      reason: hit ? `Reps were there but the hardest set was RPE ${maxRpe}, above your cap of ${cfg.rpeCap}. Repeat it.` : `Not every set reached ${target} reps. Repeat the same weight.` };
  }

  // double progression
  const atTop = working.every((s) => s.reps >= hi);
  if (atTop && rpeOk && canLoad) {
    return { weightKg: roundTo(lastW + inc, inc), reps: lo, sets, change: 'up', fromKg: lastW, sessions: used,
      reason: `Every set reached ${hi} reps${maxRpe != null ? ` at RPE ${maxRpe} or less` : ''}, so add ${fmtWeight(inc)} and start again at ${lo} reps.` };
  }
  const nextReps = Math.min(hi, Math.max(lo, minReps + 1));
  return { weightKg: lastW, reps: nextReps, sets, change: nextReps > minReps ? 'reps' : 'repeat', fromKg: lastW, sessions: used,
    reason: atTop && !rpeOk ? `Reps are at the top of the range but RPE ${maxRpe} is above your cap of ${cfg.rpeCap}. Keep the weight until it feels easier.`
      : `Weakest set was ${minReps} reps. Same weight, aim for ${nextReps} on every set; the weight goes up once every set reaches ${hi}.` };
}

/** "4 × 6 @ 62.5 kg · up from 60" */
export function fmtTarget(t) {
  const w = t.weightKg != null ? ` @ ${fmtWeight(t.weightKg)}` : '';
  const delta = t.change === 'up' ? ` · up from ${fmtWeight(t.fromKg, false)}` : t.change === 'down' ? ` · down from ${fmtWeight(t.fromKg, false)}` : t.change === 'reps' ? ' · +1 rep' : '';
  return `${t.sets} × ${t.reps}${w}${delta}`;
}

/** Short arrow line for the Today tab: "Bench Press → 62.5 kg" */
export function fmtSuggestionLine(name, t) {
  if (t.change === 'up' || t.change === 'down') return `${name} → ${fmtWeight(t.weightKg)}`;
  if (t.change === 'reps') return `${name} → ${t.reps} reps`;
  return null;
}
