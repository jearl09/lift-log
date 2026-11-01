/* ==========================================================================
   views/workout.js — focused workout mode.

   One exercise per slide, horizontal swipe / arrow keys between them. Set
   rows have ± steppers, ghost text from last session, swipe-left to delete,
   long-press to duplicate (long-press the weight opens the plate calculator).
   Long-press an exercise title (or tap ⇄) for "Not available right now"
   substitutes from the active gym. db.active autosaves on every change.
   ========================================================================== */

import { db } from '../db.js';
import { $, el, clear, uid, pushPanel, closeAllPanels, toast, fmtDuration, fmtWeight, kgToDisplay, displayToKg, unitLabel, weightStepKg, est1RM, longPress, emptyState, reducedMotion } from '../ui.js';
import { confirmSheet, openSheet, closeSheet } from '../sheet.js';
import { getExercise, lastSets, restFor, muscleNames, bestEst1RM } from '../exercises.js';
import { activeGym, resolveDay, substitutes, usedEquipment, equipmentNames, setOverride } from '../engine.js';
import { equipmentIconEl } from '../icons.js';
import { timer } from '../timer.js';
import { burst } from '../confetti.js';
import { openPlateCalc, warmupSets } from '../plates.js';
import { openLibrary } from './library.js';

const newSet = () => ({ reps: null, weightKg: null, done: false });
let idx = 0;
let panelRef = null;
let keyHandler = null;
let elapsedInterval = null;

function initialSets(exerciseId, suggested) {
  const n = lastSets(exerciseId).length || suggested || 3;
  return Array.from({ length: n }, newSet);
}

/** Start a session from a split day, resolved against the active gym. */
export function startWorkout(split, day) {
  if (db.active) { openWorkout(); return; }
  const gym = activeGym();
  const resolved = resolveDay(day, gym);
  const skipped = resolved.filter((r) => r.status === 'unavailable');
  startSession({
    splitId: split.id, splitName: split.name, dayId: day.id, dayName: day.name,
    entries: resolved.filter((r) => r.status !== 'unavailable').map((r) => ({ exerciseId: r.exerciseId, swappedFrom: r.originalId || null, reason: r.status === 'swapped' ? r.reason : '' })),
  });
  if (skipped.length) toast(`${skipped.length} exercise${skipped.length === 1 ? '' : 's'} unavailable at ${gym.name} left out`, { duration: 3500 });
}

