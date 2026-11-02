/* ==========================================================================
   data.js — built-in reference data: muscle groups, equipment catalog,
   exercise library (~70 movements) and split presets. Nothing here is
   persisted; user edits are stored as overrides in db.exercises / copies in
   db.splits.

   Exercise shape:
     { id, name, equipment,          // equipment: display category
       primary[], secondary[],        // muscle ids
       restSec|null,                  // null = global default
       equip: [[...ids], [...ids]],   // alternative requirement sets: the
                                      // exercise is available if ANY set is
                                      // fully present in the gym
       pattern,                       // movement pattern (for substitution)
       kind: 'compound' | 'isolation',
       builtin: true }
   ========================================================================== */

export const MUSCLES = [
  { id: 'chest',       name: 'Chest' },
  { id: 'front-delts', name: 'Front delts' },
  { id: 'side-delts',  name: 'Side delts' },
  { id: 'rear-delts',  name: 'Rear delts' },
  { id: 'biceps',      name: 'Biceps' },
  { id: 'triceps',     name: 'Triceps' },
  { id: 'forearms',    name: 'Forearms' },
  { id: 'abs',         name: 'Abs' },
  { id: 'obliques',    name: 'Obliques' },
  { id: 'upper-back',  name: 'Upper back / traps' },
  { id: 'lats',        name: 'Lats' },
  { id: 'lower-back',  name: 'Lower back' },
  { id: 'glutes',      name: 'Glutes' },
  { id: 'quads',       name: 'Quads' },
  { id: 'hamstrings',  name: 'Hamstrings' },
  { id: 'calves',      name: 'Calves' },
];

export const MUSCLE_NAME = Object.fromEntries(MUSCLES.map((m) => [m.id, m.name]));

/** Display categories (kept from v1 for the library filter). */
export const EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'other'];

/* Equipment catalog. `cost` ranks how cheap/easy a piece is to add, used to
   suggest the cheapest fix for an untrainable muscle (lower = cheaper). */
export const EQUIPMENT_TYPES = [
  { id: 'bodyweight',   name: 'Bodyweight',          category: 'free',    cost: 0, always: true },
  { id: 'bands',        name: 'Resistance bands',    category: 'free',    cost: 1 },
  { id: 'pullup-bar',   name: 'Pull-up bar',         category: 'free',    cost: 2 },
  { id: 'kettlebell',   name: 'Kettlebell',          category: 'free',    cost: 2 },
  { id: 'dumbbells',    name: 'Dumbbells',           category: 'free',    cost: 3 },
  { id: 'ez-bar',       name: 'EZ bar',              category: 'free',    cost: 3 },
  { id: 'flat-bench',   name: 'Flat bench',          category: 'bench',   cost: 3 },
  { id: 'adj-bench',    name: 'Adjustable bench',    category: 'bench',   cost: 4 },
  { id: 'dip-station',  name: 'Dip station',         category: 'bench',   cost: 4 },
  { id: 'barbell',      name: 'Barbell',             category: 'free',    cost: 5 },
  { id: 'rack',         name: 'Squat / power rack',  category: 'rack',    cost: 6 },
  { id: 'cable-single', name: 'Cable stack',         category: 'cable',   cost: 7 },
  { id: 'lat-pulldown', name: 'Lat pulldown',        category: 'machine', cost: 7 },
  { id: 'row-machine',  name: 'Seated row machine',  category: 'machine', cost: 7 },
  { id: 'leg-ext',      name: 'Leg extension',       category: 'machine', cost: 7 },
  { id: 'leg-curl',     name: 'Leg curl',            category: 'machine', cost: 7 },
  { id: 'chest-press',  name: 'Chest press machine', category: 'machine', cost: 7 },
  { id: 'leg-press',    name: 'Leg press',           category: 'machine', cost: 8 },
  { id: 'cable-dual',   name: 'Cable crossover',     category: 'cable',   cost: 8 },
  { id: 'smith',        name: 'Smith machine',       category: 'rack',    cost: 8 },
];

export const EQUIPMENT_BY_ID = Object.fromEntries(EQUIPMENT_TYPES.map((e) => [e.id, e]));
export const ALL_EQUIPMENT_IDS = EQUIPMENT_TYPES.map((e) => e.id);

