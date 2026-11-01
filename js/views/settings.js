/* ==========================================================================
   views/settings.js — units, rest, bar weight, theme, accent, notifications,
   export/import JSON, reset.
   ========================================================================== */

import { db } from '../db.js';
import { el, clear, toast, fmtWeight, kgToDisplay, displayToKg, unitLabel, weightStepKg } from '../ui.js';
import { confirmSheet } from '../sheet.js';
import { activeGym } from '../engine.js';
import { openGyms, gymItemCount } from './gyms.js';

const THEME_COLORS = { light: '#F6F1E7', dark: '#122A20' };
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

export function applyTheme() {
  // Migrate the old 'oled' value and drop the retired accent setting.
  if (db.settings.theme === 'oled') db.settings.theme = 'dark';
  if ('accent' in db.settings) { delete db.settings.accent; db.save('settings'); }
  const theme = ['light', 'dark', 'system'].includes(db.settings.theme) ? db.settings.theme : 'system';
  document.documentElement.dataset.theme = theme;
  const effective = theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLORS[effective];
}
systemDark.addEventListener('change', applyTheme);

function seg(options, value, onPick) {
  return el('div.seg', {}, options.map(([v, label]) =>
    el('button', { class: v === value ? 'active' : '', onclick: () => onPick(v) }, label)));
}

