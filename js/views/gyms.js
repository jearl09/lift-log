/* ==========================================================================
   views/gyms.js — gym profiles: list, editor with 3-column equipment picker,
   select all / clear, and the coverage check (muscle map + cheapest fix).
   ========================================================================== */

import { db } from '../db.js';
import { EQUIPMENT_TYPES, ALL_EQUIPMENT_IDS, MUSCLE_NAME } from '../data.js';
import { el, append, clear, pushPanel, popPanel, toast } from '../ui.js';
import { confirmSheet, promptSheet } from '../sheet.js';
import { gyms, activeGym, setActiveGym, createGym, deleteGym, coverage, equipmentNames } from '../engine.js';
import { equipmentIconEl } from '../icons.js';
import { createMuscleMap, markUntrainable } from '../muscles.js';

export function gymItemCount(gym) {
  return gym.equipment.filter((id) => id !== 'bodyweight').length;
}

/* ---------- List ---------- */

export function openGyms() {
  pushPanel({
    title: 'My gyms',
    action: { label: '+ New', onclick: newGym },
    render(body, p) {
      const list = el('div.list');
      for (const g of gyms()) {
        const active = g.id === activeGym().id;
        list.append(el('button.list-item', { onclick: () => openGymEditor(g.id) },
          el('div.grow', {},
            el('div.title', {}, g.name, active && el('span.badge.fill', { style: { marginLeft: '8px' } }, 'Active')),
            el('div.sub', {}, `${gymItemCount(g)} item${gymItemCount(g) === 1 ? '' : 's'} · ${coverage(g).untrainable.length ? `${coverage(g).untrainable.length} muscle group${coverage(g).untrainable.length === 1 ? '' : 's'} not covered` : 'covers every muscle group'}`),
          ),
          el('span.chev', {}, '›'),
        ));
      }
      body.append(
        el('p.muted.small', {}, 'A gym is a set of equipment. Split days and generated workouts are resolved against the active gym.'),
        list,
      );
    },
  });
}

async function newGym() {
  const name = await promptSheet('Where do you train?', '', { title: 'New gym', placeholder: 'e.g. Home, Hotel, Main gym' });
  if (!name) return;
  const g = createGym(name, []);
  openGymEditor(g.id);
}

/* ---------- Editor ---------- */

export function openGymEditor(gymId) {
  pushPanel({
    title: 'Gym',
    render(body, p) {
      const gym = gyms().find((g) => g.id === gymId);
      if (!gym) { body.append(el('div.empty', {}, 'Gym not found.')); return; }
      p.setTitle(gym.name);
      p.setAction('Rename', async () => {
        const name = await promptSheet('', gym.name, { title: 'Rename gym' });
        if (name) { gym.name = name; db.save('gyms'); p.refresh(); }
      });
      const active = gym.id === activeGym().id;
      const cov = el('div');
      const redrawCoverage = () => { clear(cov); cov.append(coverageCard(gym)); };

      append(body, [
        active
          ? el('div.center', {}, el('span.badge.fill', {}, 'Active gym'))
          : el('button.btn.primary.block', { onclick: () => { setActiveGym(gym.id); toast(`${gym.name} is now active`); p.refresh(); } }, 'Use this gym'),
        el('div.card-title', {}, 'Equipment'),
        equipmentPicker(gym, redrawCoverage),
        cov,
        gyms().length > 1 && el('button.btn.danger.block', { onclick: async () => {
          if (!(await confirmSheet('Workouts logged here are kept.', { title: `Delete ${gym.name}?`, confirmLabel: 'Delete', danger: true }))) return;
          deleteGym(gym.id); toast('Gym deleted'); popPanel();
        } }, 'Delete gym'),
      ]);
      redrawCoverage();
    },
  });
}

/** 3-column grid of toggle tiles + select all / clear. Calls onChange after each change. */
export function equipmentPicker(gym, onChange) {
  const grid = el('div.eq-grid');
  const has = (id) => id === 'bodyweight' || gym.equipment.includes(id);
  const toggle = (id) => {
    if (id === 'bodyweight') return;
    gym.equipment = has(id) ? gym.equipment.filter((x) => x !== id) : [...gym.equipment, id];
    if (!gym.equipment.includes('bodyweight')) gym.equipment.unshift('bodyweight');
    db.save('gyms');
    draw(); onChange && onChange();
  };
  const draw = () => {
    clear(grid);
    for (const eq of EQUIPMENT_TYPES) {
      const on = has(eq.id);
      grid.append(el('button.eq-tile', {
        class: [on && 'on', eq.always && 'locked'].filter(Boolean).join(' '),
        'aria-pressed': on ? 'true' : 'false', 'aria-label': eq.name, dataset: { eq: eq.id },
        onclick: () => toggle(eq.id),
      }, equipmentIconEl(eq.id, 32), el('span', {}, eq.name), eq.always && el('span.small', { style: { opacity: 0.7 } }, 'always on')));
    }
  };
  draw();
  return el('div.stack', {},
    el('div.row', {},
      el('button.btn.sm', { onclick: () => { gym.equipment = [...ALL_EQUIPMENT_IDS]; db.save('gyms'); draw(); onChange && onChange(); } }, 'Select all'),
      el('button.btn.sm', { onclick: () => { gym.equipment = ['bodyweight']; db.save('gyms'); draw(); onChange && onChange(); } }, 'Clear'),
      el('span.muted.small.grow', { style: { textAlign: 'right' } }, 'Tap to toggle'),
    ),
    grid,
  );
}

/** Coverage footer: muscle map with untrainable groups hatched, missing list, cheapest fix. */
export function coverageCard(gym) {
  const c = coverage(gym);
  const map = markUntrainable(createMuscleMap(), c.untrainable);
  const card = el('div.card', {}, el('div.card-title', {}, 'Coverage'), map,
    el('div.legend', {}, el('span.l-ok', {}, 'Trainable'), el('span.l-no', {}, 'Not trainable here')));
  if (!c.untrainable.length) {
    card.append(el('p.small.center', { style: { marginTop: '8px' } }, 'This selection can train every muscle group.'));
  } else {
    card.append(el('p.muted.small', { style: { marginTop: '8px' } }, `Missing: ${c.untrainable.map((m) => MUSCLE_NAME[m]).join(', ')}.`));
    if (c.fix) card.append(el('p.small', { style: { marginTop: '4px', fontWeight: 800 } }, `Add ${equipmentNames([c.fix.equipId]).toLowerCase()} to cover ${c.fix.muscles.map((m) => MUSCLE_NAME[m].toLowerCase()).join(', ')}.`));
  }
  return card;
}

/** Small pill for the Today tab: "Main gym · 11 items", opens the editor. */
export function gymPill() {
  const g = activeGym();
  return el('button.chip', { class: 'gym-pill', onclick: () => openGymEditor(g.id) }, `${g.name} · ${gymItemCount(g)} item${gymItemCount(g) === 1 ? '' : 's'}`);
}
