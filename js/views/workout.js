/* ==========================================================================
   views/workout.js — focused + guided workout mode with RPE, progression
   targets and supersets.

   A "slide" is one exercise, or one superset (2–3 consecutive exercises that
   share a group letter). Supersets run round by round: A1 set 1, A2 set 1,
   rest timer, A1 set 2, … Each exercise keeps its own inputs, history and
   progression. db.active autosaves on every change.
   ========================================================================== */

import { db } from '../db.js';
import { $, el, append, clear, uid, pushPanel, closeAllPanels, toast, fmtDuration, fmtWeight, kgToDisplay, displayToKg, unitLabel, weightStepKg, est1RM, longPress, emptyState, reducedMotion, RPE_VALUES, fmtEffort, effortLabel, effortDisplayValue } from '../ui.js';
import { confirmSheet, openSheet, closeSheet } from '../sheet.js';
import { getExercise, lastSets, restFor, muscleNames, bestEst1RM } from '../exercises.js';
import { activeGym, resolveDay, substitutes, usedEquipment, equipmentNames, setOverride } from '../engine.js';
import { equipmentIconEl } from '../icons.js';
import { timer } from '../timer.js';
import { burst } from '../confetti.js';
import { openPlateCalc, warmupSets } from '../plates.js';
import { createMuscleMap, highlight, combineMuscles } from '../muscles.js';
import { coachingFor } from '../coaching.js';
import { suggest, fmtTarget, getProgression } from '../progression.js';
import { openLibrary } from './library.js';
import { demoTile, openExerciseSheet } from './exercise-sheet.js';

const newSet = () => ({ reps: null, weightKg: null, done: false, rpe: null });
/** Shrink the tile number when it has 4+ characters (e.g. 62.5, 100). */
const fitTile = (input) => { const n = String(input.value || '').length; input.classList.toggle('long', n >= 4); input.classList.toggle('mid', n === 3); };
const GET_SET_SEC = 5;
const NEXT_UP_SEC = 3;
const SUPERSET_REST_DEFAULT = 90;
let idx = 0;            // current slide
let panelRef = null;
let keyHandler = null;
let elapsedInterval = null;
let overlayTimer = null;
let goToFn = null;
let overlayNode = null;

/* ---------- Sets / targets ---------- */

function initialSets(exerciseId, suggested) {
  const n = lastSets(exerciseId).length || suggested || 3;
  return Array.from({ length: n }, newSet);
}

/** Sets pre-filled from the progression target when there is history. */
function buildEntry(ex, e = {}) {
  const t = suggest(ex.id);
  const sets = t
    ? Array.from({ length: t.sets }, () => ({ reps: t.reps, weightKg: t.weightKg, done: false, rpe: null }))
    : initialSets(ex.id, e.suggestedSets);
  return { exerciseId: ex.id, name: ex.name, sets, reason: e.reason || '', swappedFrom: e.swappedFrom || null, targetReps: e.targetReps || null, group: e.group || null, target: t };
}

/** Consecutive entries sharing a group letter form one slide. */
export function slidesOf(exercises) {
  const slides = [];
  for (let i = 0; i < exercises.length; i++) {
    const e = exercises[i];
    const last = slides[slides.length - 1];
    if (e.group && last && last.group === e.group && last.idxs[last.idxs.length - 1] === i - 1 && last.idxs.length < 3) last.idxs.push(i);
    else slides.push({ idxs: [i], group: e.group || null });
  }
  return slides;
}

export function startWorkout(split, day) {
  if (db.active) { openWorkout(); return; }
  const gym = activeGym();
  const resolved = resolveDay(day, gym);
  const skipped = resolved.filter((r) => r.status === 'unavailable');
  const groups = Array.isArray(day.groups) ? day.groups : [];
  const letterFor = (origId) => { const gi = groups.findIndex((g) => g.includes(origId)); return gi >= 0 ? String.fromCharCode(65 + gi) : null; };
  startSession({
    splitId: split.id, splitName: split.name, dayId: day.id, dayName: day.name,
    entries: resolved.filter((r) => r.status !== 'unavailable').map((r) => ({
      exerciseId: r.exerciseId, swappedFrom: r.originalId || null, reason: r.status === 'swapped' ? r.reason : '', group: letterFor(r.originalId || r.exerciseId),
    })),
  });
  if (skipped.length) toast(`${skipped.length} exercise${skipped.length === 1 ? '' : 's'} unavailable at ${gym.name} left out`, { duration: 3500 });
}

/** entries: [{ exerciseId, reason?, swappedFrom?, suggestedSets?, targetReps?, group? }] */
export function startSession({ splitId, splitName, dayId, dayName, entries }) {
  if (db.active) { openWorkout(); return; }
  db.active = {
    id: uid('w_'), splitId, splitName, dayId, dayName, gymId: activeGym().id,
    guide: !!db.settings.guideMe, guideIntro: !!db.settings.guideMe,
    startedAt: Date.now(),
    exercises: entries.map((e) => ({ ex: getExercise(e.exerciseId), e })).filter((x) => x.ex).map(({ ex, e }) => buildEntry(ex, e)),
    timer: null,
  };
  db.save('active');
  idx = 0;
  closeAllPanels();
  openWorkout();
}

