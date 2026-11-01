/* ==========================================================================
   data.js — built-in reference data: muscle groups, equipment, exercise
   library (~65 movements) and split presets. Nothing here is persisted;
   user edits are stored as overrides in db.exercises / copies in db.splits.
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

export const EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'other'];

/* Exercise shape: { id, name, equipment, primary[], secondary[], restSec|null, builtin: true }
   restSec null means "use the global default". */
const E = (id, name, equipment, primary, secondary = [], restSec = null) =>
  ({ id, name, equipment, primary, secondary, restSec, builtin: true });

export const BUILTIN_EXERCISES = [
  // ---- Chest ----
  E('bench-press',            'Bench Press',                 'barbell',    ['chest'], ['front-delts', 'triceps'], 150),
  E('incline-bench-press',    'Incline Bench Press',         'barbell',    ['chest', 'front-delts'], ['triceps'], 150),
  E('dumbbell-bench-press',   'Dumbbell Bench Press',        'dumbbell',   ['chest'], ['front-delts', 'triceps'], 120),
  E('incline-dumbbell-press', 'Incline Dumbbell Press',      'dumbbell',   ['chest', 'front-delts'], ['triceps'], 120),
  E('dumbbell-fly',           'Dumbbell Fly',                'dumbbell',   ['chest'], ['front-delts']),
  E('cable-fly',              'Cable Fly',                   'cable',      ['chest'], ['front-delts']),
  E('chest-press-machine',    'Chest Press Machine',         'machine',    ['chest'], ['front-delts', 'triceps']),
  E('pec-deck',               'Pec Deck',                    'machine',    ['chest'], []),
  E('push-up',                'Push-Up',                     'bodyweight', ['chest'], ['front-delts', 'triceps', 'abs'], 60),
  E('dip',                    'Dip',                         'bodyweight', ['chest', 'triceps'], ['front-delts'], 120),

  // ---- Shoulders ----
  E('overhead-press',         'Overhead Press',              'barbell',    ['front-delts', 'side-delts'], ['triceps', 'upper-back'], 150),
  E('dumbbell-shoulder-press','Dumbbell Shoulder Press',     'dumbbell',   ['front-delts', 'side-delts'], ['triceps'], 120),
  E('arnold-press',           'Arnold Press',                'dumbbell',   ['front-delts', 'side-delts'], ['triceps'], 120),
  E('lateral-raise',          'Lateral Raise',               'dumbbell',   ['side-delts'], ['upper-back'], 60),
  E('cable-lateral-raise',    'Cable Lateral Raise',         'cable',      ['side-delts'], [], 60),
  E('front-raise',            'Front Raise',                 'dumbbell',   ['front-delts'], ['side-delts'], 60),
  E('rear-delt-fly',          'Rear Delt Fly',               'dumbbell',   ['rear-delts'], ['upper-back'], 60),
  E('face-pull',              'Face Pull',                   'cable',      ['rear-delts', 'upper-back'], ['side-delts'], 60),
  E('reverse-pec-deck',       'Reverse Pec Deck',            'machine',    ['rear-delts'], ['upper-back'], 60),
  E('upright-row',            'Upright Row',                 'barbell',    ['side-delts', 'upper-back'], ['biceps', 'forearms']),

  // ---- Back ----
  E('deadlift',               'Deadlift',                    'barbell',    ['lower-back', 'glutes', 'hamstrings'], ['upper-back', 'lats', 'forearms', 'quads'], 180),
  E('rack-pull',              'Rack Pull',                   'barbell',    ['upper-back', 'lower-back'], ['glutes', 'hamstrings', 'forearms'], 150),
  E('barbell-row',            'Barbell Row',                 'barbell',    ['lats', 'upper-back'], ['biceps', 'rear-delts', 'lower-back'], 120),
  E('pull-up',                'Pull-Up',                     'bodyweight', ['lats'], ['biceps', 'upper-back', 'forearms'], 120),
  E('chin-up',                'Chin-Up',                     'bodyweight', ['lats', 'biceps'], ['upper-back', 'forearms'], 120),
  E('lat-pulldown',           'Lat Pulldown',                'cable',      ['lats'], ['biceps', 'upper-back'], 90),
  E('seated-cable-row',       'Seated Cable Row',            'cable',      ['upper-back', 'lats'], ['biceps', 'rear-delts'], 90),
  E('dumbbell-row',           'Dumbbell Row',                'dumbbell',   ['lats', 'upper-back'], ['biceps', 'rear-delts'], 90),
  E('t-bar-row',              'T-Bar Row',                   'machine',    ['upper-back', 'lats'], ['biceps', 'rear-delts'], 120),
  E('chest-supported-row',    'Chest-Supported Row',         'machine',    ['upper-back', 'lats'], ['biceps', 'rear-delts'], 90),
  E('straight-arm-pulldown',  'Straight-Arm Pulldown',       'cable',      ['lats'], ['triceps'], 60),
  E('shrug',                  'Shrug',                       'barbell',    ['upper-back'], ['forearms'], 60),
  E('hyperextension',         'Back Extension',              'bodyweight', ['lower-back'], ['glutes', 'hamstrings'], 60),

  // ---- Arms ----
  E('barbell-curl',           'Barbell Curl',                'barbell',    ['biceps'], ['forearms'], 60),
  E('dumbbell-curl',          'Dumbbell Curl',               'dumbbell',   ['biceps'], ['forearms'], 60),
  E('hammer-curl',            'Hammer Curl',                 'dumbbell',   ['biceps', 'forearms'], [], 60),
  E('incline-dumbbell-curl',  'Incline Dumbbell Curl',       'dumbbell',   ['biceps'], ['forearms'], 60),
  E('preacher-curl',          'Preacher Curl',               'machine',    ['biceps'], ['forearms'], 60),
  E('cable-curl',             'Cable Curl',                  'cable',      ['biceps'], ['forearms'], 60),
  E('skull-crusher',          'Skull Crusher',               'barbell',    ['triceps'], [], 90),
  E('triceps-pushdown',       'Triceps Pushdown',            'cable',      ['triceps'], [], 60),
  E('overhead-triceps-extension', 'Overhead Triceps Extension', 'dumbbell', ['triceps'], [], 60),
  E('close-grip-bench-press', 'Close-Grip Bench Press',      'barbell',    ['triceps'], ['chest', 'front-delts'], 120),
  E('wrist-curl',             'Wrist Curl',                  'dumbbell',   ['forearms'], [], 45),
  E('reverse-curl',           'Reverse Curl',                'barbell',    ['forearms'], ['biceps'], 60),

  // ---- Legs ----
  E('squat',                  'Back Squat',                  'barbell',    ['quads', 'glutes'], ['hamstrings', 'lower-back', 'abs'], 180),
  E('front-squat',            'Front Squat',                 'barbell',    ['quads'], ['glutes', 'abs', 'upper-back'], 150),
  E('goblet-squat',           'Goblet Squat',                'dumbbell',   ['quads', 'glutes'], ['abs'], 90),
  E('leg-press',              'Leg Press',                   'machine',    ['quads', 'glutes'], ['hamstrings'], 120),
  E('hack-squat',             'Hack Squat',                  'machine',    ['quads'], ['glutes'], 120),
  E('romanian-deadlift',      'Romanian Deadlift',           'barbell',    ['hamstrings', 'glutes'], ['lower-back', 'forearms'], 150),
  E('sumo-deadlift',          'Sumo Deadlift',               'barbell',    ['glutes', 'hamstrings', 'quads'], ['lower-back', 'upper-back', 'forearms'], 180),
  E('leg-curl',               'Leg Curl',                    'machine',    ['hamstrings'], ['calves'], 90),
  E('leg-extension',          'Leg Extension',               'machine',    ['quads'], [], 90),
  E('bulgarian-split-squat',  'Bulgarian Split Squat',       'dumbbell',   ['quads', 'glutes'], ['hamstrings'], 90),
  E('walking-lunge',          'Walking Lunge',               'dumbbell',   ['quads', 'glutes'], ['hamstrings', 'calves'], 90),
  E('hip-thrust',             'Hip Thrust',                  'barbell',    ['glutes'], ['hamstrings'], 120),
  E('standing-calf-raise',    'Standing Calf Raise',         'machine',    ['calves'], [], 60),
  E('seated-calf-raise',      'Seated Calf Raise',           'machine',    ['calves'], [], 60),

  // ---- Core ----
  E('plank',                  'Plank',                       'bodyweight', ['abs'], ['obliques'], 60),
  E('side-plank',             'Side Plank',                  'bodyweight', ['obliques'], ['abs'], 45),
  E('crunch',                 'Crunch',                      'bodyweight', ['abs'], [], 45),
  E('hanging-leg-raise',      'Hanging Leg Raise',           'bodyweight', ['abs'], ['obliques', 'forearms'], 60),
  E('cable-crunch',           'Cable Crunch',                'cable',      ['abs'], ['obliques'], 60),
  E('ab-wheel-rollout',       'Ab Wheel Rollout',            'other',      ['abs'], ['lats', 'obliques'], 60),
  E('russian-twist',          'Russian Twist',               'bodyweight', ['obliques'], ['abs'], 45),
];

