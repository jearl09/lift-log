/* ==========================================================================
   views/exercise-sheet.js — the exercise detail bottom sheet, opened from
   any exercise name in the app, plus the reusable demo tile / demo area
   (photos crossfade ↔ animated figure).
   ========================================================================== */

import { db } from '../db.js';
import { el, append, clear, toast, fmtWeight, fmtDate, reducedMotion } from '../ui.js';
import { openSheet, closeSheet } from '../sheet.js';
import { getExercise, lastSets, exerciseSessions, muscleNames, restFor } from '../exercises.js';
import { createMuscleMap, highlight } from '../muscles.js';
import { equipFor, availability, activeGym, equipmentNames } from '../engine.js';
import { equipmentIconEl } from '../icons.js';
import { mountFigure, figureKeyFor, FIGURE_LABELS } from '../figures.js';
import { coachingFor } from '../coaching.js';
import { getPhotoURLs, addPhoto, removePhoto, MAX_PHOTOS } from '../photos.js';

let EXERCISE_DB = {};
// The generated module is optional: the app runs without photos if the import script was never run.
import('../generated/exercise-db.js').then((m) => { EXERCISE_DB = m.EXERCISE_DB || {}; }).catch(() => {});

export function datasetEntry(id) { return EXERCISE_DB[id] || null; }

/** Dataset photo paths for an exercise ([] if none). */
export function datasetPhotos(id) {
  const d = datasetEntry(id);
  return d && d.images ? d.images : [];
}

const CROSSFADE_MS = 1200;

/**
 * Crossfading photo strip. `urls` may be empty; returns { node, pause(), play(), destroy() }.
 */
function photoStrip(urls, { size } = {}) {
  const node = el('div.photo-strip');
  const imgs = urls.slice(0, 2).map((u, i) => el('img', { src: u, alt: '', loading: 'lazy', decoding: 'async', class: i === 0 ? 'show' : '' }));
  append(node, imgs);
  let i = 0, timer = null;
  const tick = () => { i = (i + 1) % imgs.length; imgs.forEach((im, k) => im.classList.toggle('show', k === i)); };
  const api = {
    node,
    playing: false,
    play() { if (imgs.length < 2 || reducedMotion()) return; api.pause(); timer = setInterval(tick, CROSSFADE_MS); api.playing = true; },
    pause() { if (timer) clearInterval(timer); timer = null; api.playing = false; },
    destroy() { api.pause(); },
  };
  if (size) node.style.width = node.style.height = `${size}px`;
  return api;
}

/**
 * Compact demo tile (photos crossfading, or the figure). Photos load lazily.
 * Returns the element; call element._demo.destroy() when removing if you care.
 */
export function demoTile(ex, { size = 96, onclick } = {}) {
  const tile = el('button.demo-tile', { 'aria-label': `About ${ex.name}`, onclick, style: { width: `${size}px`, height: `${size}px` } });
  const photos = datasetPhotos(ex.id);
  if (photos.length) {
    const strip = photoStrip(photos, { size });
    tile.append(strip.node);
    strip.play();
    tile._demo = strip;
  } else {
    const holder = el('div.demo-figure');
    mountFigure(holder, figureKeyFor(ex));
    tile.append(holder);
    // Custom photos (IndexedDB) replace the figure if present.
    getPhotoURLs(ex.id).then((urls) => {
      if (!urls.length || !tile.isConnected) return;
      clear(tile);
      const strip = photoStrip(urls, { size });
      tile.append(strip.node); strip.play(); tile._demo = strip;
    });
  }
  return tile;
}

/** Full demo area with Photos | Figure segmented control and Pause pill. */
export function demoArea(ex, { allowUpload = false, onPhotosChanged } = {}) {
  const wrap = el('div.demo-area');
  const stage = el('div.demo-stage');
  const seg = el('div.seg.small');
  let mode = 'photos';
  let strip = null;
  let urls = datasetPhotos(ex.id);
  const custom = urls.length === 0;
  const pauseBtn = el('button.chip.pause-pill', { onclick: () => { if (!strip) return; strip.playing ? strip.pause() : strip.play(); pauseBtn.textContent = strip.playing ? 'Pause' : 'Play'; } }, 'Pause');

  const draw = () => {
    clear(stage);
    if (strip) { strip.destroy(); strip = null; }
    if (mode === 'photos' && urls.length) {
      strip = photoStrip(urls);
      stage.append(strip.node);
      strip.play();
      pauseBtn.textContent = strip.playing ? 'Pause' : 'Play';
      pauseBtn.classList.toggle('hidden', urls.length < 2 || reducedMotion());
    } else {
      const holder = el('div.demo-figure.large');
      mountFigure(holder, figureKeyFor(ex));
      stage.append(holder, el('p.muted.small.center', {}, `${FIGURE_LABELS[figureKeyFor(ex)]} · side view`));
      pauseBtn.classList.add('hidden');
    }
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  };
  append(seg, [
    el('button', { dataset: { mode: 'photos' }, onclick: () => { mode = 'photos'; draw(); } }, 'Photos'),
    el('button', { dataset: { mode: 'figure' }, onclick: () => { mode = 'figure'; draw(); } }, 'Figure'),
  ]);
  if (!urls.length) mode = 'figure';

  const uploadRow = el('div.row', { class: allowUpload && custom ? '' : 'hidden' });
  const refreshUpload = () => {
    clear(uploadRow);
    const canAdd = urls.length < MAX_PHOTOS;
    const input = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try { await addPhoto(ex.id, f); urls = await getPhotoURLs(ex.id); mode = 'photos'; draw(); refreshUpload(); onPhotosChanged && onPhotosChanged(); toast('Photo added'); }
      catch (err) { toast(`Could not add photo: ${err.message}`); }
      e.target.value = '';
    } });
    uploadRow.append(
      el('button.btn.sm', { disabled: !canAdd, onclick: () => input.click() }, canAdd ? `+ Add photo (${urls.length}/${MAX_PHOTOS})` : `${MAX_PHOTOS} photos added`),
      urls.length ? el('button.btn.sm.danger', { onclick: async () => { await removePhoto(ex.id, urls.length - 1); urls = await getPhotoURLs(ex.id); if (!urls.length) mode = 'figure'; draw(); refreshUpload(); onPhotosChanged && onPhotosChanged(); } }, 'Remove last') : null,
      input,
    );
  };

  wrap.append(el('div.row.between', {}, seg, pauseBtn), stage, uploadRow);
  draw();
  if (custom) {
    getPhotoURLs(ex.id).then((u) => { urls = u; if (u.length) { mode = 'photos'; draw(); } if (allowUpload) refreshUpload(); });
  }
  wrap._destroy = () => strip && strip.destroy();
  return wrap;
}