export function discardWorkout() {
  timer.skip();
  db.active = null;
  db.save('active');
  timer.resume();
}

const save = () => db.save('active');

function finishedExercises(a) {
  return a.exercises
    .map((e) => ({
      exerciseId: e.exerciseId, name: e.name,
      ...(e.swappedFrom ? { swappedFrom: e.swappedFrom } : {}),
      ...(e.group ? { group: e.group } : {}),
      sets: e.sets.filter((s) => s.done && s.reps > 0)
        .map((s) => ({ reps: s.reps, weightKg: s.weightKg, ...(s.rpe != null ? { rpe: s.rpe } : {}), ...(s.warmup ? { warmup: true } : {}), ...(s.pr ? { pr: true } : {}) })),
    }))
    .filter((e) => e.sets.length);
}

async function finishWorkout() {
  const a = db.active;
  if (!a) return;
  const exercises = finishedExercises(a);
  if (!exercises.length) {
    if (await confirmSheet('No sets were completed, so there is nothing to save.', { title: 'Discard workout?', confirmLabel: 'Discard', danger: true })) { discardWorkout(); closeAllPanels(); }
    return;
  }
  const now = Date.now();
  db.workouts.unshift({
    id: a.id, splitId: a.splitId, splitName: a.splitName, dayId: a.dayId, dayName: a.dayName, gymId: a.gymId || null,
    startedAt: a.startedAt, finishedAt: now, durationSec: Math.round((now - a.startedAt) / 1000), exercises,
  });
  db.save('workouts');
  discardWorkout();
  closeAllPanels();
  const prs = exercises.reduce((n, e) => n + e.sets.filter((s) => s.pr).length, 0);
  toast(prs ? `Workout saved · ${prs} PR${prs === 1 ? '' : 's'} 🎉` : 'Workout saved 💪');
  document.dispatchEvent(new CustomEvent('app:tab', { detail: 'history' }));
}

/* ---------- Panel ---------- */

export function openWorkout() {
  if (!db.active) return;
  idx = Math.min(idx, slidesOf(db.active.exercises).length);
  panelRef = pushPanel({
    title: db.active.dayName,
    action: { label: 'Finish', onclick: finishWorkout },
    onClose() {
      clearInterval(elapsedInterval); elapsedInterval = null;
      clearInterval(overlayTimer); overlayTimer = null;
      if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
      panelRef = null; goToFn = null; overlayNode = null;
    },
    render(body) { build(body); },
  });
}

function build(body) {
  const a = db.active;
  body.classList.add('flush');
  if (!a) { body.append(el('div.empty', {}, 'No active workout.')); return; }

  const elapsed = el('span.elapsed');
  const count = el('span.num');
  const progFill = el('i');
  const updateMeta = () => {
    elapsed.textContent = `${fmtDuration((Date.now() - a.startedAt) / 1000)} · ${a.splitName}`;
    const total = a.exercises.reduce((n, e) => n + e.sets.length, 0);
    const done = a.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    count.textContent = `${done}/${total} sets`;
    progFill.style.width = `${total ? (done / total) * 100 : 0}%`;
  };
  updateMeta();
  clearInterval(elapsedInterval);
  elapsedInterval = setInterval(updateMeta, 1000);

  const slides = slidesOf(a.exercises);
  const track = el('div.track');
  slides.forEach((sl) => track.append(slide(sl, updateMeta)));
  track.append(addSlide());
  const carousel = el('div.carousel', {}, track);
  const overlay = el('div.wk-overlay.hidden');

  const dots = el('div.dots');
  const prev = el('button.icon-btn', { 'aria-label': 'Previous exercise', onclick: () => goTo(idx - 1) }, '‹');
  const next = el('button.icon-btn', { 'aria-label': 'Next exercise', onclick: () => goTo(idx + 1) }, '›');
  const bottom = el('div.wk-bottom', {},
    el('div.dots-row', {}, prev, dots, next),
    el('div.btn-row', {},
      el('button.btn', { id: 'wk-add', onclick: addExercise }, '+ Add exercise'),
      el('button.btn.primary', { id: 'wk-finish', onclick: finishWorkout }, 'Finish'),
    ),
  );
  body.append(el('div.wk', {}, el('div.wk-top', {}, elapsed, count), el('div.wk-progress', {}, progFill), carousel, bottom, overlay));

  const total = () => slides.length + 1;
  function goTo(i) {
    idx = Math.max(0, Math.min(total() - 1, i));
    track.style.transform = `translateX(-${idx * 100}%)`;
    clear(dots);
    for (let k = 0; k < total(); k++) {
      const sl = slides[k];
      const allDone = sl && sl.idxs.every((j) => a.exercises[j].sets.length && a.exercises[j].sets.every((s) => s.done));
      dots.append(el('button.dot', { class: [k === idx && 'active', allDone && 'done', sl && sl.idxs.length > 1 && 'super'].filter(Boolean).join(' '), 'aria-label': `Go to exercise ${k + 1}`, onclick: () => goTo(k) }));
    }
    prev.disabled = idx === 0;
    next.disabled = idx === total() - 1;
  }
  goTo(idx);
  goToFn = goTo;
  overlayNode = overlay;

  let sx = 0, sy = 0, dx = 0, decided = false, horizontal = false, fromRow = false, t0 = 0;
  carousel.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; decided = false; horizontal = false; t0 = Date.now();
    fromRow = !!e.target.closest('.set-inner');
  }, { passive: true });
  carousel.addEventListener('touchmove', (e) => {
    dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (!decided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) { decided = true; horizontal = Math.abs(dx) > Math.abs(dy); }
    if (!horizontal) return;
    if (fromRow && dx < 0) return;
    track.classList.add('dragging');
    const resist = (idx === 0 && dx > 0) || (idx === total() - 1 && dx < 0) ? 0.35 : 1;
    track.style.transform = `translateX(calc(-${idx * 100}% + ${dx * resist}px))`;
  }, { passive: true });
  const endSwipe = () => {
    if (!track.classList.contains('dragging')) return;
    track.classList.remove('dragging');
    const v = Math.abs(dx) / Math.max(1, Date.now() - t0);
    if (dx < -60 || (dx < -20 && v > 0.5)) goTo(idx + 1);
    else if (dx > 60 || (dx > 20 && v > 0.5)) goTo(idx - 1);
    else goTo(idx);
  };
  carousel.addEventListener('touchend', endSwipe);
  carousel.addEventListener('touchcancel', endSwipe);

  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowRight') goTo(idx + 1);
    if (e.key === 'ArrowLeft') goTo(idx - 1);
  };
  document.addEventListener('keydown', keyHandler);

  if (a.guide && a.guideIntro && a.exercises.length && !a.exercises.some((e) => e.sets.some((s) => s.done))) {
    a.guideIntro = false; save();
    showGetSet(0);
  }
}

