/* ==========================================================================
   views/library.js — exercise library: searchable list (also used as a
   picker), exercise detail with muscle map + history, and the add/edit form.
   ========================================================================== */

import { db } from '../db.js';
import { MUSCLES, EQUIPMENT } from '../data.js';
import { el, clear, pushPanel, popPanel, toast, fmtDate, fmtWeight, est1RM, emptyState, kgToDisplay, displayToKg, unitLabel } from '../ui.js';
import { confirmSheet } from '../sheet.js';
import { allExercises, getExercise, createExercise, updateExercise, deleteExercise, muscleNames, restFor, exerciseSessions, bestSet, topSetSeries } from '../exercises.js';
import { createMuscleMap, highlight } from '../muscles.js';
import { lineChart, sparkline } from './history.js';
import { equipFor, availability, activeGym, equipmentNames } from '../engine.js';
import { equipmentIconEl } from '../icons.js';
import { PATTERNS } from '../data.js';
import { openExerciseSheet, demoArea } from './exercise-sheet.js';
import { getProgression, suggest, fmtTarget } from '../progression.js';
import { fmtEffort } from '../ui.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function openLibrary({ pick = null, title = 'Exercises' } = {}) {
  let query = '';
  let equipment = '';
  let muscle = '';

  pushPanel({
    title,
    action: { label: '+ New', onclick: () => openExerciseForm(null, pick) },
    render(body) {
      const search = el('input.input', {
        type: 'search', placeholder: 'Search exercises', value: query, autocomplete: 'off',
        oninput: (e) => { query = e.target.value; renderList(); },
      });
      const muscleSel = el('select.input', { onchange: (e) => { muscle = e.target.value; renderList(); } },
        el('option', { value: '' }, 'Any muscle'),
        MUSCLES.map((m) => el('option', { value: m.id, selected: muscle === m.id }, m.name)),
      );
      const chips = el('div.chips.scroll', {},
        ['', ...EQUIPMENT].map((eq) => el('button.chip', {
          class: equipment === eq ? 'active' : '',
          dataset: { eq },
          onclick: () => {
            equipment = eq;
            chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.eq === eq));
            renderList();
          },
        }, eq ? cap(eq) : 'All')),
      );
      const list = el('div.list');
      body.append(el('div.search-wrap.stack', {}, search, muscleSel, chips), list);

      function renderList() {
        clear(list);
        const q = query.trim().toLowerCase();
        const rows = allExercises().filter((ex) =>
          (!q || ex.name.toLowerCase().includes(q)) &&
          (!equipment || ex.equipment === equipment) &&
          (!muscle || ex.primary.includes(muscle) || ex.secondary.includes(muscle)));
        if (!rows.length) {
          list.append(emptyState({ icon: 'list', title: 'No matches', text: 'Try another search, or create a custom exercise.', action: { label: '+ New exercise', onclick: () => openExerciseForm(null, pick) } }));
          return;
        }
        for (const ex of rows) {
          list.append(el('button.list-item', {
            onclick: () => { if (pick) { pick(ex.id); popPanel(); } else openExerciseSheet(ex.id, { onDetails: openExerciseDetail }); },
          },
            el('div.grow', {},
              el('div.title', {}, ex.name, !ex.builtin && el('span.badge.soft', { style: { marginLeft: '8px' } }, 'custom')),
              el('div.sub.ellipsis', {}, `${cap(ex.equipment)} · ${muscleNames(ex.primary)}`),
            ),
            el('span.chev', {}, pick ? '+' : '›'),
          ));
        }
      }
      renderList();
    },
  });
}

/* ---------- Detail ---------- */

