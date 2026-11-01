/* ==========================================================================
   plates.js — plate calculator sheet and warm-up set generator.
   ========================================================================== */

import { db } from './db.js';
import { el, clear, fmtWeight, kgToDisplay, displayToKg, unitLabel, weightStepKg } from './ui.js';
import { openSheet } from './sheet.js';

const KG_PER_LB = 0.45359237;
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const PLATES_LB = [45, 35, 25, 10, 5, 2.5];

export function barKg() { return db.settings.barKg || 20; }

/** Plates per side in the display unit for a total weight in kg. */
export function platesPerSide(totalKg) {
  const lb = db.settings.units === 'lb';
  const plates = lb ? PLATES_LB : PLATES_KG;
  const total = lb ? totalKg / KG_PER_LB : totalKg;
  const bar = lb ? barKg() / KG_PER_LB : barKg();
  let side = Math.max(0, (total - bar) / 2);
  const out = [];
  for (const p of plates) {
    const n = Math.floor((side + 1e-6) / p);
    if (n > 0) { out.push({ w: p, n }); side -= n * p; }
  }
  return { bar: Math.round(bar * 100) / 100, perSide: out, remainder: Math.round(side * 100) / 100, belowBar: total < bar - 1e-6 };
}

function round(kg) {
  const step = weightStepKg();
  return Math.round(kg / step) * step;
}

/** Warm-up ramp up to a working weight: [{ reps, weightKg, warmup: true }] */
export function warmupSets(workKg) {
  const bar = barKg();
  if (workKg <= bar * 1.3) return [{ reps: 10, weightKg: bar, warmup: true }];
  const ramp = workKg <= bar * 2 ? [[10, 0], [5, 0.7]] : [[10, 0], [5, 0.5], [3, 0.7], [1, 0.85]];
  const out = [];
  let last = -1;
  for (const [reps, pct] of ramp) {
    const w = pct === 0 ? bar : Math.max(bar, round(workKg * pct));
    if (w <= last || w >= workKg) continue;
    out.push({ reps, weightKg: w, warmup: true, done: false });
    last = w;
  }
  return out;
}

/** Visual + list of plates for a weight; optional "use this weight" callback. */
export function openPlateCalc(initialKg, { onApply } = {}) {
  let kg = initialKg != null && initialKg > 0 ? initialKg : barKg();
  let big, graphic, list;
  const step = weightStepKg();

  const draw = () => {
    const r = platesPerSide(kg);
    big.textContent = fmtWeight(kg);
    clear(graphic);
    graphic.append(el('div.bar.end'));
    const plateEls = [];
    for (const p of r.perSide) for (let i = 0; i < p.n; i++) {
      const h = 34 + Math.min(50, p.w * (db.settings.units === 'lb' ? 1 : 2.2));
      plateEls.push(el('div.plate', { style: { height: `${h}px` } }, String(p.w)));
    }
    // Mirror: plates on the left, bar, plates on the right.
    graphic.append(...plateEls.slice().reverse(), el('div.bar'), ...plateEls.map((n) => n.cloneNode(true)), el('div.bar.end'));
    clear(list);
    if (r.belowBar) list.append(el('p.muted.small', {}, `Below bar weight (${r.bar} ${unitLabel()}).`));
    else if (!r.perSide.length) list.append(el('p.muted.small', {}, 'Empty bar.'));
    else list.append(el('div.plate-list', {}, r.perSide.map((p) => el('span.chip.active', {}, `${p.n} × ${p.w}`))));
    if (r.remainder > 0.01) list.append(el('p.muted.small', {}, `+${r.remainder} ${unitLabel()} per side not loadable with standard plates.`));
  };

  openSheet({
    title: 'Plate calculator',
    text: `Per side · bar ${fmtWeight(barKg())}`,
    render(body) {
      big = el('div.big-weight');
      graphic = el('div.plates');
      list = el('div');
      const input = el('input.input', { type: 'text', inputmode: 'decimal', value: kgToDisplay(kg), style: { textAlign: 'center', fontSize: '18px', fontWeight: '700' },
        oninput: (e) => { const v = displayToKg(e.target.value.replace(',', '.')); if (v != null && v > 0) { kg = v; draw(); } } });
      body.append(
        big,
        el('div.stepper', { style: { justifyContent: 'center' } },
          el('button', { onclick: () => { kg = Math.max(barKg(), kg - step); input.value = kgToDisplay(kg); draw(); } }, '−'),
          el('div', { style: { width: '120px' } }, input),
          el('button', { onclick: () => { kg = kg + step; input.value = kgToDisplay(kg); draw(); } }, '+'),
        ),
        graphic, list,
      );
      draw();
    },
    actions: onApply
      ? [{ label: 'Use this weight', primary: true, onclick: () => { onApply(kg); } }, { label: 'Close' }]
      : [{ label: 'Close' }],
  });
}