/* Movement patterns used for substitution and de-duplication. */
export const PATTERNS = {
  'h-push': 'Horizontal push', 'incline-push': 'Incline push', 'v-push': 'Vertical push', 'dip': 'Dip',
  'fly': 'Fly', 'lateral-raise': 'Lateral raise', 'front-raise': 'Front raise', 'rear-fly': 'Rear fly',
  'h-pull': 'Horizontal pull', 'v-pull': 'Vertical pull', 'shrug': 'Shrug', 'upright-row': 'Upright row',
  'hinge': 'Hip hinge', 'squat': 'Squat', 'lunge': 'Lunge', 'hip-thrust': 'Hip thrust', 'leg-curl': 'Knee flexion', 'leg-ext': 'Knee extension', 'calf': 'Calf raise',
  'curl': 'Curl', 'extension': 'Triceps extension', 'wrist': 'Wrist',
  'flexion': 'Trunk flexion', 'anti-extension': 'Anti-extension', 'anti-lateral': 'Anti-lateral flexion', 'rotation': 'Rotation', 'swing': 'Swing',
};

const E = (id, name, equipment, primary, secondary, restSec, equip, pattern, kind) =>
  ({ id, name, equipment, primary, secondary, restSec, equip, pattern, kind, builtin: true });

const BENCH = [['flat-bench'], ['adj-bench']];
const CABLE_OR_BANDS = [['cable-single'], ['cable-dual'], ['bands']];