export function openExerciseDetail(id) {
  const panel = pushPanel({
    title: 'Exercise',
    render(body, p) {
      const ex = getExercise(id);
      if (!ex) { body.append(el('div.empty', {}, 'Exercise not found.')); return; }
      p.setTitle(ex.name);
      p.setAction('Edit', () => openExerciseForm(ex));

      body.append(
        el('div.card', {}, demoArea(ex, { allowUpload: true })),
        el('div.card', {}, highlight(createMuscleMap(), ex),
          el('div.legend', {}, el('span.l-primary', {}, 'Primary'), el('span.l-secondary', {}, 'Secondary'))),
        el('div.card', {},
          el('div.setting-row', {}, el('span.label', {}, 'Equipment'), el('span.muted', {}, cap(ex.equipment))),
          el('div.setting-row', {}, el('span.label', {}, 'Primary'), el('span.muted.small', { style: { textAlign: 'right' } }, muscleNames(ex.primary) || '—')),
          el('div.setting-row', {}, el('span.label', {}, 'Secondary'), el('span.muted.small', { style: { textAlign: 'right' } }, muscleNames(ex.secondary) || '—')),
          el('div.setting-row', {}, el('span.label', {}, 'Rest'), el('span.muted', {}, `${restFor(ex)}s${ex.restSec ? '' : ' (default)'}`)),
          ex.pattern && el('div.setting-row', {}, el('span.label', {}, 'Pattern'), el('span.muted', {}, `${PATTERNS[ex.pattern] || ex.pattern} · ${ex.kind || 'isolation'}`)),
        ),
        equipmentCard(ex),
        progressionCard(ex),
      );

      const sessions = exerciseSessions(ex.id);
      const hist = el('div.card', {}, el('div.card-title', {}, 'History'));
      if (!sessions.length) {
        hist.append(emptyState({ icon: 'calendar', title: 'No sessions yet', text: 'Log this exercise in a workout to see best sets, PRs and progress here.' }));
      } else {
        const all = sessions.flatMap((s) => s.sets);
        const best = bestSet(all);
        const rm = best && best.weightKg != null ? est1RM(best.weightKg, best.reps) : null;
        const series = topSetSeries(ex.id);
        hist.append(el('div.stats', {},
          el('div.stat', {}, el('div.v', {}, String(sessions.length)), el('div.k', {}, 'Sessions')),
          el('div.stat', {}, el('div.v', {}, best ? `${best.reps}×${fmtWeight(best.weightKg, false) || 'BW'}` : '—'), el('div.k', {}, 'Best set')),
          el('div.stat', {}, el('div.v', {}, rm ? fmtWeight(rm) : '—'), el('div.k', {}, 'Est. 1RM')),
        ));
        if (series.length >= 2) {
          hist.append(el('div.row.between', { style: { marginTop: '12px' } },
            el('span.muted.small', {}, 'Top set trend'),
            el('div', { style: { width: '120px' } }, sparkline(series)),
          ));
          hist.append(el('div', { style: { marginTop: '8px' } }, lineChart(series)));
        }
        const list = el('div.list', { style: { marginTop: '12px' } });
        for (const s of sessions.slice(0, 30)) {
          const bs = bestSet(s.sets);
          const hasPR = s.sets.some((x) => x.pr);
          list.append(el('div.list-item', {},
            el('div.grow', {},
              el('div.title', {}, fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }), hasPR && el('span.badge.pr', { style: { marginLeft: '8px' } }, 'PR')),
              el('div.sub', {}, s.sets.map((x) => `${x.warmup ? 'w' : ''}${x.reps}×${x.weightKg != null ? fmtWeight(x.weightKg, false) : 'BW'}${x.rpe != null ? ` @${x.rpe}` : ''}`).join('  ')),
            ),
            bs && bs.weightKg != null && bs.reps > 0 && el('span.small.muted', {}, `1RM ${fmtWeight(est1RM(bs.weightKg, bs.reps))}`),
          ));
        }
        hist.append(list);
      }
      body.append(hist);

      if (!ex.builtin) {
        body.append(el('button.btn.danger.block', {
          onclick: async () => {
            if (!(await confirmSheet('It will be removed from your splits. Logged history is kept.', { title: `Delete ${ex.name}?`, confirmLabel: 'Delete', danger: true }))) return;
            deleteExercise(ex.id); toast('Exercise deleted'); popPanel();
          },
        }, 'Delete exercise'));
      } else if (db.exercises.some((e) => e.id === ex.id)) {
        body.append(el('button.btn.block', {
          onclick: () => { deleteExercise(ex.id); toast('Reset to default'); panel.refresh(); },
        }, 'Reset to built-in defaults'));
      }
    },
  });
}

function progressionCard(ex) {
  const cfg = getProgression(ex);
  const t = suggest(ex.id);
  return el('div.card', {},
    el('div.card-title', {}, 'Progression'),
    el('div.setting-row', {}, el('span.label', {}, 'Scheme'), el('span.muted', {}, cfg.scheme === 'linear' ? 'Linear' : 'Double')),
    el('div.setting-row', {}, el('span.label', {}, 'Reps'), el('span.muted', {}, `${cfg.repRange[0]}–${cfg.repRange[1]}`)),
    el('div.setting-row', {}, el('span.label', {}, 'Increment'), el('span.muted', {}, cfg.incrementKg ? fmtWeight(cfg.incrementKg) : 'none (bodyweight)')),
    el('div.setting-row', {}, el('span.label', {}, 'RPE cap'), el('span.muted', {}, String(cfg.rpeCap))),
    t ? el('p.target-line', { style: { marginTop: '8px' } }, `Next: ${fmtTarget(t)}`) : el('p.muted.small', { style: { marginTop: '8px' } }, 'Log a session to get a target.'),
    t && el('p.muted.small', {}, t.reason),
  );
}

function equipmentCard(ex) {
  const gym = activeGym();
  const av = availability(ex, gym);
  const card = el('div.card', {}, el('div.card-title', {}, 'Equipment needed'));
  equipFor(ex).forEach((set, i) => {
    card.append(el('div.row', { style: { padding: '6px 0' } },
      el('span.eq-icons', {}, set.map((id) => equipmentIconEl(id, 22))),
      el('span.grow', {}, (i ? 'or ' : '') + equipmentNames(set)),
    ));
  });
  card.append(el('p.small', { style: { marginTop: '6px', fontWeight: 800, color: av.ok ? 'var(--green)' : 'var(--red)' } },
    av.ok ? `Available at ${gym.name}` : `Not available at ${gym.name} · missing ${equipmentNames(av.missing).toLowerCase()}`));
  return card;
}