/* ---------- Guided overlays ---------- */

function overlayEl() { return overlayNode && overlayNode.isConnected ? overlayNode : null; }

function hideOverlay() {
  clearInterval(overlayTimer); overlayTimer = null;
  const o = overlayEl();
  if (o) { o.classList.add('hidden'); clear(o); }
}

function countdown(node, seconds, onDone) {
  let n = seconds;
  node.textContent = String(n);
  clearInterval(overlayTimer);
  overlayTimer = setInterval(() => {
    n -= 1;
    if (n <= 0) { hideOverlay(); onDone(); return; }
    node.textContent = String(n);
  }, 1000);
}

function targetLine(entry) {
  if (entry.target) return `Target: ${fmtTarget(entry.target)}`;
  const last = lastSets(entry.exerciseId);
  if (last.length) return `Last: ${last.map((s) => `${s.reps}×${s.weightKg != null ? fmtWeight(s.weightKg, false) : 'BW'}`).join('  ')}`;
  return `Target: ${entry.sets.length} × ${entry.targetReps || 8}`;
}

function slideEntries(slideIdx) {
  const a = db.active;
  const sl = slidesOf(a.exercises)[slideIdx];
  return sl ? sl.idxs.map((i) => a.exercises[i]) : [];
}

function demosRow(entries) {
  const size = entries.length > 1 ? 120 : 160;
  return el('div.demos-row', {}, entries.map((entry) => demoTile(getExercise(entry.exerciseId), { size, onclick: () => openExerciseSheet(entry.exerciseId, { entry }) })));
}

function showGetSet(slideIdx) {
  const o = overlayEl();
  const entries = slideEntries(slideIdx);
  if (!o || !entries.length) return;
  const coach = coachingFor(entries[0].exerciseId);
  clear(o); o.classList.remove('hidden'); o.dataset.mode = 'getset';
  const num = el('div.count');
  append(o, [
    el('div.label', {}, entries.length > 1 ? 'Get set · superset' : 'Get set'),
    demosRow(entries),
    el('h2', {}, entries.map((e) => e.name).join(' + ')),
    coach && el('p.small', {}, coach.setup),
    num,
    el('button.btn.sm', { onclick: () => hideOverlay() }, 'Skip'),
  ]);
  countdown(num, GET_SET_SEC, () => {});
}

function showNextUp(slideIdx) {
  const o = overlayEl();
  const entries = slideEntries(slideIdx);
  if (!o || !entries.length) return;
  clear(o); o.classList.remove('hidden'); o.dataset.mode = 'nextup';
  const num = el('div.count');
  const go = () => { hideOverlay(); goToFn && goToFn(slideIdx); showGetSet(slideIdx); };
  append(o, [
    el('div.label', {}, entries.length > 1 ? 'Next up · superset' : 'Next up'),
    demosRow(entries),
    el('h2', {}, entries.map((e, i) => (entries.length > 1 ? `${e.group}${i + 1} ${e.name}` : e.name)).join(' + ')),
    el('p.small', {}, entries.map((e) => `${e.sets.length} set${e.sets.length === 1 ? '' : 's'} · ${targetLine(e)}`).join('  ·  ')),
    num,
    el('button.btn.sm', { onclick: go }, 'Skip'),
  ]);
  countdown(num, NEXT_UP_SEC, go);
}

