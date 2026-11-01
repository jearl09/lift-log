/* ==========================================================================
   views/targets.js — Settings → Targets: weekly hard-set target range per
   muscle group, presets, and the week definition.
   ========================================================================== */

import { db } from '../db.js';
import { MUSCLES } from '../data.js';
import { el, clear, pushPanel, toast } from '../ui.js';
import { targets, presetTargets, sizeOf, TARGET_PRESETS } from '../volume.js';

export function openTargets() {
  pushPanel({
    title: 'Weekly targets',
    render(body, p) {
      const t = targets();
      const preset = db.settings.targetPreset || 'custom';
      const seg = (options, value, onPick) => el('div.seg', {}, options.map(([v, label]) => el('button', { class: v === value ? 'active' : '', onclick: () => onPick(v) }, label)));

      const list = el('div.list');
      for (const m of MUSCLES) {
        const range = t[m.id];
        const mk = (i) => el('input.input.target-input', { type: 'text', inputmode: 'numeric', value: String(range[i]), 'aria-label': `${m.name} ${i ? 'max' : 'min'}`,
          onchange: (e) => {
            const n = parseInt(e.target.value, 10);
            if (!(n >= 0)) { e.target.value = String(range[i]); return; }
            range[i] = n;
            if (range[0] > range[1]) { range[i ? 0 : 1] = n; }
            db.settings.targetPreset = 'custom'; db.save('settings'); p.refresh();
          } });
        list.append(el('div.list-item', {},
          el('div.grow', {}, el('div.title', {}, m.name), el('div.sub', {}, `${sizeOf(m.id)} group`)),
          el('div.row', { style: { gap: '6px' } }, mk(0), el('span.muted', {}, '–'), mk(1)),
        ));
      }

      body.append(
        el('p.muted.small', {}, 'Hard sets per muscle group per week. A hard set is 5 or more reps, or RPE 7 or higher when logged, and not a warm-up. It counts 1 for the primary muscle and 0.5 for each secondary muscle.'),
        el('div.card-title', {}, 'Preset'),
        seg([['minimal', 'Minimal'], ['standard', 'Standard'], ['high', 'High']], preset, (v) => {
          db.settings.targets = presetTargets(v); db.settings.targetPreset = v; db.save('settings'); toast(`${v[0].toUpperCase()}${v.slice(1)} targets applied`); p.refresh();
        }),
        el('p.muted.small', {}, Object.entries(TARGET_PRESETS[preset] || {}).length
          ? `Large ${TARGET_PRESETS[preset].large.join('–')} · medium ${TARGET_PRESETS[preset].medium.join('–')} · small ${TARGET_PRESETS[preset].small.join('–')}`
          : 'Custom values below.'),
        el('div.card-title', {}, 'Week'),
        seg([['rolling', 'Rolling 7 days'], ['calendar', 'Mon to Sun']], db.settings.weekMode || 'rolling', (v) => { db.settings.weekMode = v; db.save('settings'); p.refresh(); }),
        el('div.card-title', {}, 'Per muscle group (sets per week)'),
        list,
      );
    },
  });
}
