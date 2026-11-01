/* ==========================================================================
   timer.js — rest timer

   State lives on db.active.timer so it survives closing the app. Remaining
   time is always derived from the stored end timestamp, never from ticks.

   UI: a bottom sheet with a ring + big digits (expanded on start, drag down
   or tap outside to collapse) and a persistent mini-bar above the tab bar.
   Final 10 s turn warm red; the ring pulses at zero; then beep + flash +
   optional local notification.
   ========================================================================== */

import { db } from './db.js';
import { $, el, fmtClock, reducedMotion } from './ui.js';

const TICK_MS = 250;
const URGENT_SEC = 10;
let interval = null;
let audioCtx = null;
let finishing = false;
const listeners = new Set();

/* ---------- Audio ---------- */

export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* no audio */ }
}

export function beep() {
  try {
    if (!audioCtx) unlockAudio();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    [[880, 0], [880, 0.18], [1320, 0.36]].forEach(([freq, offset]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.15);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.16);
    });
  } catch (e) { /* ignore */ }
}

/* ---------- Flash + notification ---------- */

function flash() {
  const f = $('#flash');
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
  setTimeout(() => f.classList.remove('go'), 3000);
}

async function notify(exerciseName) {
  try {
    if (!db.settings.notifications) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Rest over', {
      body: exerciseName ? `Next set: ${exerciseName}` : 'Time for your next set',
      tag: 'rest-timer', renotify: true,
    });
  } catch (e) { /* unsupported */ }
}

/* ---------- State ---------- */

const state = () => (db.active && db.active.timer ? db.active.timer : null);
const persist = () => db.save('active');

function ensureLoop() { if (interval == null) interval = setInterval(tick, TICK_MS); }
function stopLoop() { if (interval != null) { clearInterval(interval); interval = null; } }

function emit() {
  for (const fn of listeners) fn(timer);
  renderBar();
  renderFull();
}

function finish({ silent = false } = {}) {
  const t = state();
  finishing = false;
  if (!t) return;
  const name = t.exerciseName;
  db.active.timer = null;
  persist();
  stopLoop();
  if (!silent) { beep(); flash(); notify(name); }
  collapse();
  emit();
}

function tick() {
  const t = state();
  if (!t) { stopLoop(); emit(); return; }
  const rem = t.endsAt - Date.now();
  if (rem <= 0 && !finishing) {
    // Pulse the ring at zero, then finish.
    finishing = true;
    emit();
    const ring = $('#timer-full .ring-wrap');
    if (ring) { ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse'); }
    setTimeout(() => { if (ring) ring.classList.remove('pulse'); finish(); }, reducedMotion() ? 0 : 900);
    return;
  }
  if (!finishing) emit();
}

export const timer = {
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  get running() { return !!state(); },
  remainingSec() { const t = state(); return t ? Math.max(0, (t.endsAt - Date.now()) / 1000) : 0; },
  totalSec() { const t = state(); return t ? t.totalSec : 0; },

  start(sec, { exerciseId = null, exerciseName = '' } = {}) {
    if (!db.active) return;
    sec = Math.max(5, Math.round(sec));
    finishing = false;
    db.active.timer = { endsAt: Date.now() + sec * 1000, totalSec: sec, exerciseId, exerciseName };
    persist();
    ensureLoop();
    expand();
    emit();
  },

  adjust(deltaSec) {
    const t = state();
    if (!t || finishing) return;
    t.endsAt = Math.max(Date.now() + 1000, t.endsAt + deltaSec * 1000);
    t.totalSec = Math.max(5, t.totalSec + deltaSec);
    persist();
    emit();
  },

  skip() { finish({ silent: true }); },

  /** Call on startup and whenever the app regains focus. */
  resume() {
    const t = state();
    if (!t) { emit(); return; }
    if (t.endsAt - Date.now() <= 0) finish();
    else { ensureLoop(); emit(); }
  },

  expand, collapse,
};

/* ---------- UI: mini bar ---------- */

function renderBar() {
  const bar = $('#timer-bar');
  const t = state();
  if (!t) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  if (!bar.dataset.built) {
    bar.dataset.built = '1';
    bar.append(
      el('div.grow', {}, el('div.time', { id: 'tb-time' }, '0:00'), el('div.label', { id: 'tb-label' }, 'Rest')),
      el('button.bar-btn', { onclick: (e) => { e.stopPropagation(); timer.adjust(-15); } }, '−15'),
      el('button.bar-btn', { onclick: (e) => { e.stopPropagation(); timer.adjust(15); } }, '+15'),
      el('button.bar-btn', { onclick: (e) => { e.stopPropagation(); timer.skip(); } }, 'Skip'),
      el('div.prog', { id: 'tb-prog' }),
    );
    bar.addEventListener('click', (e) => { if (!e.target.closest('.bar-btn')) expand(); });
    // Drag up to expand.
    let sy = null;
    bar.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true });
    bar.addEventListener('touchmove', (e) => { if (sy != null && sy - e.touches[0].clientY > 30) { sy = null; expand(); } }, { passive: true });
  }
  const rem = timer.remainingSec();
  $('#tb-time').textContent = fmtClock(rem);
  $('#tb-label').textContent = t.exerciseName ? `Rest · ${t.exerciseName}` : 'Rest';
  $('#tb-prog').style.width = `${t.totalSec ? Math.min(100, (rem / t.totalSec) * 100) : 0}%`;
  bar.classList.toggle('urgent', rem <= URGENT_SEC);
}