function showSummary() {
  const a = db.active; const o = overlayEl();
  if (!a || !o) return;
  clear(o); o.classList.remove('hidden'); o.dataset.mode = 'summary';
  const done = a.exercises.flatMap((e) => e.sets.filter((s) => s.done));
  const volume = done.reduce((v, s) => v + (s.weightKg || 0) * s.reps, 0);
  const prs = done.filter((s) => s.pr).length;
  const hit = a.exercises.filter((e) => e.sets.some((s) => s.done)).map((e) => getExercise(e.exerciseId));
  append(o, [
    el('div.label', {}, 'All sets done'),
    el('h2', {}, a.dayName),
    el('div.stats.summary-stats', {},
      el('div.stat', {}, el('div.v', {}, fmtDuration((Date.now() - a.startedAt) / 1000)), el('div.k', {}, 'Duration')),
      el('div.stat', {}, el('div.v', {}, String(done.length)), el('div.k', {}, 'Sets')),
      el('div.stat', {}, el('div.v', {}, volume ? fmtWeight(volume) : '—'), el('div.k', {}, 'Volume')),
    ),
    el('div.summary-map', {}, highlight(createMuscleMap(), combineMuscles(hit))),
    el('p.small', {}, prs ? `${prs} personal record${prs === 1 ? '' : 's'} 🎉` : 'No new records this time. Consistency wins.'),
    el('button.btn.primary.block', { id: 'wk-summary-finish', onclick: finishWorkout }, 'Finish workout'),
    el('button.btn.ghost.sm', { onclick: () => hideOverlay() }, 'Keep going'),
  ]);
}

function afterSetComplete(entry) {
  const a = db.active;
  if (!a) return;
  const slides = slidesOf(a.exercises);
  const si = slides.findIndex((sl) => sl.idxs.some((i) => a.exercises[i] === entry));
  const slideDone = (sl) => sl.idxs.every((i) => a.exercises[i].sets.length && a.exercises[i].sets.every((s) => s.done));
  if (si < 0 || !slideDone(slides[si])) return;
  if (slides.every(slideDone)) { setTimeout(showSummary, 600); return; }
  if (!a.guide) return;
  let target = slides.findIndex((sl, k) => k > si && !slideDone(sl));
  if (target < 0) target = slides.findIndex((sl) => !slideDone(sl));
  if (target >= 0) setTimeout(() => showNextUp(target), 600);
}

/* ---------- Add / remove ---------- */

function addExercise() {
  openLibrary({
    title: 'Add exercise',
    pick: (id) => {
      const ex = getExercise(id);
      if (!ex) return;
      db.active.exercises.push(buildEntry(ex));
      save();
      idx = slidesOf(db.active.exercises).length - 1;
    },
  });
}

function addSlide() {
  return el('div.slide', {}, el('div.slide-inner', {},
    el('div.card', {}, emptyState({ icon: 'dumbbell', title: 'Add an exercise', text: 'Pick anything from the library. Unplanned extras count too.', action: { label: '+ Add exercise', onclick: addExercise } })),
    el('button.btn.ghost.danger.block', { id: 'wk-discard', onclick: async () => {
      if (await confirmSheet('Nothing from this session will be saved.', { title: 'Discard workout?', confirmLabel: 'Discard', danger: true })) { discardWorkout(); closeAllPanels(); }
    } }, 'Discard workout'),
  ));
}

async function removeEntry(entry) {
  const a = db.active;
  const i = a.exercises.indexOf(entry);
  if (entry.sets.some((s) => s.done) && !(await confirmSheet(`Logged sets for ${entry.name} will be lost.`, { title: 'Remove exercise?', confirmLabel: 'Remove', danger: true }))) return;
  a.exercises.splice(i, 1); save();
  idx = Math.max(0, Math.min(idx, slidesOf(a.exercises).length - 1));
  panelRef && panelRef.refresh();
}

/* ---------- "Not available right now" ---------- */

