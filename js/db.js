/* ==========================================================================
   db.js — localStorage persistence
   One JSON blob per key under the "wt." prefix. All weights are kg, all
   timestamps are ms since epoch. Reads happen once at startup into `db`;
   call db.save(key) after mutating db[key].
   ========================================================================== */

const PREFIX = 'wt.';
export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  units: 'kg',          // 'kg' | 'lb' (display only; storage is always kg)
  defaultRestSec: 90,
  theme: 'system',      // 'light' | 'dark' | 'system'
  barKg: 20,            // barbell weight for the plate calculator / warm-ups
  activeSplitId: null,
  activeGymId: null,    // which gym profile is active
  guideMe: false,       // guided workout mode (Get set / Next up screens)
  notifications: false, // user opted in to local notifications
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    console.warn('db: failed to read', key, e);
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('db: failed to write', key, e);
    return false;
  }
}

/** In-memory state. Mutate then call db.save(key). */
export const db = {
  settings: { ...DEFAULT_SETTINGS, ...read('settings', {}) },
  exercises: read('exercises', []),  // custom exercises + overrides of built-ins
  splits: read('splits', []),        // user's splits (copies of presets or custom)
  workouts: read('workouts', []),    // finished workouts, newest first
  active: read('active', null),      // in-progress workout, or null
  gyms: read('gyms', []),            // gym profiles: { id, name, equipment[] }
  overrides: read('overrides', {}),  // { gymId: { exerciseId: substituteId } }
  meta: read('meta', { schema: SCHEMA_VERSION }),

  save(key) {
    return write(key, this[key]);
  },

  saveAll() {
    ['settings', 'exercises', 'splits', 'workouts', 'active', 'gyms', 'overrides', 'meta'].forEach((k) => this.save(k));
  },

  /** Plain object suitable for JSON export. */
  exportData() {
    return {
      app: 'lift-log',
      schema: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      settings: this.settings,
      exercises: this.exercises,
      splits: this.splits,
      workouts: this.workouts,
      active: this.active,
      gyms: this.gyms,
      overrides: this.overrides,
    };
  },

  /**
   * Replace all data from an exported object. Throws on an unrecognised
   * shape so the caller can show an error without touching existing data.
   */
  importData(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Not a JSON object');
    if (!Array.isArray(obj.workouts) || !Array.isArray(obj.splits)) {
      throw new Error('Missing workouts/splits arrays');
    }
    this.settings = { ...DEFAULT_SETTINGS, ...(obj.settings || {}) };
    this.exercises = Array.isArray(obj.exercises) ? obj.exercises : [];
    this.splits = obj.splits;
    this.workouts = obj.workouts;
    this.active = obj.active || null;
    this.gyms = Array.isArray(obj.gyms) ? obj.gyms : [];
    this.overrides = obj.overrides && typeof obj.overrides === 'object' ? obj.overrides : {};
    this.meta = { schema: SCHEMA_VERSION };
    this.saveAll();
  },

  resetAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
    this.settings = { ...DEFAULT_SETTINGS };
    this.exercises = [];
    this.splits = [];
    this.workouts = [];
    this.active = null;
    this.gyms = [];
    this.overrides = {};
    this.meta = { schema: SCHEMA_VERSION };
  },
};
