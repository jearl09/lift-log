/* ==========================================================================
   views/style.js — Settings → Training style: presets (Fast and effective /
   Balanced / Strength), sets, rep scheme, session length and the quick-setup
   preference. Everything the builder, swaps and set pre-fill read.
   ========================================================================== */

import { db } from '../db.js';
import { el, pushPanel, toast } from '../ui.js';
import { style, STYLE_PRESETS, applyStylePreset, setStyle, schemeLabel, exerciseCountFor, SETUP_HINT } from '../style.js';

export function openStyle() {
  pushPanel({
    title: 'Training style',
    render(body, p) {
      const s = style();
      const seg = (options, value, onPick) => el('div.seg', {}, options.map(([v, label]) => el('button', { class: v === value ? 'active' : '', onclick: () => onPick(v) }, label)));
      const stepper = (val, fmt, onStep) => el('div.stepper', {}, el('button', { onclick: () => onStep(-1) }, '−'), el('span.val', {}, fmt(val)), el('button', { onclick: () => onStep(1) }, '+'));
      const refresh = () => p.refresh();

      const presets = el('div.list');
      for (const pr of STYLE_PRESETS) {
        const on = s.preset === pr.id;
        presets.append(el('button.list-item', { class: on ? 'selected' : '', 'data-style': pr.id, onclick: () => { applyStylePreset(pr.id); toast(`${pr.name} applied`); refresh(); } },
          el('div.grow', {}, el('div.title', {}, pr.name, on && el('span.badge.fill', { style: { marginLeft: '8px' } }, 'On')), el('div.sub', {}, pr.blurb),
            el('div.sub', {}, `${schemeLabel({ ...pr.style })} · ${pr.style.minutes} min · rest ${pr.restSec}s${pr.style.quickSetup ? ' · quick setup' : ''}`)),
          el('span.chev', {}, on ? '✓' : '›'),
        ));
      }

      const count = exerciseCountFor(s);
      body.append(
        el('p.muted.small', {}, 'Pick how you like to train. The day builder, swap suggestions and the sets on every workout card follow it.'),
        el('div.card-title', {}, 'Presets'),
        presets,
        el('div.card-title', {}, s.preset === 'custom' ? 'Custom' : 'Fine-tune'),
        el('div.card', {},
          el('div.setting-row', {}, el('div', {}, el('div.label', {}, 'Working sets'), el('div.hint', {}, 'Per exercise')),
            stepper(s.sets, (v) => String(v), (d) => { setStyle({ sets: Math.min(6, Math.max(1, s.sets + d)) }); refresh(); })),
          el('div.setting-row.stacked', {}, el('div', {}, el('div.label', {}, 'Reps'), el('div.hint', {}, s.scheme === 'failure' ? `Every set to failure. Weight goes up once every set clears ${s.window[1]} reps.` : s.scheme === 'fixed' ? `Same reps every set, add weight when you hit them all.` : 'Each exercise keeps its own rep range.')),
            seg([['failure', 'To failure'], ['fixed', 'Fixed'], ['exercise', 'Per exercise']], s.scheme, (v) => { setStyle({ scheme: v }); refresh(); })),
          s.scheme === 'fixed' && el('div.setting-row', {}, el('div', {}, el('div.label', {}, 'Reps per set')),
            stepper(s.reps, (v) => String(v), (d) => { setStyle({ reps: Math.min(30, Math.max(1, s.reps + d)) }); refresh(); })),
          s.scheme === 'failure' && el('div.setting-row.stacked', {}, el('div', {}, el('div.label', {}, 'Rep window'), el('div.hint', {}, 'Pick a weight that fails inside this range')),
            el('div.row', { style: { gap: '6px' } },
              stepper(s.window[0], (v) => String(v), (d) => { const lo = Math.min(s.window[1] - 1, Math.max(3, s.window[0] + d)); setStyle({ window: [lo, s.window[1]] }); refresh(); }),
              stepper(s.window[1], (v) => String(v), (d) => { const hi = Math.min(30, Math.max(s.window[0] + 1, s.window[1] + d)); setStyle({ window: [s.window[0], hi] }); refresh(); }))),
          el('div.setting-row', {}, el('div', {}, el('div.label', {}, 'Session length'), el('div.hint', {}, `About ${count} exercise${count === 1 ? '' : 's'} at ${db.settings.defaultRestSec}s rest`)),
            stepper(s.minutes, (v) => `${v} min`, (d) => { setStyle({ minutes: Math.min(120, Math.max(15, s.minutes + d * 5)) }); refresh(); })),
          el('div.setting-row', {}, el('div', {}, el('div.label', {}, 'Prefer quick setups'), el('div.hint', {}, SETUP_HINT[0] + '. Plate-loaded lifts get swapped for quicker ones.')),
            el('button.toggle', { id: 'quick-setup', class: s.quickSetup ? 'on' : '', 'aria-label': 'Prefer quick-setup exercises', onclick: () => { setStyle({ quickSetup: !s.quickSetup }); refresh(); } })),
        ),
        el('p.muted.small', {}, 'Rest time lives under Training. Exercises with their own progression settings keep them.'),
      );
    },
  });
}