export function openSwapSheet(entry) {
  const gym = activeGym();
  const ex = getExercise(entry.exerciseId);
  if (!ex) return;
  const taken = usedEquipment(ex, gym);
  const subs = substitutes(entry.exerciseId, gym, { exclude: db.active.exercises.map((e) => e.exerciseId), excludeEquipment: taken, n: 3 });
  openSheet({
    title: 'Not available right now?',
    text: subs.length
      ? `Swap ${ex.name} for something at ${gym.name} that doesn't need ${equipmentNames(taken).toLowerCase()}.`
      : `Nothing else at ${gym.name} hits ${muscleNames(ex.primary.slice(0, 1)).toLowerCase()} without ${equipmentNames(taken).toLowerCase()}.`,
    render(body) {
      const list = el('div.list');
      for (const s of subs) {
        list.append(el('button.list-item', { onclick: () => {
          const original = entry.swappedFrom || entry.exerciseId;
          const anyDone = entry.sets.some((x) => x.done);
          const fresh = buildEntry(getExercise(s.id), { group: entry.group });
          entry.exerciseId = s.id; entry.name = s.name; entry.swappedFrom = original;
          entry.reason = `Swapped during this workout · ${s.why}`;
          entry.target = fresh.target;
          if (!anyDone) entry.sets = fresh.sets;
          save();
          closeSheet();
          panelRef && panelRef.refresh();
          toast(`Using ${s.name}`, { action: `Always at ${gym.name}`, duration: 6000, onAction: () => { setOverride(gym.id, original, s.id); toast(`${s.name} will replace ${getExercise(original).name} at ${gym.name}`); } });
        } },
          el('div.grow', {}, el('div.title', {}, s.name), el('div.sub', {}, s.why)),
          el('span.eq-icons', {}, usedEquipment(s, gym).map((id) => equipmentIconEl(id, 20))),
        ));
      }
      if (subs.length) body.append(list);
    },
    actions: [{ label: 'Cancel' }],
  });
}

/* ---------- RPE picker + Why sheet ---------- */

export function openRpePicker({ current = null, ghost = null, onPick, onClear }) {
  const rir = db.settings.effortDisplay === 'rir';
  openSheet({
    title: 'How hard was that set?',
    text: rir ? 'RIR = reps you had left. 0 means nothing left in the tank.' : 'RPE 10 = nothing left. 8 = two reps in reserve.',
    render(body) {
      const row = el('div.chips.rpe-row');
      const values = rir ? [...RPE_VALUES].reverse() : RPE_VALUES;
      for (const v of values) {
        row.append(el('button.chip', { class: current === v ? 'active' : '', dataset: { rpe: String(v) }, onclick: () => { onPick(v); closeSheet(); } }, String(effortDisplayValue(v))));
      }
      body.append(row);
      if (ghost != null) body.append(el('p.muted.small', {}, `Last time: ${fmtEffort(ghost)}`));
    },
    actions: [
      ...(current != null && onClear ? [{ label: 'Clear', onclick: () => { onClear(); } }] : []),
      { label: 'Skip' },
    ],
  });
}

function openWhySheet(entry) {
  const t = entry.target;
  const ex = getExercise(entry.exerciseId);
  const cfg = getProgression(ex);
  openSheet({
    title: 'Why this target?',
    text: fmtTarget(t),
    render(body) {
      body.append(
        el('p', {}, t.reason),
        el('div.stack', { style: { gap: '2px' } }, el('span.muted.small', {}, 'Sessions used'), ...t.sessions.map((s) => el('div.small', {}, s))),
        el('p.muted.small', {}, `Rule: ${cfg.scheme === 'linear' ? 'linear progression' : 'double progression'} · reps ${cfg.repRange[0]}–${cfg.repRange[1]} · increment ${fmtWeight(cfg.incrementKg)} · RPE cap ${cfg.rpeCap}. Weight never moves more than one increment per session.`),
      );
    },
    actions: [{ label: 'Close' }],
  });
}

/* ---------- Slides ---------- */

function slide(sl, updateMeta) {
  const node = el('div.slide');
  const draw = () => {
    const st = node.scrollTop;
    clear(node);
    const entries = sl.idxs.map((i) => db.active.exercises[i]).filter(Boolean);
    if (!entries.length) return;
    node.append(entries.length > 1 ? supersetContent(entries, { redraw: draw, updateMeta }) : slideContent(entries[0], { redraw: draw, updateMeta }));
    node.scrollTop = st;
  };
  draw();
  return node;
}