export const BUILTIN_EXERCISES = [
  // ---- Chest ----
  E('bench-press',            'Bench Press',                 'barbell',    ['chest'], ['front-delts', 'triceps'], 150, [['barbell', 'flat-bench'], ['barbell', 'adj-bench']], 'h-push', 'compound'),
  E('incline-bench-press',    'Incline Bench Press',         'barbell',    ['chest', 'front-delts'], ['triceps'], 150, [['barbell', 'adj-bench']], 'incline-push', 'compound'),
  E('dumbbell-bench-press',   'Dumbbell Bench Press',        'dumbbell',   ['chest'], ['front-delts', 'triceps'], 120, [['dumbbells', 'flat-bench'], ['dumbbells', 'adj-bench']], 'h-push', 'compound'),
  E('incline-dumbbell-press', 'Incline Dumbbell Press',      'dumbbell',   ['chest', 'front-delts'], ['triceps'], 120, [['dumbbells', 'adj-bench']], 'incline-push', 'compound'),
  E('smith-bench-press',      'Smith Machine Bench Press',   'machine',    ['chest'], ['front-delts', 'triceps'], 120, [['smith', 'flat-bench'], ['smith', 'adj-bench']], 'h-push', 'compound'),
  E('dumbbell-fly',           'Dumbbell Fly',                'dumbbell',   ['chest'], ['front-delts'], null, [['dumbbells', 'flat-bench'], ['dumbbells', 'adj-bench']], 'fly', 'isolation'),
  E('cable-fly',              'Cable Fly',                   'cable',      ['chest'], ['front-delts'], null, [['cable-dual'], ['cable-single'], ['bands']], 'fly', 'isolation'),
  E('chest-press-machine',    'Chest Press Machine',         'machine',    ['chest'], ['front-delts', 'triceps'], null, [['chest-press']], 'h-push', 'compound'),
  E('pec-deck',               'Pec Deck',                    'machine',    ['chest'], [], null, [['chest-press']], 'fly', 'isolation'),
  E('push-up',                'Push-Up',                     'bodyweight', ['chest'], ['front-delts', 'triceps', 'abs'], 60, [['bodyweight']], 'h-push', 'compound'),
  E('dip',                    'Dip',                         'bodyweight', ['chest', 'triceps'], ['front-delts'], 120, [['dip-station']], 'dip', 'compound'),

  // ---- Shoulders ----
  E('overhead-press',         'Overhead Press',              'barbell',    ['front-delts', 'side-delts'], ['triceps', 'upper-back'], 150, [['barbell']], 'v-push', 'compound'),
  E('dumbbell-shoulder-press','Dumbbell Shoulder Press',     'dumbbell',   ['front-delts', 'side-delts'], ['triceps'], 120, [['dumbbells']], 'v-push', 'compound'),
  E('arnold-press',           'Arnold Press',                'dumbbell',   ['front-delts', 'side-delts'], ['triceps'], 120, [['dumbbells']], 'v-push', 'compound'),
  E('pike-push-up',           'Pike Push-Up',                'bodyweight', ['front-delts', 'side-delts'], ['triceps'], 60, [['bodyweight']], 'v-push', 'compound'),
  E('lateral-raise',          'Lateral Raise',               'dumbbell',   ['side-delts'], ['upper-back'], 60, [['dumbbells']], 'lateral-raise', 'isolation'),
  E('cable-lateral-raise',    'Cable Lateral Raise',         'cable',      ['side-delts'], [], 60, CABLE_OR_BANDS, 'lateral-raise', 'isolation'),
  E('front-raise',            'Front Raise',                 'dumbbell',   ['front-delts'], ['side-delts'], 60, [['dumbbells'], ['barbell'], ['bands'], ['kettlebell']], 'front-raise', 'isolation'),
  E('rear-delt-fly',          'Rear Delt Fly',               'dumbbell',   ['rear-delts'], ['upper-back'], 60, [['dumbbells']], 'rear-fly', 'isolation'),
  E('face-pull',              'Face Pull',                   'cable',      ['rear-delts', 'upper-back'], ['side-delts'], 60, CABLE_OR_BANDS, 'rear-fly', 'isolation'),
  E('band-pull-apart',        'Band Pull-Apart',             'other',      ['rear-delts'], ['upper-back'], 45, [['bands']], 'rear-fly', 'isolation'),
  E('reverse-pec-deck',       'Reverse Pec Deck',            'machine',    ['rear-delts'], ['upper-back'], 60, [['chest-press']], 'rear-fly', 'isolation'),
  E('upright-row',            'Upright Row',                 'barbell',    ['side-delts', 'upper-back'], ['biceps', 'forearms'], null, [['barbell'], ['ez-bar'], ['dumbbells'], ['kettlebell']], 'upright-row', 'isolation'),

  // ---- Back ----
  E('deadlift',               'Deadlift',                    'barbell',    ['lower-back', 'glutes', 'hamstrings'], ['upper-back', 'lats', 'forearms', 'quads'], 180, [['barbell']], 'hinge', 'compound'),
  E('rack-pull',              'Rack Pull',                   'barbell',    ['upper-back', 'lower-back'], ['glutes', 'hamstrings', 'forearms'], 150, [['barbell', 'rack']], 'hinge', 'compound'),
  E('barbell-row',            'Barbell Row',                 'barbell',    ['lats', 'upper-back'], ['biceps', 'rear-delts', 'lower-back'], 120, [['barbell']], 'h-pull', 'compound'),
  E('pull-up',                'Pull-Up',                     'bodyweight', ['lats'], ['biceps', 'upper-back', 'forearms'], 120, [['pullup-bar']], 'v-pull', 'compound'),
  E('chin-up',                'Chin-Up',                     'bodyweight', ['lats', 'biceps'], ['upper-back', 'forearms'], 120, [['pullup-bar']], 'v-pull', 'compound'),
  E('lat-pulldown',           'Lat Pulldown',                'cable',      ['lats'], ['biceps', 'upper-back'], 90, [['lat-pulldown']], 'v-pull', 'compound'),
  E('band-pulldown',          'Band Pulldown',               'other',      ['lats'], ['biceps', 'upper-back'], 60, [['bands']], 'v-pull', 'compound'),
  E('seated-cable-row',       'Seated Cable Row',            'cable',      ['upper-back', 'lats'], ['biceps', 'rear-delts'], 90, [['row-machine'], ['cable-single']], 'h-pull', 'compound'),
  E('dumbbell-row',           'Dumbbell Row',                'dumbbell',   ['lats', 'upper-back'], ['biceps', 'rear-delts'], 90, [['dumbbells']], 'h-pull', 'compound'),
  E('band-row',               'Band Row',                    'other',      ['upper-back', 'lats'], ['biceps', 'rear-delts'], 60, [['bands']], 'h-pull', 'compound'),
  E('inverted-row',           'Inverted Row',                'bodyweight', ['upper-back', 'lats'], ['biceps', 'rear-delts'], 90, [['rack'], ['smith'], ['dip-station']], 'h-pull', 'compound'),
  E('t-bar-row',              'T-Bar Row',                   'machine',    ['upper-back', 'lats'], ['biceps', 'rear-delts'], 120, [['barbell']], 'h-pull', 'compound'),
  E('chest-supported-row',    'Chest-Supported Row',         'machine',    ['upper-back', 'lats'], ['biceps', 'rear-delts'], 90, [['row-machine'], ['dumbbells', 'adj-bench']], 'h-pull', 'compound'),
  E('straight-arm-pulldown',  'Straight-Arm Pulldown',       'cable',      ['lats'], ['triceps'], 60, CABLE_OR_BANDS, 'v-pull', 'isolation'),
  E('shrug',                  'Shrug',                       'barbell',    ['upper-back'], ['forearms'], 60, [['barbell'], ['dumbbells'], ['smith'], ['kettlebell']], 'shrug', 'isolation'),
  E('hyperextension',         'Back Extension',              'bodyweight', ['lower-back'], ['glutes', 'hamstrings'], 60, [['bodyweight']], 'hinge', 'isolation'),

  // ---- Arms ----
  E('barbell-curl',           'Barbell Curl',                'barbell',    ['biceps'], ['forearms'], 60, [['barbell'], ['ez-bar']], 'curl', 'isolation'),
  E('dumbbell-curl',          'Dumbbell Curl',               'dumbbell',   ['biceps'], ['forearms'], 60, [['dumbbells']], 'curl', 'isolation'),
  E('hammer-curl',            'Hammer Curl',                 'dumbbell',   ['biceps', 'forearms'], [], 60, [['dumbbells']], 'curl', 'isolation'),
  E('incline-dumbbell-curl',  'Incline Dumbbell Curl',       'dumbbell',   ['biceps'], ['forearms'], 60, [['dumbbells', 'adj-bench']], 'curl', 'isolation'),
  E('preacher-curl',          'Preacher Curl',               'machine',    ['biceps'], ['forearms'], 60, [['ez-bar', 'adj-bench'], ['dumbbells', 'adj-bench']], 'curl', 'isolation'),
  E('cable-curl',             'Cable Curl',                  'cable',      ['biceps'], ['forearms'], 60, CABLE_OR_BANDS, 'curl', 'isolation'),
  E('skull-crusher',          'Skull Crusher',               'barbell',    ['triceps'], [], 90, [['ez-bar', 'flat-bench'], ['ez-bar', 'adj-bench'], ['barbell', 'flat-bench'], ['dumbbells', 'flat-bench'], ['dumbbells', 'adj-bench']], 'extension', 'isolation'),
  E('triceps-pushdown',       'Triceps Pushdown',            'cable',      ['triceps'], [], 60, CABLE_OR_BANDS, 'extension', 'isolation'),
  E('overhead-triceps-extension', 'Overhead Triceps Extension', 'dumbbell', ['triceps'], [], 60, [['dumbbells'], ['cable-single'], ['bands'], ['kettlebell']], 'extension', 'isolation'),
  E('close-grip-bench-press', 'Close-Grip Bench Press',      'barbell',    ['triceps'], ['chest', 'front-delts'], 120, [['barbell', 'flat-bench'], ['barbell', 'adj-bench'], ['smith', 'flat-bench']], 'h-push', 'compound'),
  E('bench-dip',              'Bench Dip',                   'bodyweight', ['triceps'], ['chest', 'front-delts'], 60, [['flat-bench'], ['adj-bench']], 'dip', 'compound'),
  E('wrist-curl',             'Wrist Curl',                  'dumbbell',   ['forearms'], [], 45, [['dumbbells'], ['barbell'], ['ez-bar']], 'wrist', 'isolation'),
  E('reverse-curl',           'Reverse Curl',                'barbell',    ['forearms'], ['biceps'], 60, [['barbell'], ['ez-bar'], ['dumbbells'], ['bands']], 'curl', 'isolation'),

  // ---- Legs ----
  E('squat',                  'Back Squat',                  'barbell',    ['quads', 'glutes'], ['hamstrings', 'lower-back', 'abs'], 180, [['barbell', 'rack']], 'squat', 'compound'),
  E('front-squat',            'Front Squat',                 'barbell',    ['quads'], ['glutes', 'abs', 'upper-back'], 150, [['barbell', 'rack']], 'squat', 'compound'),
  E('smith-squat',            'Smith Machine Squat',         'machine',    ['quads', 'glutes'], ['hamstrings'], 150, [['smith']], 'squat', 'compound'),
  E('goblet-squat',           'Goblet Squat',                'dumbbell',   ['quads', 'glutes'], ['abs'], 90, [['dumbbells'], ['kettlebell']], 'squat', 'compound'),
  E('bodyweight-squat',       'Bodyweight Squat',            'bodyweight', ['quads', 'glutes'], ['hamstrings'], 60, [['bodyweight']], 'squat', 'compound'),
  E('leg-press',              'Leg Press',                   'machine',    ['quads', 'glutes'], ['hamstrings'], 120, [['leg-press']], 'squat', 'compound'),
  E('hack-squat',             'Hack Squat',                  'machine',    ['quads'], ['glutes'], 120, [['smith']], 'squat', 'compound'),
  E('romanian-deadlift',      'Romanian Deadlift',           'barbell',    ['hamstrings', 'glutes'], ['lower-back', 'forearms'], 150, [['barbell'], ['dumbbells'], ['kettlebell']], 'hinge', 'compound'),
  E('sumo-deadlift',          'Sumo Deadlift',               'barbell',    ['glutes', 'hamstrings', 'quads'], ['lower-back', 'upper-back', 'forearms'], 180, [['barbell']], 'hinge', 'compound'),
  E('kettlebell-swing',       'Kettlebell Swing',            'other',      ['glutes', 'hamstrings'], ['lower-back', 'abs'], 90, [['kettlebell'], ['dumbbells']], 'swing', 'compound'),
  E('leg-curl',               'Leg Curl',                    'machine',    ['hamstrings'], ['calves'], 90, [['leg-curl']], 'leg-curl', 'isolation'),
  E('nordic-curl',            'Nordic Curl',                 'bodyweight', ['hamstrings'], ['glutes'], 90, [['bodyweight']], 'leg-curl', 'isolation'),
  E('band-leg-curl',          'Band Leg Curl',               'other',      ['hamstrings'], [], 60, [['bands']], 'leg-curl', 'isolation'),
  E('leg-extension',          'Leg Extension',               'machine',    ['quads'], [], 90, [['leg-ext']], 'leg-ext', 'isolation'),
  E('bulgarian-split-squat',  'Bulgarian Split Squat',       'dumbbell',   ['quads', 'glutes'], ['hamstrings'], 90, [['flat-bench'], ['adj-bench']], 'lunge', 'compound'),
  E('walking-lunge',          'Walking Lunge',               'dumbbell',   ['quads', 'glutes'], ['hamstrings', 'calves'], 90, [['bodyweight']], 'lunge', 'compound'),
  E('hip-thrust',             'Hip Thrust',                  'barbell',    ['glutes'], ['hamstrings'], 120, [['flat-bench'], ['adj-bench']], 'hip-thrust', 'compound'),
  E('glute-bridge',           'Glute Bridge',                'bodyweight', ['glutes'], ['hamstrings'], 60, [['bodyweight']], 'hip-thrust', 'isolation'),
  E('standing-calf-raise',    'Standing Calf Raise',         'machine',    ['calves'], [], 60, [['bodyweight']], 'calf', 'isolation'),
  E('seated-calf-raise',      'Seated Calf Raise',           'machine',    ['calves'], [], 60, [['dumbbells', 'flat-bench'], ['dumbbells', 'adj-bench'], ['smith', 'flat-bench']], 'calf', 'isolation'),

  // ---- Core ----
  E('plank',                  'Plank',                       'bodyweight', ['abs'], ['obliques'], 60, [['bodyweight']], 'anti-extension', 'isolation'),
  E('side-plank',             'Side Plank',                  'bodyweight', ['obliques'], ['abs'], 45, [['bodyweight']], 'anti-lateral', 'isolation'),
  E('crunch',                 'Crunch',                      'bodyweight', ['abs'], [], 45, [['bodyweight']], 'flexion', 'isolation'),
  E('hanging-leg-raise',      'Hanging Leg Raise',           'bodyweight', ['abs'], ['obliques', 'forearms'], 60, [['pullup-bar']], 'flexion', 'isolation'),
  E('cable-crunch',           'Cable Crunch',                'cable',      ['abs'], ['obliques'], 60, CABLE_OR_BANDS, 'flexion', 'isolation'),
  E('ab-wheel-rollout',       'Ab Wheel Rollout',            'other',      ['abs'], ['lats', 'obliques'], 60, [['barbell'], ['bodyweight']], 'anti-extension', 'isolation'),
  E('russian-twist',          'Russian Twist',               'bodyweight', ['obliques'], ['abs'], 45, [['bodyweight']], 'rotation', 'isolation'),
];