/* ---------- Add / edit form ---------- */

export function openExerciseForm(existing, afterCreate = null) {
  const draft = existing
    ? { name: existing.name, equipment: existing.equipment, primary: [...existing.primary], secondary: [...existing.secondary], restSec: existing.restSec, progression: { ...getProgression(existing) } }
    : { name: '', equipment: 'barbell', primary: [], secondary: [], restSec: null, progression: { scheme: 'double', incrementKg: 2.5, repRange: [10, 15], rpeCap: 8 } };

  pushPanel({
    title: existing ? 'Edit exercise' : 'New exercise',
    action: { label: 'Save', onclick: save },
    render(body) {
      const nameIn = el('input.input', { type: 'text', value: draft.name, placeholder: 'e.g. Cable Row (wide)', autocapitalize: 'words',
        oninput: (e) => (draft.name = e.target.value) });
      const eqSel = el('select.input', { onchange: (e) => (draft.equipment = e.target.value) },
        EQUIPMENT.map((eq) => el('option', { value: eq, selected: draft.equipment === eq }, cap(eq))));
      const restIn = el('input.input', { type: 'text', inputmode: 'numeric', value: draft.restSec || '', placeholder: `Default (${db.settings.defaultRestSec}s)`,
        oninput: (e) => { const n = parseInt(e.target.value, 10); draft.restSec = n > 0 ? n : null; } });

      const grid = el('div.pick-grid');
      const renderGrid = () => {
        clear(grid);
        for (const m of MUSCLES) {
          const role = draft.primary.includes(m.id) ? 'p' : draft.secondary.includes(m.id) ? 's' : '';
          grid.append(el('button.muscle-chip', { class: role, onclick: () => cycle(m.id) },
            m.name, role && el('span.small', { style: { float: 'right' } }, role === 'p' ? 'primary' : 'secondary')));
        }
      };
      const cycle = (id) => {
        if (draft.primary.includes(id)) { draft.primary = draft.primary.filter((x) => x !== id); draft.secondary.push(id); }
        else if (draft.secondary.includes(id)) draft.secondary = draft.secondary.filter((x) => x !== id);
        else draft.primary.push(id);
        renderGrid();
      };
      renderGrid();

      body.append(
        el('div.card.stack', {},
          el('div.field', {}, el('label', {}, 'Name'), nameIn),
          el('div.field', {}, el('label', {}, 'Equipment'), eqSel),
          el('div.field', {}, el('label', {}, 'Rest time (seconds)'), restIn),
        ),
        el('div.card', {}, el('div.card-title', {}, 'Muscles · tap to cycle: primary → secondary → off'), grid),
        el('div.card.stack', {},
          el('div.card-title', {}, 'Progression'),
          el('div.field', {}, el('label', {}, 'Scheme'),
            el('div.seg', {}, [['linear', 'Linear'], ['double', 'Double']].map(([v, l]) => el('button', { class: draft.progression.scheme === v ? 'active' : '', onclick: (e) => { draft.progression.scheme = v; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.textContent === l)); } }, l)))),
          el('div.field', {}, el('label', {}, `Increment (${unitLabel()})`), el('input.input', { type: 'text', inputmode: 'decimal', value: kgToDisplay(draft.progression.incrementKg), oninput: (e) => { const v = displayToKg(e.target.value.replace(',', '.')); draft.progression.incrementKg = v != null && v >= 0 ? v : 0; } })),
          el('div.row', {},
            el('div.field.grow', {}, el('label', {}, 'Reps min'), el('input.input', { type: 'text', inputmode: 'numeric', value: draft.progression.repRange[0], oninput: (e) => { const n = parseInt(e.target.value, 10); if (n > 0) draft.progression.repRange[0] = n; } })),
            el('div.field.grow', {}, el('label', {}, 'Reps max'), el('input.input', { type: 'text', inputmode: 'numeric', value: draft.progression.repRange[1], oninput: (e) => { const n = parseInt(e.target.value, 10); if (n > 0) draft.progression.repRange[1] = n; } })),
            el('div.field.grow', {}, el('label', {}, 'RPE cap'), el('input.input', { type: 'text', inputmode: 'decimal', value: draft.progression.rpeCap, oninput: (e) => { const n = parseFloat(e.target.value); if (n >= 5 && n <= 10) draft.progression.rpeCap = n; } })),
          ),
        ),
      );
      setTimeout(() => { if (!existing) nameIn.focus(); }, 50);
    },
  });

  function save() {
    if (draft.progression) { const [a, b] = draft.progression.repRange; draft.progression.repRange = [Math.min(a, b), Math.max(a, b)]; }
    if (!draft.name.trim()) { toast('Enter a name'); return; }
    if (!draft.primary.length) { toast('Pick at least one primary muscle'); return; }
    if (existing) {
      updateExercise(existing.id, { ...draft, name: draft.name.trim() });
      toast('Saved');
      popPanel();
    } else {
      const ex = createExercise(draft);
      toast('Exercise added');
      popPanel();
      if (afterCreate) { afterCreate(ex.id); popPanel(); }
    }
  }
}
