/* ==========================================================================
   sheet.js — bottom sheets with a drag handle and swipe-to-dismiss.
   Replaces native confirm()/prompt() with confirmSheet()/promptSheet().
   One sheet is open at a time; opening another closes the current one.
   ========================================================================== */

import { $, el, clear, reducedMotion } from './ui.js';

let current = null;

/**
 * openSheet({ title, text, render(body), actions: [{ label, primary, danger, onclick }], onClose })
 * Returns { close(result), body, node }. `onclick` may return false to keep the sheet open.
 */
export function openSheet({ title, text, render, actions = [], onClose, dismissible = true }) {
  if (current) current.close(undefined, true);
  const root = $('#sheet-root');
  const backdrop = el('div.sheet-backdrop', { onclick: () => dismissible && api.close(undefined) });
  const body = el('div.sheet-body');
  const handle = el('div.sheet-handle');
  const head = (title || text) && el('div.sheet-head', {}, title && el('h3', {}, title), text && el('p', {}, text));
  const actionsEl = actions.length && el('div.sheet-actions', {},
    actions.map((a) => el('button.btn.sheet-action', {
      // Destructive actions are red outlines, never filled; a danger action is not the primary.
      class: [a.primary && !a.danger && 'primary', a.danger && 'danger'].filter(Boolean).join(' '),
      onclick: async () => { const r = a.onclick ? await a.onclick() : undefined; if (r !== false) api.close(r === undefined ? true : r); },
    }, a.label)),
  );
  const sheet = el('div.sheet', {}, handle, head, body, actionsEl);
  if (render) render(body);
  root.append(backdrop, sheet);

  let closed = false;
  const api = {
    node: sheet, body,
    close(result, immediate = false) {
      if (closed) return;
      closed = true;
      if (current === api) current = null;
      sheet.classList.remove('open');
      backdrop.classList.remove('open');
      sheet.style.transform = '';
      const done = () => { sheet.remove(); backdrop.remove(); onClose && onClose(result); };
      if (immediate || reducedMotion()) done(); else setTimeout(done, 320);
      document.removeEventListener('keydown', onKey);
    },
  };
  current = api;

  // Animate in on the next frame so the transition runs.
  requestAnimationFrame(() => { sheet.classList.add('open'); backdrop.classList.add('open'); });

  // ---- Drag to dismiss ----
  let startY = 0, dy = 0, dragging = false, startT = 0;
  const canDrag = (e) => dismissible && (!body.contains(e.target) || body.scrollTop <= 0);
  sheet.addEventListener('pointerdown', (e) => {
    if (!canDrag(e) || e.target.closest('button, input, select, textarea, a')) return;
    dragging = true; startY = e.clientY; dy = 0; startT = Date.now();
    sheet.setPointerCapture(e.pointerId);
    sheet.classList.add('dragging');
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');
    const v = dy / Math.max(1, Date.now() - startT);
    if (dy > 110 || v > 0.6) api.close(undefined);
    else sheet.style.transform = '';
  };
  sheet.addEventListener('pointerup', endDrag);
  sheet.addEventListener('pointercancel', endDrag);

  const onKey = (e) => { if (e.key === 'Escape' && dismissible) api.close(undefined); };
  document.addEventListener('keydown', onKey);

  return api;
}

export function closeSheet() { if (current) current.close(undefined); }

/** Promise<boolean> */
export function confirmSheet(text, { title = 'Are you sure?', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    openSheet({
      title, text,
      actions: [
        { label: confirmLabel, primary: true, danger, onclick: () => true },
        { label: cancelLabel, onclick: () => false },
      ],
      onClose: (r) => resolve(r === true),
    });
  });
}

/** Promise<string|null> */
export function promptSheet(text, def = '', { title = 'Enter a name', placeholder = '', confirmLabel = 'Save' } = {}) {
  return new Promise((resolve) => {
    let value = def;
    let input;
    const sheet = openSheet({
      title, text,
      render(body) {
        input = el('input.input', { type: 'text', value: def, placeholder, autocapitalize: 'words', oninput: (e) => (value = e.target.value),
          onkeydown: (e) => { if (e.key === 'Enter') sheet.close(value.trim() || null); } });
        body.append(input);
      },
      actions: [
        { label: confirmLabel, primary: true, onclick: () => value.trim() || null },
        { label: 'Cancel', onclick: () => null },
      ],
      onClose: (r) => resolve(typeof r === 'string' ? r : null),
    });
    setTimeout(() => { input && input.focus(); input && input.select(); }, 350);
  });
}
