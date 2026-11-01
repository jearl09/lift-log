/* ==========================================================================
   photos.js — user photos for exercises, stored in IndexedDB (up to 2 per
   exercise), resized to max 800px and JPEG-compressed in the browser.
   ========================================================================== */

const DB_NAME = 'lift-log-media';
const STORE = 'photos';
const MAX = 2;
const MAX_WIDTH = 800;
const urlCache = new Map(); // exerciseId → [objectURL]

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/** [Blob] for an exercise (empty if none / unsupported). */
export async function getPhotoBlobs(exerciseId) {
  try { return (await tx('readonly', (s) => s.get(exerciseId))) || []; } catch { return []; }
}

/** Object URLs for an exercise's photos (cached until changed). */
export async function getPhotoURLs(exerciseId) {
  if (urlCache.has(exerciseId)) return urlCache.get(exerciseId);
  const blobs = await getPhotoBlobs(exerciseId);
  const urls = blobs.map((b) => URL.createObjectURL(b));
  urlCache.set(exerciseId, urls);
  return urls;
}

function invalidate(exerciseId) {
  (urlCache.get(exerciseId) || []).forEach((u) => URL.revokeObjectURL(u));
  urlCache.delete(exerciseId);
}

/** Resize a File/Blob to max 800px wide and return a JPEG Blob. */
export function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(src);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Not an image')); };
    img.src = src;
  });
}

/** Add a photo (max 2); returns the new count. */
export async function addPhoto(exerciseId, file) {
  const blob = await resizeImage(file);
  const current = await getPhotoBlobs(exerciseId);
  const next = [...current, blob].slice(-MAX);
  await tx('readwrite', (s) => s.put(next, exerciseId));
  invalidate(exerciseId);
  return next.length;
}

export async function removePhoto(exerciseId, index) {
  const current = await getPhotoBlobs(exerciseId);
  current.splice(index, 1);
  await tx('readwrite', (s) => (current.length ? s.put(current, exerciseId) : s.delete(exerciseId)));
  invalidate(exerciseId);
  return current.length;
}

export const MAX_PHOTOS = MAX;