/** Generic session start. entries: [{ exerciseId, reason?, swappedFrom?, suggestedSets?, targetReps? }] */
export function startSession({ splitId, splitName, dayId, dayName, entries }) {
  if (db.active) { openWorkout(); return; }
  db.active = {
    id: uid('w_'), splitId, splitName, dayId, dayName, gymId: activeGym().id,
    startedAt: Date.now(),
    exercises: entries.map((e) => ({ ex: getExercise(e.exerciseId), e })).filter((x) => x.ex)
      .map(({ ex, e }) => ({ exerciseId: ex.id, name: ex.name, sets: initialSets(ex.id, e.suggestedSets), reason: e.reason || '', swappedFrom: e.swappedFrom || null, targetReps: e.targetReps || null })),
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

async function finishWorkout() {
  const a = db.active;
  if (!a) return;
  const exercises = a.exercises
    .map((e) => ({
      exerciseId: e.exerciseId, name: e.name,
      ...(e.swappedFrom ? { swappedFrom: e.swappedFrom } : {}),
      sets: e.sets.filter((s) => s.done && s.reps > 0)
        .map((s) => ({ reps: s.reps, weightKg: s.weightKg, ...(s.warmup ? { warmup: true } : {}), ...(s.pr ? { pr: true } : {}) })),
    }))
    .filter((e) => e.sets.length);

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
  idx = Math.min(idx, db.active.exercises.length);
  panelRef = pushPanel({
    title: db.active.dayName,
    action: { label: 'Finish', onclick: finishWorkout },
    onClose() {
      clearInterval(elapsedInterval); elapsedInterval = null;
      if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
      panelRef = null;
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

  const track = el('div.track');
  a.exercises.forEach((entry, i) => track.append(slide(entry, i, updateMeta)));
  track.append(addSlide());
  const carousel = el('div.carousel', {}, track);

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

  body.append(el('div.wk', {}, el('div.wk-top', {}, elapsed, count), el('div.wk-progress', {}, progFill), carousel, bottom));

  const slides = () => a.exercises.length + 1;
  function goTo(i) {
    idx = Math.max(0, Math.min(slides() - 1, i));
    track.style.transform = `translateX(-${idx * 100}%)`;
    clear(dots);
    for (let k = 0; k < slides(); k++) {
      const isAdd = k === a.exercises.length;
      const allDone = !isAdd && a.exercises[k].sets.length && a.exercises[k].sets.every((s) => s.done);
      dots.append(el('button.dot', { class: [k === idx && 'active', allDone && 'done'].filter(Boolean).join(' '), 'aria-label': `Go to exercise ${k + 1}`, onclick: () => goTo(k) }));
    }
    prev.disabled = idx === 0;
    next.disabled = idx === slides() - 1;
  }
  goTo(idx);

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
    const resist = (idx === 0 && dx > 0) || (idx === slides() - 1 && dx < 0) ? 0.35 : 1;
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
}

function addExercise() {
  openLibrary({
    title: 'Add exercise',
    pick: (id) => {
      const ex = getExercise(id);
      if (!ex) return;
      db.active.exercises.push({ exerciseId: ex.id, name: ex.name, sets: initialSets(ex.id), reason: '', swappedFrom: null, targetReps: null });
      save();
      idx = db.active.exercises.length - 1;
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

/* ---------- "Not available right now" ---------- */

export function openSwapSheet(entry, i) {
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
          entry.exerciseId = s.id; entry.name = s.name; entry.swappedFrom = original;
          entry.reason = `Swapped during this workout · ${s.why}`;
          if (!anyDone) entry.sets = initialSets(s.id);
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

/* ---------- Exercise slide ---------- */

function slide(entry, i, updateMeta) {
  const node = el('div.slide');
  const draw = () => {
    const st = node.scrollTop;
    clear(node);
    node.append(slideContent(entry, i, { redraw: draw, updateMeta }));
    node.scrollTop = st;
  };
  draw();
  return node;
}

function slideContent(entry, i, ctx) {
  const ex = getExercise(entry.exerciseId) || { name: entry.name, primary: [], secondary: [], equipment: 'other', restSec: null };
  const last = lastSets(entry.exerciseId);
  const lastSummary = last.length
    ? `Last: ${last.map((s) => `${s.reps}×${s.weightKg != null ? fmtWeight(s.weightKg, false) : 'BW'}`).join('  ')}`
    : (entry.targetReps ? `Suggested: ${entry.sets.length} × ${entry.targetReps} reps` : 'No previous session');
  const currentIdx = entry.sets.findIndex((s) => !s.done);

  const sets = el('div.sets');
  let workingIdx = 0;
  entry.sets.forEach((set, si) => {
    const ghost = set.warmup ? null : last[workingIdx];
    if (!set.warmup) workingIdx++;
    sets.append(setRow(entry, ex, set, si, ghost, si === currentIdx, ctx));
  });

  const workingKg = () => {
    const s = entry.sets.find((x) => !x.warmup && x.weightKg != null);
    return s ? s.weightKg : (last[0] && last[0].weightKg != null ? last[0].weightKg : null);
  };

  const head = el('div.wk-ex-head.grow', {},
    el('div.name', {}, entry.name, entry.swappedFrom && el('span.chip.swapped', { style: { marginLeft: '8px', verticalAlign: 'middle' } }, 'Swapped')),
    el('div.meta', {}, `${muscleNames(ex.primary)} · rest ${restFor(ex)}s`),
    entry.reason && el('div.why', {}, `Why this exercise? ${entry.reason}`),
    el('div.last', {}, lastSummary),
  );
  longPress(head, () => openSwapSheet(entry, i));

  return el('div.slide-inner', {},
    el('div.row', { style: { alignItems: 'flex-start' } },
      head,
      el('button.icon-btn.swap-btn', { 'aria-label': 'Not available right now', title: 'Swap exercise', onclick: () => openSwapSheet(entry, i) }, '⇄'),
      el('button.icon-btn.danger', { 'aria-label': 'Remove exercise', onclick: async () => {
        if (entry.sets.some((s) => s.done) && !(await confirmSheet(`Logged sets for ${entry.name} will be lost.`, { title: 'Remove exercise?', confirmLabel: 'Remove', danger: true }))) return;
        db.active.exercises.splice(i, 1); save(); idx = Math.max(0, i - 1); panelRef && panelRef.refresh();
      } }, '✕'),
    ),
    el('div.wk-actions', {},
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
        const ws = warmupSets(w);
        if (!ws.length) { toast('No warm-up needed below bar weight'); return; }
        entry.sets.unshift(...ws); save(); ctx.redraw(); ctx.updateMeta();
        toast(`${ws.length} warm-up set${ws.length === 1 ? '' : 's'} added`);
      } }, '🔥 Warm-up'),
      el('button.btn.sm', { onclick: () => openPlateCalc(workingKg(), { onApply: (kg) => {
        const target = entry.sets.find((s) => !s.done && !s.warmup) || entry.sets[entry.sets.length - 1];
        if (target) { target.weightKg = kg; save(); ctx.redraw(); }
      } }) }, '⚖ Plates'),
    ),
    sets,
    el('button.btn.block', { onclick: () => { entry.sets.push(newSet()); save(); ctx.redraw(); ctx.updateMeta(); } }, '+ Add set'),
    el('p.muted.small.center', {}, 'Swipe a set left to delete · hold to duplicate · hold weight for plates · hold title to swap exercise'),
  );
}

/* ---------- Set row ---------- */

function setRow(entry, ex, set, si, ghost, isCurrent, ctx) {
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
    oninput: (e) => { set.weightKg = displayToKg(e.target.value.replace(',', '.')); save(); },
  });
  const check = el('button.check', { 'aria-label': 'Complete set', onclick: toggle }, '✓');

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
    save();
  };

  const stepGroup = (input, label, bump, what) => el('div.step', {},
    el('button.step-btn', { onclick: () => bump(-1), 'aria-label': `Less ${what}` }, '−'),
    el('div.tile', {}, input, el('span.tile-label', {}, label)),
    el('button.step-btn', { onclick: () => bump(1), 'aria-label': `More ${what}` }, '+'),
  );
  const inner = el('div.set-inner', {},
    el('div.set-num', {}, set.warmup ? 'W' : String(si + 1 - entry.sets.slice(0, si).filter((s) => s.warmup).length)),
    stepGroup(wIn, unitLabel(), bumpWeight, 'weight'),
    stepGroup(repsIn, 'reps', bumpReps, 'reps'),
    check,
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
    entry.sets.splice(k + 1, 0, { reps: set.reps, weightKg: set.weightKg, done: false, ...(set.warmup ? { warmup: true } : {}) });
    save(); ctx.redraw(); ctx.updateMeta(); toast('Set duplicated');
  });

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
      if (target >= 0 && rows[target]) { rows[target].classList.add('current'); rows[target].scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); }

      timer.start(restFor(ex), { exerciseId: entry.exerciseId, exerciseName: entry.name });
    } else {
      set.done = false;
      set.pr = false;
      row.classList.remove('done');
      row.querySelector('.pr-star') && row.querySelector('.pr-star').remove();
    }
    save();
    ctx.updateMeta();
    const dot = $('.dots .dot.active');
    if (dot) dot.classList.toggle('done', entry.sets.every((s) => s.done));
  }

  return row;
}
