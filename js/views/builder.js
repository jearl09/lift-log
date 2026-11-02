/* ==========================================================================
   views/builder.js — "Build a day for my gym": pick a target and a length,
   generate a day from the active gym's equipment, swap items, then save it
   as a split day or start it right away.
   ========================================================================== */

import { db } from '../db.js';
import { MUSCLES, MUSCLE_NAME } from '../data.js';
import { el, clear, uid, pushPanel, popPanel, toast, emptyState } from '../ui.js';
import { openSheet, promptSheet, closeSheet } from '../sheet.js';
import { getExercise, muscleNames } from '../exercises.js';
import { activeGym, generateDay, substitutes, usedEquipment, equipmentNames, TARGET_PRESETS, LENGTHS, lengthCount } from '../engine.js';
import { style, describeStyle, SETUP_LABEL } from '../style.js';
import { openStyle } from './style.js';
import { equipmentIconEl } from '../icons.js';
import { startSession } from './workout.js';

export function openBuilder() {
  let targetId = 'push';
  let custom = [];
  let lengthId = 'style';
  let result = null;

  const targets = () => (targetId === 'custom' ? custom : TARGET_PRESETS.find((t) => t.id === targetId).targets);
  const targetName = () => (targetId === 'custom' ? 'Custom day' : TARGET_PRESETS.find((t) => t.id === targetId).name);

  pushPanel({
    title: 'Build a day',
    render(body, p) {
      const gym = activeGym();
      const list = el('div.list');
      const drawResult = () => {
        clear(list);
        if (!result) return;
        if (!result.length) { list.append(emptyState({ icon: 'dumbbell', title: 'Nothing to build with', text: `${gym.name} has no equipment that trains these muscles. Add some in My gyms.` })); return; }
        result.forEach((item, i) => {
          const ex = getExercise(item.exerciseId);
          list.append(el('div.list-item', {},
            el('div.grow', {},
              el('div.title', {}, ex.name),
              el('div.sub', {}, `${item.sets} × ${item.repsLabel} · ${muscleNames(ex.primary)}`),
              style().quickSetup && item.setup != null && el('div.sub', {}, SETUP_LABEL[item.setup]),
              el('div.row', { style: { marginTop: '4px', gap: '6px' } }, el('span.eq-icons', {}, usedEquipment(ex, gym).map((id) => equipmentIconEl(id, 18))), el('span.why', {}, item.reason)),
            ),
            el('button.btn.sm', { onclick: () => swap(i) }, 'Swap'),
          ));
        });
      };
      const swap = (i) => {
        const item = result[i];
        const ex = getExercise(item.exerciseId);
        const alts = substitutes(item.exerciseId, gym, { exclude: result.map((r) => r.exerciseId), n: 3 });
        openSheet({
          title: `Swap ${ex.name}`, text: alts.length ? 'Alternatives for the same muscle, using what this gym has.' : 'No other exercise here hits that muscle.',
          render(sb) {
            const l = el('div.list');
            for (const a of alts) {
              l.append(el('button.list-item', { onclick: () => { result[i] = { ...item, exerciseId: a.id, reason: `Swapped in · ${a.why}` }; drawResult(); closeSheet(); } },
                el('div.grow', {}, el('div.title', {}, a.name), el('div.sub', {}, a.why)),
                el('span.eq-icons', {}, usedEquipment(a, gym).map((id) => equipmentIconEl(id, 20))),
              ));
            }
            sb.append(l);
          },
          actions: [{ label: 'Cancel' }],
        });
      };

      const customChips = el('div.chips', { class: targetId === 'custom' ? '' : 'hidden' },
        MUSCLES.map((m) => el('button.chip', { class: custom.includes(m.id) ? 'active' : '', onclick: (e) => {
          custom = custom.includes(m.id) ? custom.filter((x) => x !== m.id) : [...custom, m.id];
          e.currentTarget.classList.toggle('active');
        } }, m.name)));

      const targetChips = el('div.chips', {},
        [...TARGET_PRESETS, { id: 'custom', name: 'Custom' }].map((t) => el('button.chip', { class: t.id === targetId ? 'active' : '', onclick: () => {
          targetId = t.id;
          targetChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.textContent === t.name));
          customChips.classList.toggle('hidden', targetId !== 'custom');
        } }, t.name)));

      const lengthSeg = el('div.seg', {}, LENGTHS.map((l) => el('button', { class: l.id === lengthId ? 'active' : '', onclick: () => {
        lengthId = l.id; lengthSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.textContent.startsWith(l.name)));
      } }, `${l.name} · ${lengthCount(l.id)}`)));

      const actions = el('div.btn-row', { class: 'hidden' });
      const generate = () => {
        if (!targets().length) { toast('Pick at least one muscle'); return; }
        result = generateDay({ targets: targets(), length: lengthCount(lengthId), gym });
        drawResult();
        actions.classList.remove('hidden');
        genBtn.textContent = 'Regenerate'; genBtn.classList.remove('primary');
        list.scrollIntoView({ block: 'start', behavior: 'smooth' });
      };
      const genBtn = el('button.btn.primary.block', { onclick: generate }, 'Generate');

      actions.append(
        el('button.btn', { onclick: saveAsDay }, 'Save as day'),
        el('button.btn.primary', { onclick: () => {
          if (!result || !result.length) return;
          startSession({ splitId: null, splitName: 'Built for ' + gym.name, dayId: null, dayName: targetName(), entries: result.map((r) => ({ exerciseId: r.exerciseId, reason: r.reason, suggestedSets: r.sets, targetReps: r.targetReps })) });
        } }, 'Start now'),
      );

      async function saveAsDay() {
        if (!result || !result.length) return;
        const pick = await new Promise((resolve) => {
          openSheet({
            title: 'Add to which split?',
            render(sb) {
              const l = el('div.list');
              for (const s of db.splits) l.append(el('button.list-item', { onclick: () => { resolve(s); closeSheet(); } }, el('div.grow', {}, el('div.title', {}, s.name), el('div.sub', {}, `${s.days.length} days`)), el('span.chev', {}, '›')));
              l.append(el('button.list-item', { onclick: () => { resolve('new'); closeSheet(); } }, el('div.grow', {}, el('div.title', {}, '+ New split'))));
              sb.append(l);
            },
            actions: [{ label: 'Cancel', onclick: () => { resolve(null); } }],
            onClose: () => resolve(null),
          });
        });
        if (!pick) return;
        let split = pick;
        if (pick === 'new') {
          const name = await promptSheet('', `${gym.name} plan`, { title: 'New split' });
          if (!name) return;
          split = { id: uid('s_'), name, days: [] };
          db.splits.push(split);
          if (!db.settings.activeSplitId) { db.settings.activeSplitId = split.id; db.save('settings'); }
        }
        const dayName = await promptSheet('', targetName(), { title: 'Day name' });
        if (!dayName) return;
        split.days.push({ id: uid('d_'), name: dayName, targets: [...targets()], exerciseIds: result.map((r) => r.exerciseId) });
        db.save('splits');
        toast(`Added "${dayName}" to ${split.name}`);
        popPanel();
      }

      body.append(
        el('p.muted.small', {}, `Uses only what ${gym.name} has. One compound per muscle first, then isolations to fill.`),
        el('button.list-item', { id: 'builder-style', onclick: openStyle }, el('div.grow', {}, el('div.title', {}, 'Your style'), el('div.sub', {}, describeStyle())), el('span.chev', {}, '›')),
        el('div.card-title', {}, 'Target'), targetChips, customChips,
        el('div.card-title', {}, 'Length'), lengthSeg,
        genBtn,
        list,
        actions,
      );
      if (result) { drawResult(); actions.classList.remove('hidden'); genBtn.textContent = 'Regenerate'; genBtn.classList.remove('primary'); }
    },
  });
}
