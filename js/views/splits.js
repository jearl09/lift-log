/* ==========================================================================
   views/splits.js — Splits tab: my splits, presets, split and day editors.
   ========================================================================== */

import { db } from '../db.js';
import { PRESET_SPLITS } from '../data.js';
import { el, clear, uid, pushPanel, popPanel, toast, emptyState } from '../ui.js';
import { confirmSheet, promptSheet } from '../sheet.js';
import { getExercise, muscleNames } from '../exercises.js';
import { createMuscleMap, highlight, combineMuscles } from '../muscles.js';
import { openLibrary, openExerciseDetail } from './library.js';

export function getSplit(id) { return db.splits.find((s) => s.id === id) || null; }
export function activeSplit() { return getSplit(db.settings.activeSplitId); }

export function addSplitCopy(src, name = src.name) {
  const split = {
    id: uid('s_'), name,
    days: src.days.map((d) => ({ id: uid('d_'), name: d.name, exerciseIds: [...d.exerciseIds] })),
  };
  db.splits.push(split);
  db.save('splits');
  return split;
}

export function setActive(id) {
  db.settings.activeSplitId = id;
  db.save('settings');
}

function move(arr, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

async function newSplit() {
  const name = await promptSheet('Give your split a name.', 'My split', { title: 'New split', placeholder: 'e.g. 4-day upper/lower' });
  if (!name) return;
  const s = { id: uid('s_'), name, days: [] };
  db.splits.push(s); db.save('splits');
  if (!db.settings.activeSplitId) setActive(s.id);
  openSplit(s.id);
}

/* ---------- Tab view ---------- */

export function render(view) {
  clear(view);

  const mine = el('div.list');
  if (!db.splits.length) {
    mine.append(emptyState({ icon: 'list', title: 'No splits yet', text: 'Add a preset below or create your own from scratch.', action: { label: '+ New custom split', onclick: newSplit } }));
  }
  for (const s of db.splits) {
    const active = s.id === db.settings.activeSplitId;
    mine.append(el('button.list-item', { onclick: () => openSplit(s.id) },
      el('div.grow', {},
        el('div.title', {}, s.name, active && el('span.badge.fill', { style: { marginLeft: '8px' } }, 'Active')),
        el('div.sub.ellipsis', {}, s.days.map((d) => d.name).join(' · ') || 'No days'),
      ),
      el('span.chev', {}, '›'),
    ));
  }

  const presets = el('div.list');
  for (const p of PRESET_SPLITS) {
    presets.append(el('div.list-item', {},
      el('div.grow', {}, el('div.title', {}, p.name), el('div.sub.ellipsis', {}, p.days.map((d) => d.name).join(' · '))),
      el('button.btn.sm', { onclick: () => {
        const s = addSplitCopy(p);
        if (!db.settings.activeSplitId) setActive(s.id);
        toast(`Added "${p.name}"`);
        render(view);
      } }, 'Add'),
    ));
  }

  view.append(
    el('div.card-title', {}, 'My splits'),
    mine,
    db.splits.length ? el('button.btn.block', { onclick: newSplit }, '+ New custom split') : null,
    el('div.card-title', { style: { marginTop: '8px' } }, 'Presets'),
    presets,
    el('div.card-title', { style: { marginTop: '8px' } }, 'Library'),
    el('button.btn.block', { onclick: () => openLibrary() }, 'Browse exercise library'),
  );
}

/* ---------- Split editor ---------- */

export function openSplit(splitId) {
  pushPanel({
    title: 'Split',
    render(body, p) {
      const split = getSplit(splitId);
      if (!split) { body.append(el('div.empty', {}, 'Split not found.')); return; }
      p.setTitle(split.name);
      p.setAction('Rename', async () => {
        const name = await promptSheet('', split.name, { title: 'Rename split' });
        if (name) { split.name = name; db.save('splits'); p.refresh(); }
      });
      const active = split.id === db.settings.activeSplitId;

      const days = el('div.list');
      if (!split.days.length) days.append(emptyState({ icon: 'list', title: 'No days yet', text: 'A split is a list of days, each with its own exercises.' }));
      split.days.forEach((d, i) => {
        days.append(el('div.list-item', {},
          el('button.grow', { style: { textAlign: 'left', minHeight: '44px' }, onclick: () => openDay(split.id, d.id) },
            el('div.title', {}, d.name),
            el('div.sub', {}, `${d.exerciseIds.length} exercise${d.exerciseIds.length === 1 ? '' : 's'}`),
          ),
          el('button.icon-btn', { onclick: () => { move(split.days, i, -1); db.save('splits'); p.refresh(); }, disabled: i === 0, 'aria-label': 'Move up' }, '↑'),
          el('button.icon-btn', { onclick: () => { move(split.days, i, 1); db.save('splits'); p.refresh(); }, disabled: i === split.days.length - 1, 'aria-label': 'Move down' }, '↓'),
        ));
      });

      body.append(
        active
          ? el('div.center', {}, el('span.badge.fill', {}, 'Active split'))
          : el('button.btn.primary.block', { onclick: () => { setActive(split.id); toast('Set as active'); p.refresh(); } }, 'Set as active split'),
        el('div.card-title', {}, 'Days'),
        days,
        el('button.btn.block', { onclick: async () => {
          const name = await promptSheet('', `Day ${split.days.length + 1}`, { title: 'New day', placeholder: 'e.g. Push' });
          if (!name) return;
          const d = { id: uid('d_'), name, exerciseIds: [] };
          split.days.push(d); db.save('splits');
          openDay(split.id, d.id);
        } }, '+ Add day'),
        el('div.btn-row', { style: { marginTop: '8px' } },
          el('button.btn', { onclick: () => { const c = addSplitCopy(split, `${split.name} copy`); toast('Duplicated'); popPanel(); openSplit(c.id); } }, 'Duplicate'),
          el('button.btn.danger', { onclick: async () => {
            if (!(await confirmSheet('Logged workouts are kept.', { title: `Delete "${split.name}"?`, confirmLabel: 'Delete', danger: true }))) return;
            db.splits = db.splits.filter((s) => s.id !== split.id); db.save('splits');
            if (db.settings.activeSplitId === split.id) setActive(db.splits[0] ? db.splits[0].id : null);
            toast('Split deleted'); popPanel();
          } }, 'Delete'),
        ),
      );
    },
  });
}

/* ---------- Day editor ---------- */

export function openDay(splitId, dayId) {
  pushPanel({
    title: 'Day',
    render(body, p) {
      const split = getSplit(splitId);
      const day = split && split.days.find((d) => d.id === dayId);
      if (!day) { body.append(el('div.empty', {}, 'Day not found.')); return; }
      p.setTitle(`${split.name} · ${day.name}`);
      p.setAction('Rename', async () => {
        const name = await promptSheet('', day.name, { title: 'Rename day' });
        if (name) { day.name = name; db.save('splits'); p.refresh(); }
      });

      const exs = day.exerciseIds.map(getExercise);
      const map = highlight(createMuscleMap(), combineMuscles(exs));
      const addEx = () => openLibrary({ title: 'Add exercise', pick: (id) => { day.exerciseIds.push(id); db.save('splits'); } });

      const list = el('div.list');
      if (!day.exerciseIds.length) list.append(emptyState({ icon: 'dumbbell', title: 'No exercises', text: 'Add exercises from the library to build this day.', action: { label: '+ Add exercise', onclick: addEx } }));
      day.exerciseIds.forEach((id, i) => {
        const ex = exs[i];
        list.append(el('div.list-item', {},
          el('button.grow', { style: { textAlign: 'left', minHeight: '44px' }, onclick: () => ex && openExerciseDetail(ex.id) },
            el('div.title', {}, ex ? ex.name : 'Unknown exercise'),
            el('div.sub.ellipsis', {}, ex ? muscleNames(ex.primary) : id),
          ),
          el('button.icon-btn', { onclick: () => { move(day.exerciseIds, i, -1); db.save('splits'); p.refresh(); }, disabled: i === 0, 'aria-label': 'Move up' }, '↑'),
          el('button.icon-btn', { onclick: () => { move(day.exerciseIds, i, 1); db.save('splits'); p.refresh(); }, disabled: i === day.exerciseIds.length - 1, 'aria-label': 'Move down' }, '↓'),
          el('button.icon-btn.danger', { onclick: () => { day.exerciseIds.splice(i, 1); db.save('splits'); p.refresh(); }, 'aria-label': 'Remove' }, '✕'),
        ));
      });

      body.append(
        el('div.card', {}, map, el('div.legend', {}, el('span.l-primary', {}, 'Primary'), el('span.l-secondary', {}, 'Secondary'))),
        el('div.card-title', {}, 'Exercises'),
        list,
        day.exerciseIds.length ? el('button.btn.block', { onclick: addEx }, '+ Add exercise') : null,
        el('button.btn.danger.block', { style: { marginTop: '8px' }, onclick: async () => {
          if (!(await confirmSheet('', { title: `Delete day "${day.name}"?`, confirmLabel: 'Delete', danger: true }))) return;
          split.days = split.days.filter((d) => d.id !== day.id); db.save('splits');
          popPanel();
        } }, 'Delete day'),
      );
    },
  });
}
