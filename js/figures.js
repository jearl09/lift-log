/* ==========================================================================
   figures.js — eight looping side-view stick-figure animations, one per
   movement pattern family. Same 2px green outline style as the muscle map.
   SMIL animateTransform, 2-second loop; paused when off-screen via
   IntersectionObserver; prefers-reduced-motion renders the end position.
   Each figure is well under 6 KB of markup.
   ========================================================================== */

import { reducedMotion } from './ui.js';

/* Geometry (viewBox 100×120, hip at 50,64). Limbs are drawn from their
   pivot downward (0,0 → 0,len) and rotated; the torso is drawn upward.
   Positive rotation is clockwise, so for hanging limbs "forward" (+x) is
   negative; for the torso, positive leans forward. */
const L = { torso: 36, uarm: 18, farm: 16, thigh: 22, shin: 22, foot: 9 };

/* pattern → { label, angles: joint → [start, end], dy: [start, end], root?, props? } */
const FIGURES = {
  squat: {
    label: 'Squat', dy: [0, 14.5],
    torso: [0, 30], uarm: [-70, -75], farm: [0, 0], thigh: [0, -70], shin: [0, 70],
    props: '<path class="prop" d="M14 108h72"/>',
  },
  hinge: {
    label: 'Hip hinge', dy: [0, 3],
    torso: [0, 75], uarm: [0, -75], farm: [0, 0], thigh: [0, -15], shin: [0, 15],
    props: '<path class="prop" d="M14 108h72"/>',
  },
  press: {
    label: 'Horizontal press', dy: [0, 0], root: 'rotate(-90 50 60)',
    torso: [0, 0], uarm: [-30, -90], farm: [-60, 0], thigh: [-70, -70], shin: [70, 70],
    props: '<rect class="prop" x="6" y="68" width="66" height="7" rx="2"/><path class="prop" d="M16 75v12M62 75v12M4 87h92"/>',
  },
  vpress: {
    label: 'Vertical press', dy: [0, 0],
    torso: [0, 0], uarm: [-100, -180], farm: [-80, 0], thigh: [0, 0], shin: [0, 0],
    props: '<path class="prop" d="M14 108h72"/>',
  },
  row: {
    label: 'Horizontal row', dy: [0, 0],
    torso: [60, 60], uarm: [-70, -20], farm: [0, -85], thigh: [-15, -15], shin: [15, 15],
    props: '<path class="prop" d="M14 108h72"/>',
  },
  vpull: {
    label: 'Vertical pull', dy: [0, -18],
    torso: [0, 0], uarm: [180, 250], farm: [0, -90], thigh: [-15, -15], shin: [25, 25],
    props: '<path class="prop" d="M16 6h68"/>',
  },
  curl: {
    label: 'Curl', dy: [0, 0],
    torso: [0, 0], uarm: [0, 0], farm: [0, -135], thigh: [0, 0], shin: [0, 0],
    props: '<path class="prop" d="M14 108h72"/>',
  },
  extension: {
    label: 'Extension / pushdown', dy: [0, 0],
    torso: [0, 0], uarm: [0, 0], farm: [-95, -10], thigh: [0, 0], shin: [0, 0],
    props: '<path class="prop" d="M14 108h72M74 4v22" />',
  },
};

/** Exercise movement pattern → figure key. Every pattern in data.js maps to one. */
export const FIGURE_FOR_PATTERN = {
  'h-push': 'press', 'incline-push': 'press', 'dip': 'press', 'fly': 'press',
  'v-push': 'vpress', 'lateral-raise': 'vpress', 'front-raise': 'vpress', 'upright-row': 'vpress', 'shrug': 'vpress',
  'h-pull': 'row', 'rear-fly': 'row',
  'v-pull': 'vpull',
  'hinge': 'hinge', 'swing': 'hinge', 'hip-thrust': 'hinge', 'leg-curl': 'hinge', 'flexion': 'hinge', 'anti-extension': 'hinge', 'anti-lateral': 'hinge', 'rotation': 'hinge',
  'squat': 'squat', 'lunge': 'squat', 'leg-ext': 'squat', 'calf': 'squat',
  'curl': 'curl', 'wrist': 'curl',
  'extension': 'extension',
};

export function figureKeyFor(ex) {
  return FIGURE_FOR_PATTERN[ex && ex.pattern] || 'squat';
}

const SPLINE = 'calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" keyTimes="0;0.5;1" dur="2s" repeatCount="indefinite"';

function rot(angles, still) {
  if (still) return `transform="rotate(${angles[1]})"`;
  return `><animateTransform attributeName="transform" type="rotate" values="${angles[0]};${angles[1]};${angles[0]}" ${SPLINE}/`;
}

/**
 * Build one figure. `still` forces the end-position frame (reduced motion).
 * Returns an SVG string.
 */
export function figureSVG(key, { still = reducedMotion() } = {}) {
  const f = FIGURES[key] || FIGURES.squat;
  // Helper that emits either a static rotate attribute or an animated child.
  const g = (cls, angles, inner) => still
    ? `<g class="${cls}" ${rot(angles, true)}>${inner}</g>`
    : `<g class="${cls}"${rot(angles, false)}>${inner}</g>`;
  const body = still
    ? `<g transform="translate(0,${f.dy[1]})">`
    : `<g><animateTransform attributeName="transform" type="translate" values="0 ${f.dy[0]};0 ${f.dy[1]};0 ${f.dy[0]}" ${SPLINE}/>`;

  const arm = g('uarm', f.uarm,
    `<path d="M0 0v${L.uarm}"/><g transform="translate(0,${L.uarm})">` +
    g('farm', f.farm, `<path d="M0 0v${L.farm}"/><circle class="hand" cx="0" cy="${L.farm + 1.5}" r="2.6"/>`) +
    `</g>`);
  const torso = g('torso', f.torso,
    `<path d="M0 0v-${L.torso}"/><circle class="head" cx="0" cy="-${L.torso + 9}" r="7"/>` +
    `<g transform="translate(0,-${L.torso})">${arm}</g>`);
  const leg = g('thigh', f.thigh,
    `<path d="M0 0v${L.thigh}"/><g transform="translate(0,${L.thigh})">` +
    g('shin', f.shin, `<path d="M0 0v${L.shin}"/><path d="M0 ${L.shin}h${L.foot}"/>`) +
    `</g>`);

  // Props stay in world coordinates; only the body is rotated for lying patterns.
  return `<svg class="figure" viewBox="0 0 100 120" role="img" aria-label="${f.label} movement" data-figure="${key}">` +
    `${f.props || ''}<g${f.root ? ` transform="${f.root}"` : ''}>${body}<g transform="translate(50,64)">${torso}${leg}</g></g></g></svg>`;
}

/* ---------- Mounting + off-screen pause ---------- */

let observer = null;
function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const svg = e.target;
      try { if (e.isIntersecting) svg.unpauseAnimations(); else svg.pauseAnimations(); } catch { /* SMIL unsupported */ }
    }
  }, { threshold: 0.05 });
  return observer;
}

/** Create and mount a figure into `container`; returns the <svg>. */
export function mountFigure(container, key, opts = {}) {
  const tpl = document.createElement('template');
  tpl.innerHTML = figureSVG(key, opts);
  const svg = tpl.content.firstChild;
  container.append(svg);
  const io = getObserver();
  if (io && !opts.still) io.observe(svg);
  return svg;
}

export const FIGURE_KEYS = Object.keys(FIGURES);
export const FIGURE_LABELS = Object.fromEntries(Object.entries(FIGURES).map(([k, v]) => [k, v.label]));
