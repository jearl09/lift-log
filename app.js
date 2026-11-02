/* ==========================================================================
   app.js — entry point: first-run seed, tab navigation, timer + service
   worker setup. Screens live in js/views/.
   ========================================================================== */

import { db } from './js/db.js';
import { PRESET_SPLITS } from './js/data.js';
import { $, $$, toast, closeAllPanels } from './js/ui.js';
import { initTimer } from './js/timer.js';
import { gyms } from './js/engine.js';
import { addSplitCopy } from './js/views/splits.js';
import * as today from './js/views/today.js';
import * as splits from './js/views/splits.js';
import * as history from './js/views/history.js';
import * as settings from './js/views/settings.js';

const TITLES = { today: 'Today', splits: 'Splits', history: 'History', settings: 'Settings' };
const views = { today, splits, history, settings };
let current = 'today';

function seed() {
  if (db.meta.seeded) return;
  if (!db.splits.length) {
    const s = addSplitCopy(PRESET_SPLITS[0]);
    db.settings.activeSplitId = s.id;
    db.save('settings');
  }
  db.meta.seeded = true;
  db.save('meta');
}


function showTab(name) {
  current = name;
  closeAllPanels();
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== name));
  $('#header-title').textContent = TITLES[name];
  renderCurrent();
  $('#main').scrollTop = 0;
}

function renderCurrent() {
  views[current].render($(`#view-${current}`));
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Update available', { action: 'Reload', duration: 0, onAction: () => nw.postMessage({ type: 'SKIP_WAITING' }) });
        }
      });
    });
  }).catch((err) => console.warn('SW registration failed:', err));

  // Reload only when an update takes over. On the very first install the
  // controller goes from none to the new worker; the page is already current.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

function init() {
  settings.applyTheme();
  seed();
  gyms(); // seeds the default "My gym" with everything selected

  $$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.addEventListener('app:tab', (e) => showTab(e.detail));
  document.addEventListener('app:refresh', renderCurrent);
  document.addEventListener('panels:empty', renderCurrent);
  document.addEventListener('app:reset', () => { seed(); showTab('today'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && current === 'today') renderCurrent(); });

  initTimer();
  registerSW();
  showTab('today');
}

init();
