/* ==========================================================================
   ui.js — DOM helpers, panel stack, toast, empty states, gestures,
   formatting and unit conversion. No app logic lives here.
   ========================================================================== */

import { db } from './db.js';

/* ---------- DOM ---------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * el('button.btn.primary', { onclick: fn, dataset: {...}, ...attrs }, ...children)
 * Children may be strings, nodes, arrays, or null/false (ignored).
 */
export function el(spec, props = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className += (node.className ? ' ' : '') + v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v);
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    parent.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function svgEl(tag, attrs = {}, text) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- IDs / dates ---------- */

export function uid(prefix = '') {
  const r = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return prefix + Date.now().toString(36) + r;
}

export function fmtDate(ts, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(ts).toLocaleDateString(undefined, opts);
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Local-midnight timestamp for a date (default today). */
export function dayStart(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function relativeDay(ts) {
  const days = Math.round((dayStart() - dayStart(ts)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return fmtDate(ts, { day: 'numeric', month: 'short' });
}

/* ---------- Units (storage is kg) ---------- */

const KG_PER_LB = 0.45359237;

export function unitLabel() {
  return db.settings.units === 'lb' ? 'lb' : 'kg';
}

export function kgToDisplay(kg) {
  if (kg == null || isNaN(kg)) return '';
  const v = db.settings.units === 'lb' ? kg / KG_PER_LB : kg;
  return Math.round(v * 100) / 100;
}

export function displayToKg(v) {
  if (v === '' || v == null) return null;
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return db.settings.units === 'lb' ? n * KG_PER_LB : n;
}

/** Smallest sensible weight increment in the display unit, returned in kg. */
export function weightStepKg() {
  return db.settings.units === 'lb' ? 5 * KG_PER_LB : 2.5;
}

export function fmtWeight(kg, withUnit = true) {
  if (kg == null) return withUnit ? 'BW' : '';
  const v = kgToDisplay(kg);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
  return withUnit ? `${s} ${unitLabel()}` : s;
}

/** Epley estimated 1RM, in kg. */
export function est1RM(kg, reps) {
  if (kg == null || !reps) return null;
  if (reps === 1) return kg;
  return kg * (1 + reps / 30);
}

/* ---------- Toast ---------- */

let toastTimer = null;
export function toast(msg, { action, onAction, duration = 2200 } = {}) {
  const t = $('#toast');
  clear(t);
  t.append(document.createTextNode(msg));
  if (action) t.append(el('button.btn', { onclick: () => { hideToast(); onAction && onAction(); } }, action));
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  if (duration > 0) toastTimer = setTimeout(hideToast, duration);
}
export function hideToast() { $('#toast').classList.add('hidden'); }

/* ---------- Empty states ---------- */

const ILLUSTRATIONS = {
  dumbbell: '<svg viewBox="0 0 120 90" fill="none"><rect x="36" y="41" width="48" height="8" rx="3" fill="var(--green-2)" opacity=".5"/><rect x="18" y="28" width="16" height="34" rx="5" fill="var(--red)"/><rect x="86" y="28" width="16" height="34" rx="5" fill="var(--red)"/><rect x="6" y="34" width="10" height="22" rx="4" fill="var(--red)" opacity=".6"/><rect x="104" y="34" width="10" height="22" rx="4" fill="var(--red)" opacity=".6"/><circle cx="24" cy="14" r="2.5" fill="var(--red)" opacity=".5"/><circle cx="98" cy="76" r="3" fill="var(--red)" opacity=".4"/><circle cx="60" cy="18" r="2" fill="var(--green-2)" opacity=".5"/></svg>',
  calendar: '<svg viewBox="0 0 120 90" fill="none"><rect x="25" y="14" width="70" height="62" rx="10" fill="var(--cream-2)" stroke="var(--green)"/><rect x="25" y="14" width="70" height="18" rx="10" fill="var(--red)" opacity=".9"/><rect x="25" y="24" width="70" height="8" fill="var(--red)" opacity=".9"/><g fill="var(--green-2)" opacity=".45"><rect x="34" y="40" width="10" height="8" rx="2"/><rect x="50" y="40" width="10" height="8" rx="2"/><rect x="66" y="40" width="10" height="8" rx="2"/><rect x="34" y="54" width="10" height="8" rx="2"/><rect x="66" y="54" width="10" height="8" rx="2"/></g><rect x="50" y="54" width="10" height="8" rx="2" fill="var(--red)"/><rect x="82" y="40" width="10" height="8" rx="2" fill="var(--red)" opacity=".5"/></svg>',
  list: '<svg viewBox="0 0 120 90" fill="none"><rect x="22" y="16" width="76" height="16" rx="6" fill="var(--cream-2)" stroke="var(--green)"/><rect x="22" y="38" width="76" height="16" rx="6" fill="var(--cream-2)" stroke="var(--green)"/><rect x="22" y="60" width="76" height="16" rx="6" fill="var(--cream-2)" stroke="var(--green)"/><rect x="30" y="21" width="6" height="6" rx="3" fill="var(--red)"/><rect x="30" y="43" width="6" height="6" rx="3" fill="var(--red)" opacity=".6"/><rect x="30" y="65" width="6" height="6" rx="3" fill="var(--red)" opacity=".3"/><rect x="42" y="22" width="34" height="4" rx="2" fill="var(--green-2)" opacity=".5"/><rect x="42" y="44" width="26" height="4" rx="2" fill="var(--green-2)" opacity=".5"/><rect x="42" y="66" width="30" height="4" rx="2" fill="var(--green-2)" opacity=".5"/></svg>',
};

export function emptyState({ icon = 'dumbbell', title, text, action }) {
  const wrap = el('div.empty-state');
  const pic = el('div');
  pic.innerHTML = ILLUSTRATIONS[icon] || ILLUSTRATIONS.dumbbell;
  wrap.append(pic.firstChild);
  if (title) wrap.append(el('div.es-title', {}, title));
  if (text) wrap.append(el('div.es-text', {}, text));
  if (action) wrap.append(el('button.btn.primary', { onclick: action.onclick }, action.label));
  return wrap;
}

/* ---------- Gestures ---------- */

/** Fire fn after `ms` of a still press; cancelled by movement or release. */
export function longPress(node, fn, ms = 500) {
  let t = null, sx = 0, sy = 0;
  const cancel = () => { if (t) { clearTimeout(t); t = null; } };
  node.addEventListener('pointerdown', (e) => {
    sx = e.clientX; sy = e.clientY;
    cancel();
    t = setTimeout(() => { t = null; fn(e); }, ms);
  });
  node.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => node.addEventListener(ev, cancel));
  node.addEventListener('contextmenu', (e) => e.preventDefault());
}

/* ---------- Panel stack ---------- */

const panels = [];

/**
 * Push a full-screen sub-screen. `render(body, panel)` fills the body;
 * `panel.refresh()` re-renders it preserving scroll position.
 */
export function pushPanel({ title, render, action, onClose }) {
  const root = $('#panel-root');
  const body = el('div.panel-body');
  const titleEl = el('h2', {}, title);
  const actionSlot = el('div.action');
  const node = el('div.panel', {},
    el('div.panel-header', {},
      el('button.back', { onclick: () => popPanel(), 'aria-label': 'Back' }, '‹ Back'),
      titleEl,
      actionSlot,
    ),
    body,
  );
  const panel = {
    node, body, onClose,
    setTitle(t) { titleEl.textContent = t; },
    setAction(label, fn) {
      clear(actionSlot);
      if (label) actionSlot.append(el('button', { onclick: fn }, label));
    },
    refresh() {
      const st = body.scrollTop;
      clear(body);
      render(body, panel);
      body.scrollTop = st;
    },
  };
  if (action) panel.setAction(action.label, action.onclick);
  panels.push(panel);
  root.append(node);
  panel.refresh();
  return panel;
}

export function popPanel() {
  const p = panels.pop();
  if (!p) return;
  p.node.classList.add('closing');
  p.node.style.pointerEvents = 'none';
  setTimeout(() => p.node.remove(), reducedMotion() ? 0 : 200);
  if (p.onClose) p.onClose();
  const top = panels[panels.length - 1];
  if (top) top.refresh();
  else document.dispatchEvent(new CustomEvent('panels:empty'));
}

export function closeAllPanels() {
  while (panels.length) popPanel();
}

export function topPanel() { return panels[panels.length - 1] || null; }
export function panelCount() { return panels.length; }