/* ---------- The sheet ---------- */

/**
 * Open the exercise sheet. opts.onDetails lets callers offer the full
 * library panel (edit / charts) without creating an import cycle.
 */
export function openExerciseSheet(id, { entry = null, onDetails = null } = {}) {
  const ex = getExercise(id);
  if (!ex) return;
  const coach = coachingFor(ex.id);
  const ds = datasetEntry(ex.id);
  const gym = activeGym();
  const av = availability(ex, gym);
  const last = lastSets(ex.id);
  const lastSession = exerciseSessions(ex.id)[0];
  let demo;

  openSheet({
    title: ex.name,
    text: `${muscleNames(ex.primary)}${ex.secondary.length ? ` · also ${muscleNames(ex.secondary).toLowerCase()}` : ''}`,
    render(body) {
      demo = demoArea(ex, { allowUpload: !datasetPhotos(ex.id).length });
      body.append(demo);
      body.append(el('div.sheet-map', {}, highlight(createMuscleMap(), ex)));
      if (entry && entry.reason) body.append(el('p.why', {}, `Why this exercise? ${entry.reason}`));
      if (coach) {
        body.append(
          el('p.cue', {}, coach.cue),
          section('Setup', [coach.setup]),
          section('Steps', coach.steps, true),
          section('Common mistakes', coach.mistakes),
          el('div.row.between', {}, el('span.muted.small', {}, 'Tempo'), el('span', { style: { fontWeight: 800 } }, coach.tempo === 'hold' ? 'Hold for time' : `${coach.tempo} (down · pause · up)`)),
        );
      }
      if (ds && ds.instructions && ds.instructions.length) {
        const det = el('details.ds-instructions', {}, el('summary', {}, 'Full instructions from the dataset'));
        det.append(el('ol', {}, ds.instructions.map((t) => el('li.small', {}, t))));
        body.append(det);
      }
      const eq = el('div.stack', { style: { gap: '4px' } }, el('span.muted.small', {}, 'Equipment needed'));
      equipFor(ex).forEach((set, i) => eq.append(el('div.row', {}, el('span.eq-icons', {}, set.map((e) => equipmentIconEl(e, 22))), el('span.small', {}, (i ? 'or ' : '') + equipmentNames(set)))));
      eq.append(el('p.small', { style: { fontWeight: 800, color: av.ok ? 'var(--green)' : 'var(--red)' } }, av.ok ? `Available at ${gym.name}` : `Not at ${gym.name} · missing ${equipmentNames(av.missing).toLowerCase()}`));
      body.append(eq);
      body.append(el('div.row.between', {}, el('span.muted.small', {}, 'Rest'), el('span', { style: { fontWeight: 800 } }, `${restFor(ex)}s`)));
      if (last.length) {
        body.append(el('div', {},
          el('span.muted.small', {}, `Last session · ${fmtDate(lastSession.date)}`),
          el('div.last-sets', {}, last.map((s, i) => el('span.chip', {}, `${i + 1}: ${s.reps}×${s.weightKg != null ? fmtWeight(s.weightKg, false) : 'BW'}`))),
        ));
      }
      if (ds) body.append(el('p.muted.small', {}, 'Photos and full instructions: free-exercise-db (CC0).'));
    },
    actions: [
      ...(onDetails ? [{ label: 'Details & history', onclick: () => { closeSheet(); onDetails(ex.id); return false; } }] : []),
      { label: 'Close' },
    ],
    onClose() { demo && demo._destroy && demo._destroy(); },
  });

  function section(title, lines, numbered = false) {
    const wrap = el('div.coach-section', {}, el('span.muted.small', {}, title));
    const list = el(numbered ? 'ol' : 'ul', { class: 'coach-list' });
    for (const l of lines) list.append(el('li', {}, l));
    wrap.append(list);
    return wrap;
  }
}