/* Split preset shape: { id, name, days: [{ id, name, exerciseIds[] }] } */
const D = (id, name, exerciseIds) => ({ id, name, exerciseIds });

export const PRESET_SPLITS = [
  {
    id: 'preset-ppl', name: 'Push / Pull / Legs',
    days: [
      D('push', 'Push', ['bench-press', 'overhead-press', 'incline-dumbbell-press', 'lateral-raise', 'triceps-pushdown', 'overhead-triceps-extension']),
      D('pull', 'Pull', ['deadlift', 'pull-up', 'barbell-row', 'face-pull', 'barbell-curl', 'hammer-curl']),
      D('legs', 'Legs', ['squat', 'romanian-deadlift', 'leg-press', 'leg-curl', 'standing-calf-raise', 'hanging-leg-raise']),
    ],
  },
  {
    id: 'preset-ul', name: 'Upper / Lower',
    days: [
      D('upper', 'Upper', ['bench-press', 'barbell-row', 'overhead-press', 'lat-pulldown', 'dumbbell-curl', 'triceps-pushdown']),
      D('lower', 'Lower', ['squat', 'romanian-deadlift', 'leg-press', 'leg-curl', 'standing-calf-raise', 'plank']),
    ],
  },
  {
    id: 'preset-fb', name: 'Full Body',
    days: [
      D('a', 'Full Body A', ['squat', 'bench-press', 'barbell-row', 'lateral-raise', 'plank']),
      D('b', 'Full Body B', ['deadlift', 'overhead-press', 'pull-up', 'leg-press', 'dumbbell-curl']),
      D('c', 'Full Body C', ['front-squat', 'incline-dumbbell-press', 'seated-cable-row', 'romanian-deadlift', 'triceps-pushdown']),
    ],
  },
  {
    id: 'preset-ap', name: 'Anterior / Posterior',
    days: [
      D('ant', 'Anterior', ['squat', 'bench-press', 'overhead-press', 'leg-extension', 'lateral-raise', 'cable-crunch']),
      D('post', 'Posterior', ['deadlift', 'barbell-row', 'pull-up', 'leg-curl', 'face-pull', 'hip-thrust']),
    ],
  },
  {
    id: 'preset-bro', name: 'Bro Split',
    days: [
      D('chest', 'Chest', ['bench-press', 'incline-dumbbell-press', 'cable-fly', 'dip', 'pec-deck']),
      D('back', 'Back', ['deadlift', 'pull-up', 'barbell-row', 'seated-cable-row', 'straight-arm-pulldown']),
      D('shoulders', 'Shoulders', ['overhead-press', 'lateral-raise', 'rear-delt-fly', 'front-raise', 'shrug']),
      D('arms', 'Arms', ['barbell-curl', 'skull-crusher', 'hammer-curl', 'triceps-pushdown', 'incline-dumbbell-curl', 'overhead-triceps-extension']),
      D('legs', 'Legs', ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'leg-extension', 'standing-calf-raise']),
    ],
  },
];