/* Setup time: 0 = grab and go (pin stacks, dumbbells, cables, bodyweight),
   1 = a bench to adjust or a light bar to load, 2 = plate loading / racks.
   The "quick setup" training style avoids level 2 and prefers level 0. */
const SLOW_SETUP = new Set(['deadlift', 'sumo-deadlift', 'rack-pull', 'squat', 'front-squat', 'smith-squat', 'hack-squat', 'leg-press', 'romanian-deadlift', 'hip-thrust',
  'bench-press', 'incline-bench-press', 'smith-bench-press', 'close-grip-bench-press', 'overhead-press', 'barbell-row', 't-bar-row']);
const SOME_SETUP = new Set(['dumbbell-bench-press', 'incline-dumbbell-press', 'skull-crusher', 'barbell-curl', 'preacher-curl', 'upright-row', 'shrug', 'bulgarian-split-squat',
  'seated-calf-raise', 'reverse-curl', 'wrist-curl', 'incline-dumbbell-curl', 'chest-supported-row', 'dumbbell-fly', 'inverted-row', 'kettlebell-swing']);
for (const ex of BUILTIN_EXERCISES) ex.setup = SLOW_SETUP.has(ex.id) ? 2 : SOME_SETUP.has(ex.id) ? 1 : 0;

/** Setup level for any exercise (customs fall back to their equipment category). */
export function setupOf(ex) {
  if (!ex) return 0;
  if (ex.setup != null) return Math.min(2, Math.max(0, Number(ex.setup) || 0));
  return ex.equipment === 'barbell' ? 2 : ex.equipment === 'machine' ? 1 : 0;
}