/** Device readout for layout debugging: viewport, safe-area insets, display mode. */
function diagnostics() {
  const probe = el('div', { style: { position: 'fixed', visibility: 'hidden', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' } });
  document.body.append(probe);
  const cs = getComputedStyle(probe);
  const top = cs.paddingTop, bottom = cs.paddingBottom;
  probe.remove();
  const mode = isStandalone() ? 'standalone' : 'browser';
  return `${mode} · viewport ${window.innerWidth}×${window.innerHeight} · screen ${screen.width}×${screen.height} · safe top ${top} · safe bottom ${bottom} · cache v8`;
}

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function render(view) {
  clear(view);
  const s = db.settings;
  const rerender = () => render(view);

  const restVal = el('span.val', {}, `${s.defaultRestSec}s`);
  const bumpRest = (d) => { s.defaultRestSec = Math.min(600, Math.max(15, s.defaultRestSec + d)); db.save('settings'); restVal.textContent = `${s.defaultRestSec}s`; };
  const barVal = el('span.val', {}, fmtWeight(s.barKg));
  // Step in the display unit (2.5 kg or 5 lb) so lb users land on 45, 35, etc.
  const bumpBar = (d) => {
    const stepD = s.units === 'lb' ? 5 : 2.5;
    const next = Math.max(0, Math.round((kgToDisplay(s.barKg) + d * stepD) / stepD) * stepD);
    s.barKg = displayToKg(next) || 0;
    db.save('settings'); barVal.textContent = fmtWeight(s.barKg);
  };

  const notifSupported = 'Notification' in window;
  const notifHint = !notifSupported
    ? (isStandalone() ? 'Not supported on this device.' : 'Add to Home Screen first (iOS 16.4+).')
    : Notification.permission === 'denied' ? 'Blocked in system settings.' : 'Fires when a rest timer ends.';

  view.append(
    el('div.card', {},
      el('div.card-title', {}, 'Appearance'),
      el('div.setting-row', {}, el('div', {}, el('div.label', {}, 'Theme'), el('div.hint', {}, 'System follows your device')),
        seg([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], s.theme, (v) => { s.theme = v; db.save('settings'); applyTheme(); rerender(); })),
    ),
    el('div.list', {},
      el('button.list-item', { id: 'my-gyms', onclick: openGyms },
        el('div.grow', {}, el('div.title', {}, 'My gyms'), el('div.sub', {}, `Active: ${activeGym().name} · ${gymItemCount(activeGym())} items`)),
        el('span.chev', {}, '›')),
    ),
    el('div.card', {},
      el('div.card-title', {}, 'Training'),
      el('div.setting-row', {}, el('div', {}, el('div.label', {}, 'Units')), seg([['kg', 'kg'], ['lb', 'lb']], s.units, (v) => { s.units = v; db.save('settings'); rerender(); })),
      el('div.setting-row', {}, el('div', {}, el('div.label', {}, 'Default rest'), el('div.hint', {}, 'Unless an exercise overrides it')),
        el('div.stepper', {}, el('button', { onclick: () => bumpRest(-15) }, '−'), restVal, el('button', { onclick: () => bumpRest(15) }, '+'))),
      el('div.setting-row', {}, el('div', {}, el('div.label', {}, 'Bar weight'), el('div.hint', {}, 'For plates and warm-ups')),
        el('div.stepper', {}, el('button', { onclick: () => bumpBar(-1) }, '−'), barVal, el('button', { onclick: () => bumpBar(1) }, '+'))),
      el('div.setting-row', {},
        el('div', {}, el('div.label', {}, 'Rest notifications'), el('div.hint', {}, notifHint)),
        el('button.toggle', { class: s.notifications && notifSupported && Notification.permission === 'granted' ? 'on' : '', 'aria-label': 'Toggle notifications',
          onclick: async () => {
            if (!notifSupported) { toast('Notifications unavailable here'); return; }
            if (s.notifications && Notification.permission === 'granted') { s.notifications = false; db.save('settings'); rerender(); return; }
            const perm = await Notification.requestPermission();
            if (perm === 'granted') { s.notifications = true; db.save('settings'); toast('Notifications on'); }
            else toast('Permission not granted');
            rerender();
          } }),
      ),
    ),
  );

  const fileIn = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: onImportFile });
  view.append(
    el('div.card', {},
      el('div.card-title', {}, 'Backup'),
      el('p.muted.small', { style: { marginBottom: '12px' } }, `${db.workouts.length} workouts · ${db.splits.length} splits · ${db.exercises.length} custom/edited exercises`),
      el('div.btn-row', {},
        el('button.btn', { onclick: exportJSON }, 'Export JSON'),
        el('button.btn', { onclick: () => fileIn.click() }, 'Import JSON'),
      ),
      fileIn,
    ),
    el('div.card', {},
      el('div.card-title', {}, 'Danger zone'),
      el('button.btn.danger.block', { onclick: async () => {
        if (!(await confirmSheet('Workouts, splits, custom exercises and settings will all be deleted.', { title: 'Reset all data?', confirmLabel: 'Continue', danger: true }))) return;
        if (!(await confirmSheet('This cannot be undone. Export a backup first if unsure.', { title: 'Really delete everything?', confirmLabel: 'Delete everything', danger: true }))) return;
        db.resetAll();
        applyTheme();
        toast('All data deleted');
        document.dispatchEvent(new CustomEvent('app:reset'));
      } }, 'Reset all data'),
    ),
    el('div.card', {},
      el('div.card-title', {}, 'About'),
      el('p.small', {}, 'Lift Log is an offline-first personal workout tracker. All data stays on this device.'),
      el('p.small', { style: { marginTop: '8px' } }, 'Exercise photos and full instructions come from ', el('a', { href: 'https://github.com/yuhonas/free-exercise-db', target: '_blank', rel: 'noopener', style: { color: 'var(--green)', fontWeight: 800 } }, 'free-exercise-db'), ' by yuhonas and contributors, released under CC0 1.0 (public domain). Coaching notes are written for this app.'),
    ),
    el('p.muted.small.center', {}, 'Lift Log · offline-first · data stays on this device'),
    el('p.muted.small.center', {}, diagnostics()),
  );

  function exportJSON() {
    const data = JSON.stringify(db.exportData(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `lift-log-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const obj = JSON.parse(reader.result);
        const n = Array.isArray(obj.workouts) ? obj.workouts.length : 0;
        if (!(await confirmSheet(`This backup holds ${n} workouts. Current data will be replaced.`, { title: 'Restore backup?', confirmLabel: 'Restore' }))) return;
        db.importData(obj);
        applyTheme();
        toast('Backup restored');
        document.dispatchEvent(new CustomEvent('app:reset'));
      } catch (err) {
        toast(`Import failed: ${err.message}`, { duration: 4000 });
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }
}

export { kgToDisplay, displayToKg, unitLabel };