function headerFor(entry, ex, ctx, { label = null, compact = false } = {}) {
  const coach = coachingFor(entry.exerciseId);
  const last = lastSets(entry.exerciseId);
  const lastSummary = last.length
    ? `Last: ${last.map((s) => `${s.reps}×${s.weightKg != null ? fmtWeight(s.weightKg, false) : 'BW'}${s.rpe != null ? ` @${effortDisplayValue(s.rpe)}` : ''}`).join('  ')}`
    : (entry.targetReps ? `Suggested: ${entry.sets.length} × ${entry.targetReps} reps` : 'No previous session');
  const openSheet_ = () => openExerciseSheet(ex.id, { entry });
  const head = el('div.wk-ex-head.grow', {},
    el('button.name-btn', { onclick: openSheet_ },
      label && el('span.ss-label', {}, label),
      el('span.name', { class: compact ? 'compact' : '' }, entry.name),
      entry.swappedFrom && el('span.chip.swapped', { style: { marginLeft: '8px', verticalAlign: 'middle' } }, 'Swapped')),
    entry.target && el('div.target-line', {}, fmtTarget(entry.target), ' ', el('button.why-link', { onclick: () => openWhySheet(entry) }, 'Why?')),
    coach && !compact && el('div.cue-line', {}, coach.cue),
    el('div.meta', {}, `${muscleNames(ex.primary)} · rest ${entry.group ? db.settings.defaultRestSec || SUPERSET_REST_DEFAULT : restFor(ex)}s`),
    entry.reason && !compact && el('div.why', {}, `Why this exercise? ${entry.reason}`),
    el('div.last', {}, lastSummary),
  );
  longPress(head, () => openSwapSheet(entry));
  return el('div.row', { style: { alignItems: 'flex-start' } },
    demoTile(ex, { size: compact ? 64 : 96, onclick: openSheet_ }),
    head,
    el('div.stack', { style: { gap: '0' } },
      el('button.icon-btn.swap-btn', { 'aria-label': 'Not available right now', title: 'Swap exercise', onclick: () => openSwapSheet(entry) }, '⇄'),
      el('button.icon-btn.danger', { 'aria-label': 'Remove exercise', onclick: () => removeEntry(entry) }, '✕'),
    ),
  );
}

function actionsFor(entry, ex, ctx) {
  const last = lastSets(entry.exerciseId);
  const workingKg = () => {
    const s = entry.sets.find((x) => !x.warmup && x.weightKg != null);
    return s ? s.weightKg : (last[0] && last[0].weightKg != null ? last[0].weightKg : null);
  };
  return el('div.wk-actions', {},
    el('button.btn.sm', { disabled: !last.length, onclick: () => {
      last.forEach((ls, k) => {
        const working = entry.sets.filter((s) => !s.warmup);
        let target = working[k];
        if (!target) { target = newSet(); entry.sets.push(target); }
        if (!target.done) { target.reps = ls.reps; target.weightKg = ls.weightKg; }
      });
      save(); ctx.redraw(); ctx.updateMeta(); toast('Filled from last session');
    } }, '↺ Repeat last'),
    el('button.btn.sm', { onclick: () => {
      if (entry.sets.some((s) => s.warmup)) { toast('Warm-up already added'); return; }
      const w = workingKg();
      if (w == null) { toast('Enter a working weight first'); return; }
      const ws = warmupSets(w).map((s) => ({ ...s, rpe: null }));
      if (!ws.length) { toast('No warm-up needed below bar weight'); return; }
      entry.sets.unshift(...ws); save(); ctx.redraw(); ctx.updateMeta();
      toast(`${ws.length} warm-up set${ws.length === 1 ? '' : 's'} added`);
    } }, '🔥 Warm-up'),
    el('button.btn.sm', { onclick: () => openPlateCalc(workingKg(), { onApply: (kg) => {
      const target = entry.sets.find((s) => !s.done && !s.warmup) || entry.sets[entry.sets.length - 1];
      if (target) { target.weightKg = kg; save(); ctx.redraw(); }
    } }) }, '⚖ Plates'),
  );
}

function slideContent(entry, ctx) {
  const ex = getExercise(entry.exerciseId) || { id: entry.exerciseId, name: entry.name, primary: [], secondary: [], equipment: 'other', restSec: null };
  const last = lastSets(entry.exerciseId);
  const currentIdx = entry.sets.findIndex((s) => !s.done);
  const sets = el('div.sets');
  let workingIdx = 0;
  entry.sets.forEach((set, si) => {
    const ghost = set.warmup ? null : last[workingIdx];
    if (!set.warmup) workingIdx++;
    sets.append(setRow(entry, ex, set, si, ghost, si === currentIdx, ctx));
  });
  return el('div.slide-inner', {},
    headerFor(entry, ex, ctx),
    actionsFor(entry, ex, ctx),
    sets,
    el('button.btn.block', { onclick: () => { entry.sets.push(newSet()); save(); ctx.redraw(); ctx.updateMeta(); } }, '+ Add set'),
    el('p.muted.small.center', {}, 'Swipe a set left to delete · hold to duplicate · hold weight for plates · hold title to swap exercise'),
  );
}