/* Split presets. Each day lists target muscles plus a preferred exercise
   order; the engine falls back to targets when equipment is missing. Two- and
   three-day splits carry A/B variants so the second time a day comes round
   in the week it trains the same muscles with different exercises. */
const D = (id, name, targets, exerciseIds) => ({ id, name, targets, exerciseIds });

export const DAY_TARGETS = {
  push:  ['chest', 'front-delts', 'side-delts', 'triceps'],
  pull:  ['lats', 'upper-back', 'rear-delts', 'biceps'],
  legs:  ['quads', 'hamstrings', 'glutes', 'calves'],
  upper: ['chest', 'lats', 'upper-back', 'side-delts', 'biceps', 'triceps'],
  lower: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'],
  full:  ['quads', 'chest', 'lats', 'hamstrings', 'side-delts', 'abs'],
};

export const PRESET_SPLITS = [
  {
    id: 'preset-ppl', name: 'Push / Pull / Legs',
    days: [
      D('push-a', 'Push A', DAY_TARGETS.push, ['bench-press', 'overhead-press', 'incline-dumbbell-press', 'lateral-raise', 'triceps-pushdown', 'overhead-triceps-extension']),
      D('pull-a', 'Pull A', [...DAY_TARGETS.pull, 'lower-back'], ['deadlift', 'pull-up', 'barbell-row', 'face-pull', 'barbell-curl', 'hammer-curl']),
      D('legs-a', 'Legs A', [...DAY_TARGETS.legs, 'abs'], ['squat', 'romanian-deadlift', 'leg-press', 'leg-curl', 'standing-calf-raise', 'hanging-leg-raise']),
      D('push-b', 'Push B', DAY_TARGETS.push, ['incline-bench-press', 'dumbbell-shoulder-press', 'dip', 'cable-fly', 'cable-lateral-raise', 'skull-crusher']),
      D('pull-b', 'Pull B', DAY_TARGETS.pull, ['lat-pulldown', 'seated-cable-row', 'dumbbell-row', 'rear-delt-fly', 'incline-dumbbell-curl', 'cable-curl']),
      D('legs-b', 'Legs B', [...DAY_TARGETS.legs, 'abs'], ['leg-press', 'hip-thrust', 'bulgarian-split-squat', 'leg-extension', 'seated-calf-raise', 'cable-crunch']),
    ],
  },
  {
    id: 'preset-ul', name: 'Upper / Lower',
    days: [
      D('upper-a', 'Upper A', DAY_TARGETS.upper, ['bench-press', 'barbell-row', 'overhead-press', 'lat-pulldown', 'dumbbell-curl', 'triceps-pushdown']),
      D('lower-a', 'Lower A', DAY_TARGETS.lower, ['squat', 'romanian-deadlift', 'leg-press', 'leg-curl', 'standing-calf-raise', 'plank']),
      D('upper-b', 'Upper B', [...DAY_TARGETS.upper, 'rear-delts'], ['incline-dumbbell-press', 'seated-cable-row', 'dumbbell-shoulder-press', 'pull-up', 'face-pull', 'hammer-curl', 'skull-crusher']),
      D('lower-b', 'Lower B', DAY_TARGETS.lower, ['leg-press', 'hip-thrust', 'bulgarian-split-squat', 'leg-extension', 'seated-calf-raise', 'hanging-leg-raise']),
    ],
  },
  {
    id: 'preset-fb', name: 'Full Body',
    days: [
      D('a', 'Full Body A', ['quads', 'chest', 'lats', 'side-delts', 'abs'], ['squat', 'bench-press', 'barbell-row', 'lateral-raise', 'plank']),
      D('b', 'Full Body B', ['hamstrings', 'front-delts', 'lats', 'quads', 'biceps'], ['deadlift', 'overhead-press', 'pull-up', 'leg-press', 'dumbbell-curl']),
      D('c', 'Full Body C', ['quads', 'chest', 'upper-back', 'hamstrings', 'triceps'], ['front-squat', 'incline-dumbbell-press', 'seated-cable-row', 'romanian-deadlift', 'triceps-pushdown']),
    ],
  },
  {
    id: 'preset-ap', name: 'Anterior / Posterior',
    days: [
      D('ant-a', 'Anterior A', ['quads', 'chest', 'front-delts', 'side-delts', 'biceps', 'abs'], ['squat', 'bench-press', 'overhead-press', 'leg-extension', 'lateral-raise', 'barbell-curl', 'cable-crunch']),
      D('post-a', 'Posterior A', ['hamstrings', 'glutes', 'lats', 'upper-back', 'rear-delts', 'triceps', 'lower-back'], ['deadlift', 'barbell-row', 'pull-up', 'leg-curl', 'face-pull', 'hip-thrust', 'triceps-pushdown']),
      D('ant-b', 'Anterior B', ['quads', 'chest', 'front-delts', 'side-delts', 'biceps', 'abs'], ['leg-press', 'incline-dumbbell-press', 'dumbbell-shoulder-press', 'bulgarian-split-squat', 'cable-lateral-raise', 'incline-dumbbell-curl', 'hanging-leg-raise']),
      D('post-b', 'Posterior B', ['hamstrings', 'glutes', 'lats', 'upper-back', 'rear-delts', 'triceps', 'calves'], ['romanian-deadlift', 'lat-pulldown', 'chest-supported-row', 'kettlebell-swing', 'rear-delt-fly', 'skull-crusher', 'standing-calf-raise']),
    ],
  },
  {
    id: 'preset-bro', name: 'Bro Split',
    days: [
      D('chest', 'Chest', ['chest'], ['bench-press', 'incline-dumbbell-press', 'cable-fly', 'dip', 'pec-deck']),
      D('back', 'Back', ['lats', 'upper-back', 'lower-back'], ['deadlift', 'pull-up', 'barbell-row', 'seated-cable-row', 'straight-arm-pulldown']),
      D('shoulders', 'Shoulders', ['front-delts', 'side-delts', 'rear-delts', 'upper-back'], ['overhead-press', 'lateral-raise', 'rear-delt-fly', 'front-raise', 'shrug']),
      D('arms', 'Arms', ['biceps', 'triceps', 'forearms'], ['barbell-curl', 'skull-crusher', 'hammer-curl', 'triceps-pushdown', 'incline-dumbbell-curl', 'overhead-triceps-extension']),
      D('legs', 'Legs', DAY_TARGETS.legs, ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'leg-extension', 'standing-calf-raise']),
    ],
  },
];
