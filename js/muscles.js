/* ==========================================================================
   muscles.js — stylised SVG body, front and back side by side.

   viewBox 0 0 200 304. Front figure centred at x=50, back at x=150. Each
   half-figure is drawn for the viewer's right side and mirrored, so paired
   muscles get two <path>s sharing one data-muscle attribute. Colours come
   from CSS via data-role / data-heat / data-selected attributes.
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

// Shapes that straddle the midline are drawn whole so no seam is stroked.
const SILHOUETTE_FULL = [
  'M30,42 L70,42 Q76,44 78,52 L74,100 L72,130 L70,150 L30,150 L28,130 L26,100 L22,52 Q24,44 30,42 Z', // torso
  'M46,32 L54,32 L54,43 L46,43 Z',                                                                  // neck
];
// Shapes drawn once per side and mirrored.
const SILHOUETTE = [
  'M72,44 L84,48 L90,100 L92,150 L90,166 L84,166 L82,150 L78,105 L73,98 Z',   // arm
  'M50,150 L72,150 L70,215 L68,280 L71,290 L55,290 L57,280 L52,215 Z',        // leg
];

const SIDE_DELT = 'M78,46 L85,50 L86,62 L80,62 L80,56 Z';
const UPPER_ARM = 'M75,62 L84,64 L87,98 L79,100 Z';
const FOREARM   = 'M79,103 L89,103 L91,147 L83,147 Z';

const FRONT = {
  'chest':       'M51,46 L68,46 L72,52 L70,70 L60,73 L51,70 Z',
  'front-delts': 'M68,44 L78,46 L80,58 L72,60 L68,52 Z',
  'side-delts':  SIDE_DELT,
  'biceps':      UPPER_ARM,
  'forearms':    FOREARM,
  'abs':         'M50,75 L59,75 L58,122 L50,123 Z',
  'obliques':    'M61,76 L70,74 L68,120 L60,122 Z',
  'quads':       'M52,154 L70,154 L68,214 L54,214 Z',
  'calves':      'M57,222 L66,222 L64,270 L58,270 Z',
};

const BACK = {
  'upper-back':  'M50,42 L70,42 L74,52 L66,72 L50,73 Z',
  'rear-delts':  'M68,44 L78,46 L80,58 L72,60 L68,52 Z',
  'side-delts':  SIDE_DELT,
  'triceps':     UPPER_ARM,
  'forearms':    FOREARM,
  'lats':        'M50,75 L66,74 L72,80 L64,118 L50,120 Z',
  'lower-back':  'M50,122 L62,120 L60,148 L50,150 Z',
  'glutes':      'M50,152 L70,152 L68,181 L50,182 Z',
  'hamstrings':  'M52,185 L68,185 L66,214 L54,214 Z',
  'calves':      'M55,222 L68,222 L66,270 L56,270 Z',
};

function path(d, cls, muscle) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('class', cls);
  if (muscle) p.dataset.muscle = muscle;
  return p;
}

function group(transform) {
  const g = document.createElementNS(NS, 'g');
  if (transform) g.setAttribute('transform', transform);
  return g;
}

function figure(shapes, offsetX, label) {
  const root = group(`translate(${offsetX},0)`);
  const head = document.createElementNS(NS, 'circle');
  head.setAttribute('cx', 50); head.setAttribute('cy', 23); head.setAttribute('r', 11);
  head.setAttribute('class', 'silhouette');
  root.append(head);
  for (const d of SILHOUETTE_FULL) root.append(path(d, 'silhouette'));
  for (const t of [null, 'matrix(-1 0 0 1 100 0)']) {
    const g = group(t);
    for (const d of SILHOUETTE) g.append(path(d, 'silhouette'));
    for (const [id, d] of Object.entries(shapes)) g.append(path(d, 'muscle', id));
    root.append(g);
  }
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', 50); text.setAttribute('y', 298); text.setAttribute('text-anchor', 'middle');
  text.textContent = label;
  root.append(text);
  return root;
}

/** Create a fresh muscle-map SVG element (with its own glow filter). */
export function createMuscleMap() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 304');
  svg.setAttribute('class', 'muscle-map');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Muscle map, front and back');
  svg.append(figure(FRONT, 0, 'Front'), figure(BACK, 100, 'Back'));
  return svg;
}

function paths(svg, id) { return svg.querySelectorAll(`.muscle[data-muscle="${id}"]`); }

function clearMarks(svg) {
  svg.querySelectorAll('.muscle').forEach((p) => {
    p.removeAttribute('data-role');
    p.removeAttribute('data-heat');
    p.style.fillOpacity = '';
  });
}

/** Highlight primary (strong + glow) and secondary (tint) muscle ids. */
export function highlight(svg, { primary = [], secondary = [] } = {}) {
  clearMarks(svg);
  for (const id of secondary) paths(svg, id).forEach((p) => (p.dataset.role = 'secondary'));
  for (const id of primary) paths(svg, id).forEach((p) => (p.dataset.role = 'primary'));
  return svg;
}

/** Continuous heat: { muscleId: load } shaded by load / max. */
export function heatContinuous(svg, loads) {
  clearMarks(svg);
  const max = Math.max(1, ...Object.values(loads));
  for (const [id, v] of Object.entries(loads)) {
    if (!v) continue;
    const t = Math.min(1, v / max);
    paths(svg, id).forEach((p) => { p.dataset.heat = '1'; p.style.fillOpacity = String(0.25 + 0.75 * t); });
  }
  return svg;
}

/** Legacy 3-level heat (kept for compatibility). */
export function heat(svg, levels) {
  return heatContinuous(svg, Object.fromEntries(Object.entries(levels).map(([k, l]) => [k, l])));
}

/** Mark one muscle as selected (or none). */
export function select(svg, id) {
  svg.querySelectorAll('.muscle[data-selected]').forEach((p) => p.removeAttribute('data-selected'));
  if (id) paths(svg, id).forEach((p) => (p.dataset.selected = '1'));
}

/** Tap handler: cb(muscleId) when a muscle path is tapped. */
export function onMuscleTap(svg, cb) {
  svg.addEventListener('click', (e) => {
    const p = e.target.closest && e.target.closest('.muscle');
    if (p) cb(p.dataset.muscle);
  });
}

/** Combine muscle sets from a list of exercises (primary wins over secondary). */
export function combineMuscles(exercises) {
  const primary = new Set();
  const secondary = new Set();
  for (const ex of exercises) {
    if (!ex) continue;
    (ex.primary || []).forEach((m) => primary.add(m));
    (ex.secondary || []).forEach((m) => secondary.add(m));
  }
  for (const m of primary) secondary.delete(m);
  return { primary: [...primary], secondary: [...secondary] };
}