/** Superset: rounds of A1, A2 (, A3) with one rest timer per round. */
function supersetContent(entries, ctx) {
  const rounds = Math.max(...entries.map((e) => e.sets.length));
  const currentRound = (() => {
    for (let r = 0; r < rounds; r++) if (entries.some((e) => e.sets[r] && !e.sets[r].done)) return r;
    return rounds - 1;
  })();
  const letter = entries[0].group || 'A';
  const inner = el('div.slide-inner');
  inner.append(el('div.row.between', {},
    el('span.badge.fill', {}, `Superset ${letter}`),
    el('span.round-label', {}, `Round ${Math.min(rounds, currentRound + 1)} of ${rounds}`),
  ));
  entries.forEach((entry, k) => {
    const ex = getExercise(entry.exerciseId);
    inner.append(headerFor(entry, ex, ctx, { label: `${letter}${k + 1}`, compact: true }));
  });
  const lasts = entries.map((e) => lastSets(e.exerciseId));
  for (let r = 0; r < rounds; r++) {
    const round = el('div.round', { class: r === currentRound ? 'current' : '' }, el('div.round-title', {}, `Round ${r + 1}`));
    entries.forEach((entry, k) => {
      const set = entry.sets[r];
      if (!set) return;
      const ex = getExercise(entry.exerciseId);
      round.append(setRow(entry, ex, set, r, lasts[k][r], r === currentRound && !set.done, ctx, { label: `${letter}${k + 1}` }));
    });
    inner.append(round);
  }
  inner.append(
    el('button.btn.block', { onclick: () => { entries.forEach((e) => e.sets.push(newSet())); save(); ctx.redraw(); ctx.updateMeta(); } }, '+ Add round'),
    el('p.muted.small.center', {}, 'One rest timer per round, after the last exercise in the round.'),
  );
  return inner;
}

/* ---------- Set row ---------- */

