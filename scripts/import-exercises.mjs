#!/usr/bin/env node
/* ==========================================================================
   scripts/import-exercises.mjs — one-off importer for exercise photos and
   instructions from the CC0 "free-exercise-db" dataset
   (https://github.com/yuhonas/free-exercise-db). Not used at runtime.

   Usage (from the project root):
     cd scripts && npm install && cd ..
     node scripts/import-exercises.mjs

   What it does:
   1. Downloads dist/exercises.json from the dataset.
   2. Matches every built-in exercise in js/data.js by name, using the
      ALIASES table below first, then a normalised-name match. Prints the
      unmatched ones with the three closest dataset names so you can add
      aliases.
   3. Downloads the matched exercises' images, resizes them to max 800px
      wide, compresses them with sharp, and writes exercises/<id>/0.jpg, 1.jpg.
   4. Writes js/generated/exercise-db.js with instructions, muscles mapped
      onto our ids, and the dataset's equipment label. Our own equipment
      mapping and muscle ids in data.js are never overwritten.
   5. Writes sw-media.js (precache list) and prints the size of /exercises.
   ========================================================================== */

import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { BUILTIN_EXERCISES } from '../js/data.js';

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require('sharp'); } catch { console.error('sharp is not installed. Run:  cd scripts && npm install'); process.exit(1); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';
const MAX_WIDTH = 800;
const JPEG_QUALITY = 72;

/* Our exercise id → dataset exercise name. Edit freely. */
const ALIASES = {
  'bench-press': 'Barbell Bench Press - Medium Grip',
  'incline-bench-press': 'Barbell Incline Bench Press - Medium Grip',
  'dumbbell-bench-press': 'Dumbbell Bench Press',
  'incline-dumbbell-press': 'Incline Dumbbell Press',
  'smith-bench-press': 'Smith Machine Bench Press',
  'dumbbell-fly': 'Dumbbell Flyes',
  'cable-fly': 'Cable Crossover',
  'chest-press-machine': 'Machine Bench Press',
  'pec-deck': 'Butterfly',
  'push-up': 'Pushups',
  'dip': 'Dips - Chest Version',
  'overhead-press': 'Standing Military Press',
  'dumbbell-shoulder-press': 'Dumbbell Shoulder Press',
  'arnold-press': 'Arnold Dumbbell Press',
  'pike-push-up': 'Handstand Push-Ups',
  'lateral-raise': 'Side Lateral Raise',
  'cable-lateral-raise': 'Cable Seated Lateral Raise',
  'front-raise': 'Front Dumbbell Raise',
  'rear-delt-fly': 'Seated Bent-Over Rear Delt Raise',
  'face-pull': 'Face Pull',
  'band-pull-apart': 'Band Pull Apart',
  'reverse-pec-deck': 'Reverse Machine Flyes',
  'upright-row': 'Upright Barbell Row',
  'deadlift': 'Barbell Deadlift',
  'rack-pull': 'Rack Pulls',
  'barbell-row': 'Bent Over Barbell Row',
  'pull-up': 'Pullups',
  'chin-up': 'Chin-Up',
  'lat-pulldown': 'Wide-Grip Lat Pulldown',
  'band-pulldown': 'Straight-Arm Pulldown',
  'seated-cable-row': 'Seated Cable Rows',
  'dumbbell-row': 'One-Arm Dumbbell Row',
  'band-row': 'Seated Cable Rows',
  'inverted-row': 'Inverted Row',
  't-bar-row': 'T-Bar Row with Handle',
  'chest-supported-row': 'Incline Bench Pull',
  'straight-arm-pulldown': 'Straight-Arm Pulldown',
  'shrug': 'Barbell Shrug',
  'hyperextension': 'Hyperextensions (Back Extensions)',
  'barbell-curl': 'Barbell Curl',
  'dumbbell-curl': 'Dumbbell Bicep Curl',
  'hammer-curl': 'Hammer Curls',
  'incline-dumbbell-curl': 'Incline Dumbbell Curl',
  'preacher-curl': 'Preacher Curl',
  'cable-curl': 'Standing Biceps Cable Curl',
  'skull-crusher': 'EZ-Bar Skullcrusher',
  'triceps-pushdown': 'Triceps Pushdown',
  'overhead-triceps-extension': 'Standing Dumbbell Triceps Extension',
  'close-grip-bench-press': 'Close-Grip Barbell Bench Press',
  'bench-dip': 'Bench Dips',
  'wrist-curl': 'Seated Palm-Up Barbell Wrist Curl',
  'reverse-curl': 'Reverse Barbell Curl',
  'squat': 'Barbell Squat',
  'front-squat': 'Front Barbell Squat',
  'smith-squat': 'Smith Machine Squat',
  'goblet-squat': 'Goblet Squat',
  'bodyweight-squat': 'Bodyweight Squat',
  'leg-press': 'Leg Press',
  'hack-squat': 'Hack Squat',
  'romanian-deadlift': 'Romanian Deadlift',
  'sumo-deadlift': 'Sumo Deadlift',
  'kettlebell-swing': 'One-Arm Kettlebell Swings',
  'leg-curl': 'Lying Leg Curls',
  'nordic-curl': 'Natural Glute Ham Raise',
  'band-leg-curl': 'Lying Leg Curls',
  'leg-extension': 'Leg Extensions',
  'bulgarian-split-squat': 'Split Squat with Dumbbells',
  'walking-lunge': 'Bodyweight Walking Lunge',
  'hip-thrust': 'Barbell Hip Thrust',
  'glute-bridge': 'Butt Lift (Bridge)',
  'standing-calf-raise': 'Standing Calf Raises',
  'seated-calf-raise': 'Seated Calf Raise',
  'plank': 'Plank',
  'side-plank': 'Side Bridge',
  'crunch': 'Crunches',
  'hanging-leg-raise': 'Hanging Leg Raise',
  'cable-crunch': 'Cable Crunch',
  'ab-wheel-rollout': 'Ab Roller',
  'russian-twist': 'Russian Twist',
};

/* Dataset muscle names → our muscle ids (null = no equivalent, skipped). */
const MUSCLE_MAP = {
  abdominals: 'abs', abductors: 'glutes', adductors: null, biceps: 'biceps', calves: 'calves', chest: 'chest',
  forearms: 'forearms', glutes: 'glutes', hamstrings: 'hamstrings', lats: 'lats', 'lower back': 'lower-back',
  'middle back': 'upper-back', neck: null, quadriceps: 'quads', shoulders: 'front-delts', traps: 'upper-back', triceps: 'triceps',
};

const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|with|a)\b/g, '').replace(/s\b/g, '').replace(/\s+/g, ' ').trim();

