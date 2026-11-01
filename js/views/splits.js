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
import { openBuilder } from './builder.js';
import { openExerciseSheet } from './exercise-sheet.js';

export function getSplit(id) { return db.splits.find((s) => s.id === id) || null; }
export function activeSplit() { return getSplit(db.settings.activeSplitId); }

export function addSplitCopy(src, name = src.name) {
  const split = {
    id: uid('s_'), name,
    days: src.days.map((d) => ({ id: uid('d_'), name: d.name, targets: d.targets ? [...d.targets] : [], exerciseIds: [...d.exerciseIds], groups: d.groups ? d.groups.map((g) => [...g]) : [] })),
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
    el('button.btn.primary.block', { id: 'build-day', onclick: openBuilder }, 'Build a day for my gym'),
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
  let selected = [];
  pushPanel({
    title: 'Day',
    render(body, p) {
      const split = getSplit(splitId);
      const day = split && split.days.find((d) => d.id === dayId);
      if (!day) { body.append(el('div.empty', {}, 'Day not found.')); return; }
      if (!Array.isArray(day.groups)) day.groups = [];
      // Drop groups whose members are no longer consecutive.
      day.groups = day.groups.filter((g) => { const i = day.exerciseIds.indexOf(g[0]); return i >= 0 && g.every((id, k) => day.exerciseIds[i + k] === id); });
      p.setTitle(`${split.name} · ${day.name}`);
      p.setAction('Rename', async () => {
        const name = await promptSheet('', day.name, { title: 'Rename day' });
        if (name) { day.name = name; db.save('splits'); p.refresh(); }
      });

      const exs = day.exerciseIds.map(getExercise);
      const map = highlight(createMuscleMap(), combineMuscles(exs));
      const addEx = () => openLibrary({ title: 'Add exercise', pick: (id) => { day.exerciseIds.push(id); db.save('splits'); } });
      const groupOf = (id) => day.groups.find((g) => g.includes(id));
      const inGroup = (id) => !!groupOf(id);
      const save = () => db.save('splits');
      const consecutive = () => {
        const idxs = selected.map((id) => day.exerciseIds.indexOf(id)).sort((a, b) => a - b);
        return idxs.length >= 2 && idxs.length <= 3 && idxs.every((v, k) => k === 0 || v === idxs[k - 1] + 1) && !selected.some(inGroup);
      };

      const row = (id, i, inside) => {
        const ex = exs[i];
        const sel = selected.includes(id);
        return el('div.list-item', { class: inside ? 'ss-row' : '' },
          !inside && el('button.sel', { class: sel ? 'on' : '', 'aria-label': sel ? 'Deselect' : 'Select', onclick: () => { selected = sel ? selected.filter((x) => x !== id) : [...selected, id]; p.refresh(); } }, sel ? '✓' : ''),
          inside && el('span.ss-label', {}, inside),
          el('button.grow', { style: { textAlign: 'left', minHeight: '44px' }, onclick: () => ex && openExerciseSheet(ex.id, { onDetails: openExerciseDetail }) },
            el('div.title', {}, ex ? ex.name : 'Unknown exercise'),
            el('div.sub.ellipsis', {}, ex ? muscleNames(ex.primary) : id),
          ),
          !inside && el('button.icon-btn', { onclick: () => { move(day.exerciseIds, i, -1); save(); p.refresh(); }, disabled: i === 0, 'aria-label': 'Move up' }, '↑'),
          !inside && el('button.icon-btn', { onclick: () => { move(day.exerciseIds, i, 1); save(); p.refresh(); }, disabled: i === day.exerciseIds.length - 1, 'aria-label': 'Move down' }, '↓'),
          el('button.icon-btn.danger', { onclick: () => { day.exerciseIds.splice(i, 1); day.groups = day.groups.map((g) => g.filter((x) => x !== id)).filter((g) => g.length >= 2); save(); p.refresh(); }, 'aria-label': 'Remove' }, '✕'),
        );
      };

      const list = el('div.stack', { style: { gap: '8px' } });
      if (!day.exerciseIds.length) list.append(el('div.list', {}, emptyState({ icon: 'dumbbell', title: 'No exercises', text: 'Add exercises from the library to build this day.', action: { label: '+ Add exercise', onclick: addEx } })));
      let i = 0;
      let letter = 0;
      while (i < day.exerciseIds.length) {
        const id = day.exerciseIds[i];
        const g = groupOf(id);
        if (g && g[0] === id) {
          const L = String.fromCharCode(65 + letter++);
          const tile = el('div.ss-tile', {},
            el('div.ss-bracket'),
            el('div.grow', {},
              el('div.row.between.ss-head', {}, el('span.badge.fill', {}, `Superset ${L}`),
                el('button.btn.sm', { onclick: () => { day.groups = day.groups.filter((x) => x !== g); save(); p.refresh(); } }, 'Ungroup')),
              el('div.list', {}, g.map((gid, k) => row(gid, day.exerciseIds.indexOf(gid), `${L}${k + 1}`))),
            ),
          );
          list.append(tile);
          i += g.length;
        } else {
          list.append(el('div.list', {}, row(id, i, null)));
          i += 1;
        }
      }

      body.append(
        el('div.card', {}, map, el('div.legend', {}, el('span.l-primary', {}, 'Primary'), el('span.l-secondary', {}, 'Secondary'))),
        el('div.row.between', {},
          el('div.card-title', { style: { margin: 0 } }, 'Exercises'),
          selected.length ? el('button.btn.sm', { id: 'group-superset', disabled: !consecutive(), onclick: () => {
            const ordered = [...selected].sort((a, b) => day.exerciseIds.indexOf(a) - day.exerciseIds.indexOf(b));
            day.groups.push(ordered); selected = []; save(); toast('Grouped as superset'); p.refresh();
          } }, consecutive() ? 'Group as superset' : 'Select 2–3 in a row') : el('span.muted.small', {}, 'Tick 2–3 in a row to superset'),
        ),
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
