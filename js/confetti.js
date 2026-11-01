/* ==========================================================================
   confetti.js — tiny canvas confetti burst for personal records.
   ========================================================================== */

import { $, reducedMotion } from './ui.js';

let particles = [];
let raf = null;

function token(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Burst from (x, y) in #app coordinates. */
export function burst(x, y, count = 70) {
  if (reducedMotion()) return;
  const canvas = $('#confetti');
  const app = $('#app');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = app.clientWidth, h = app.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  const colors = [token('--red', '#D8432B'), token('--green', '#1E4D3A'), token('--red-2', '#F3C6BB'), token('--green-2', '#2F6B52')];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 7;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4,
      w: 4 + Math.random() * 5, h: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length], life: 1,
    });
  }
  if (!raf) tick();

  function tick() {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.vy += 0.28; p.vx *= 0.98; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.016;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (particles.length) raf = requestAnimationFrame(tick);
    else { raf = null; ctx.clearRect(0, 0, w, h); }
  }
}