function similarity(a, b) {
  const A = new Set(norm(a).split(' ')), B = new Set(norm(b).split(' '));
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / Math.max(1, new Set([...A, ...B]).size);
}

async function dirSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return total;
}

async function main() {
  console.log('Downloading dataset index…');
  const res = await fetch(`${RAW}/dist/exercises.json`);
  if (!res.ok) throw new Error(`Failed to download exercises.json: ${res.status}`);
  const dataset = await res.json();
  const byName = new Map(dataset.map((e) => [e.name, e]));
  const byNorm = new Map(dataset.map((e) => [norm(e.name), e]));
  console.log(`Dataset has ${dataset.length} exercises.`);

  const matched = [];
  const unmatched = [];
  for (const ex of BUILTIN_EXERCISES) {
    const alias = ALIASES[ex.id];
    let hit = alias ? byName.get(alias) : null;
    if (alias && !hit) console.warn(`  alias not found in dataset: ${ex.id} → "${alias}"`);
    if (!hit) hit = byNorm.get(norm(ex.name));
    if (hit) matched.push({ ex, src: hit });
    else unmatched.push(ex);
  }

  if (unmatched.length) {
    console.log(`\n${unmatched.length} unmatched (add to ALIASES):`);
    for (const ex of unmatched) {
      const best = dataset.map((e) => [similarity(ex.name, e.name), e.name]).sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
      console.log(`  ${ex.id} ("${ex.name}")  →  ${best.join('  |  ')}`);
    }
  }
  console.log(`\nMatched ${matched.length}/${BUILTIN_EXERCISES.length}. Downloading images…`);

  const outRoot = path.join(ROOT, 'exercises');
  await mkdir(outRoot, { recursive: true });
  const generated = {};
  const precache = [];
  let i = 0;
  for (const { ex, src } of matched) {
    const dir = path.join(outRoot, ex.id);
    await mkdir(dir, { recursive: true });
    const images = [];
    for (let n = 0; n < Math.min(2, src.images.length); n++) {
      const url = `${RAW}/exercises/${src.images[n]}`;
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        const buf = Buffer.from(await r.arrayBuffer());
        const out = await sharp(buf).resize({ width: MAX_WIDTH, withoutEnlargement: true }).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
        await writeFile(path.join(dir, `${n}.jpg`), out);
        images.push(`exercises/${ex.id}/${n}.jpg`);
        precache.push(`./exercises/${ex.id}/${n}.jpg`);
      } catch (e) {
        console.warn(`  image failed for ${ex.id} (${url}): ${e.message}`);
      }
    }
    const mapMuscles = (list) => [...new Set(list.map((m) => MUSCLE_MAP[m]).filter(Boolean))];
    generated[ex.id] = {
      source: src.id,
      name: src.name,
      images,
      instructions: src.instructions,
      primary: mapMuscles(src.primaryMuscles),
      secondary: mapMuscles(src.secondaryMuscles),
      equipment: src.equipment || null,
      level: src.level || null,
    };
    process.stdout.write(`\r  ${++i}/${matched.length} ${ex.id}                    `);
  }

  await mkdir(path.join(ROOT, 'js', 'generated'), { recursive: true });
  const header = `/* Generated by scripts/import-exercises.mjs — do not edit by hand.
   Source: free-exercise-db (https://github.com/yuhonas/free-exercise-db), CC0 1.0.
   Images live in /exercises/<id>/; muscles are mapped onto this app's ids. */\n`;
  await writeFile(path.join(ROOT, 'js', 'generated', 'exercise-db.js'), `${header}export const EXERCISE_DB = ${JSON.stringify(generated, null, 1)};\n`);
  await writeFile(path.join(ROOT, 'sw-media.js'), `/* Generated by scripts/import-exercises.mjs */\nself.MEDIA_PRECACHE = ${JSON.stringify(precache)};\n`);

  const bytes = await dirSize(outRoot);
  console.log(`\n\nWrote ${precache.length} images for ${Object.keys(generated).length} exercises.`);
  console.log(`Total size of /exercises: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log('Updated js/generated/exercise-db.js and sw-media.js. Bump CACHE_VERSION in sw.js before deploying.');
}

main().catch((e) => { console.error(e); process.exit(1); });