function setRow(entry, ex, set, si, ghost, isCurrent, ctx, { label = null } = {}) {
  const stepKg = weightStepKg();
  const repsIn = el('input', {
    type: 'text', inputmode: 'numeric', pattern: '[0-9]*', 'aria-label': 'Reps',
    value: set.reps ?? '', placeholder: ghost ? String(ghost.reps) : (entry.targetReps ? String(entry.targetReps) : '—'),
    oninput: (e) => { const n = parseInt(e.target.value, 10); set.reps = n > 0 ? n : null; save(); },
  });
  const wIn = el('input', {
    type: 'text', inputmode: 'decimal', 'aria-label': 'Weight',
    value: set.weightKg != null ? kgToDisplay(set.weightKg) : '',
    placeholder: ghost ? (ghost.weightKg != null ? fmtWeight(ghost.weightKg, false) : 'BW') : (ex.equipment === 'bodyweight' ? 'BW' : '—'),
    oninput: (e) => { set.weightKg = displayToKg(e.target.value.replace(',', '.')); save(); fitTile(e.target); },
  });
  fitTile(wIn);
  const check = el('button.check', { 'aria-label': 'Complete set', onclick: toggle }, '✓');
  const rpePill = el('button.rpe-pill', { 'aria-label': `${effortLabel()} for this set`, onclick: () => askRpe(false) });
  const drawRpe = () => {
    clear(rpePill);
    rpePill.classList.toggle('set', set.rpe != null);
    rpePill.classList.toggle('ghost', set.rpe == null && ghost && ghost.rpe != null);
    rpePill.textContent = set.rpe != null ? String(effortDisplayValue(set.rpe)) : (ghost && ghost.rpe != null ? `~${effortDisplayValue(ghost.rpe)}` : effortLabel());
  };
  drawRpe();

  function askRpe() {
    openRpePicker({ current: set.rpe, ghost: ghost ? ghost.rpe : null,
      onPick: (v) => { set.rpe = v; save(); drawRpe(); },
      onClear: () => { set.rpe = null; save(); drawRpe(); } });
  }

  const bumpReps = (d) => {
    const base = set.reps ?? (ghost ? ghost.reps : (entry.targetReps || 0));
    set.reps = Math.max(0, base + d) || null;
    repsIn.value = set.reps ?? '';
    save();
  };
  const bumpWeight = (d) => {
    const base = set.weightKg ?? (ghost && ghost.weightKg != null ? ghost.weightKg : 0);
    const next = Math.max(0, Math.round((base + d * stepKg) / stepKg) * stepKg);
    set.weightKg = next > 0 ? next : null;
    wIn.value = set.weightKg != null ? kgToDisplay(set.weightKg) : '';
    fitTile(wIn);
    save();
  };

  const stepGroup = (input, lbl, bump, what) => el('div.step', {},
    el('button.step-btn', { onclick: () => bump(-1), 'aria-label': `Less ${what}` }, '−'),
    el('div.tile', {}, input, el('span.tile-label', {}, lbl)),
    el('button.step-btn', { onclick: () => bump(1), 'aria-label': `More ${what}` }, '+'),
  );
  const numText = label || (set.warmup ? 'W' : String(si + 1 - entry.sets.slice(0, si).filter((s) => s.warmup).length));
  const inner = el('div.set-inner', {},
    el('div.set-num', { class: label ? 'ss' : '' }, numText),
    stepGroup(wIn, unitLabel(), bumpWeight, 'weight'),
    stepGroup(repsIn, 'reps', bumpReps, 'reps'),
    el('div.check-col', {}, check, rpePill),
  );
  const row = el('div.set-row', { class: [set.done && 'done', set.warmup && 'warmup', isCurrent && 'current'].filter(Boolean).join(' ') },
    el('div.set-del', {}, 'Delete'), inner, set.pr && el('span.pr-star', {}, '★'),
  );

  let sx = 0, sy = 0, dx = 0, active = false, decided = false;
  inner.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; active = false; decided = false; }, { passive: true });
  inner.addEventListener('touchmove', (e) => {
    dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (!decided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) { decided = true; active = Math.abs(dx) > Math.abs(dy) && dx < 0; }
    if (!active) return;
    row.classList.add('dragging');
    inner.style.transform = `translateX(${Math.max(-110, Math.min(0, dx))}px)`;
  }, { passive: true });
  const endSwipe = () => {
    if (!active) return;
    row.classList.remove('dragging');
    if (dx < -80) deleteSet(); else inner.style.transform = '';
  };
  inner.addEventListener('touchend', endSwipe);
  inner.addEventListener('touchcancel', endSwipe);

  function deleteSet() {
    if (entry.sets.length <= 1) { toast('Keep at least one set'); inner.style.transform = ''; return; }
    row.classList.add('removing');
    setTimeout(() => {
      const k = entry.sets.indexOf(set);
      if (k >= 0) entry.sets.splice(k, 1);
      save(); ctx.redraw(); ctx.updateMeta();
    }, reducedMotion() ? 0 : 200);
  }

  longPress(inner, (e) => {
    if (e.target === wIn) {
      openPlateCalc(set.weightKg ?? (ghost ? ghost.weightKg : null), { onApply: (kg) => { set.weightKg = kg; wIn.value = kgToDisplay(kg); save(); } });
      return;
    }
    if (e.target.closest('button, input')) return;
    const k = entry.sets.indexOf(set);
    entry.sets.splice(k + 1, 0, { reps: set.reps, weightKg: set.weightKg, done: false, rpe: null, ...(set.warmup ? { warmup: true } : {}) });
    save(); ctx.redraw(); ctx.updateMeta(); toast('Set duplicated');
  });

  /** In a superset the timer waits for the last exercise of the round. */
  function roundComplete() {
    if (!entry.group) return true;
    const a = db.active;
    const mates = a.exercises.filter((e) => e.group === entry.group);
    const k = entry.sets.indexOf(set);
    return mates.every((e) => !e.sets[k] || e.sets[k].done);
  }

  function toggle() {
    if (!set.done) {
      if (set.reps == null && ghost && ghost.reps) { set.reps = ghost.reps; repsIn.value = ghost.reps; }
      if (set.reps == null && !ghost && entry.targetReps) { set.reps = entry.targetReps; repsIn.value = entry.targetReps; }
      if (set.weightKg == null && ghost && ghost.weightKg != null) { set.weightKg = ghost.weightKg; wIn.value = kgToDisplay(ghost.weightKg); }
      if (!set.reps) { toast('Enter reps first'); repsIn.focus(); return; }
      set.done = true;
      row.classList.add('done');
      check.classList.remove('pop'); void check.offsetWidth; check.classList.add('pop');
      if (document.activeElement) document.activeElement.blur();

      if (!set.warmup && set.weightKg != null && set.weightKg > 0) {
        const mine = est1RM(set.weightKg, set.reps);
        const earlier = entry.sets.filter((s) => s !== set && s.done && !s.warmup && s.weightKg != null).map((s) => est1RM(s.weightKg, s.reps));
        const best = Math.max(bestEst1RM(entry.exerciseId), ...earlier, 0);
        if (best > 0 && mine > best + 0.01) {
          set.pr = true;
          row.append(el('span.pr-star', {}, '★'));
          const r = check.getBoundingClientRect(), a = $('#app').getBoundingClientRect();
          burst(r.left - a.left + r.width / 2, r.top - a.top + r.height / 2);
          toast(`New PR · est. 1RM ${fmtWeight(mine)} 🎉`, { duration: 3000 });
        }
      }

      const rows = row.parentElement.querySelectorAll('.set-row');
      rows.forEach((r) => r.classList.remove('current'));
      const k = entry.sets.indexOf(set);
      const nextIdx = entry.sets.findIndex((s, j) => j > k && !s.done);
      const target = nextIdx >= 0 ? nextIdx : entry.sets.findIndex((s) => !s.done);
      if (!entry.group && target >= 0 && rows[target]) { rows[target].classList.add('current'); rows[target].scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); }

      if (roundComplete()) timer.start(entry.group ? (db.settings.defaultRestSec || SUPERSET_REST_DEFAULT) : restFor(ex), { exerciseId: entry.exerciseId, exerciseName: entry.group ? `Superset ${entry.group}` : entry.name });
      save();
      ctx.updateMeta();
      if (db.settings.askRpe && set.rpe == null && !set.warmup) askRpe();
      afterSetComplete(entry);
      if (entry.group) ctx.redraw();
    } else {
      set.done = false;
      set.pr = false;
      row.classList.remove('done');
      row.querySelector('.pr-star') && row.querySelector('.pr-star').remove();
      save();
      ctx.updateMeta();
      if (entry.group) ctx.redraw();
    }
    const dot = $('.dots .dot.active');
    if (dot) dot.classList.toggle('done', entry.sets.every((s) => s.done));
  }

  return row;
}