/* ---------- UI: expandable sheet ---------- */

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;
let backdrop = null;
let expanded = false;

function buildFull() {
  const full = $('#timer-full');
  if (full.dataset.built) return full;
  full.dataset.built = '1';
  backdrop = el('div.timer-backdrop', { onclick: collapse });
  full.before(backdrop);
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 120 120');
  ring.setAttribute('class', 'ring');
  ring.innerHTML =
    `<circle class="track" cx="60" cy="60" r="${RING_R}"/>` +
    `<circle class="prog" id="tf-prog" cx="60" cy="60" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/>`;
  full.append(
    el('div.sheet-handle'),
    el('div.tf-label', { id: 'tf-label' }, 'Rest'),
    el('div.ring-wrap', {}, ring, el('div.big', { id: 'tf-time' }, '0:00')),
    el('div.ctrls', {},
      el('button.btn', { onclick: () => timer.adjust(-15) }, '−15s'),
      el('button.btn', { onclick: () => timer.adjust(15) }, '+15s'),
      el('button.btn.primary', { onclick: () => timer.skip() }, 'Skip'),
    ),
    el('button.btn.ghost.close', { onclick: collapse }, 'Collapse'),
  );
  // Drag down to collapse.
  let startY = 0, dy = 0, dragging = false;
  full.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true; startY = e.clientY; dy = 0;
    full.setPointerCapture(e.pointerId);
    full.classList.add('dragging');
  });
  full.addEventListener('pointermove', (e) => { if (dragging) { dy = Math.max(0, e.clientY - startY); full.style.transform = `translateY(${dy}px)`; } });
  const end = () => {
    if (!dragging) return;
    dragging = false; full.classList.remove('dragging'); full.style.transform = '';
    if (dy > 90) collapse();
  };
  full.addEventListener('pointerup', end);
  full.addEventListener('pointercancel', end);
  return full;
}

function expand() {
  if (!state()) return;
  const full = buildFull();
  full.classList.remove('hidden');
  requestAnimationFrame(() => { full.classList.add('open'); backdrop.classList.add('open'); });
  expanded = true;
  renderFull();
}

function collapse() {
  const full = $('#timer-full');
  if (!expanded) return;
  expanded = false;
  full.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
  setTimeout(() => { if (!expanded) full.classList.add('hidden'); }, 340);
}

function renderFull() {
  const full = $('#timer-full');
  if (!expanded || !full.dataset.built) return;
  const t = state();
  if (!t) { collapse(); return; }
  const rem = timer.remainingSec();
  $('#tf-time').textContent = fmtClock(rem);
  $('#tf-label').textContent = t.exerciseName ? `Rest · ${t.exerciseName}` : 'Rest';
  const frac = t.totalSec ? Math.min(1, rem / t.totalSec) : 0;
  $('#tf-prog').setAttribute('stroke-dashoffset', String(RING_C * (1 - frac)));
  full.classList.toggle('urgent', rem <= URGENT_SEC);
}

/* ---------- Lifecycle hooks ---------- */

export function initTimer() {
  const unlock = () => { unlockAudio(); document.removeEventListener('touchend', unlock); document.removeEventListener('click', unlock); };
  document.addEventListener('touchend', unlock, { passive: true });
  document.addEventListener('click', unlock);

  document.addEventListener('visibilitychange', () => { if (!document.hidden) timer.resume(); });
  window.addEventListener('focus', () => timer.resume());
  window.addEventListener('pageshow', () => timer.resume());

  // Scrolling content underneath collapses the sheet into the mini bar.
  document.addEventListener('scroll', (e) => { if (expanded && !$('#timer-full').contains(e.target)) collapse(); }, true);

  timer.resume();
}
