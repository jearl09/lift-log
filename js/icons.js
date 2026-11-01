/* ==========================================================================
   icons.js — inline SVG icons for equipment types. 48×48 viewBox, 2px
   stroke in currentColor, round caps/joins; small solid plates/handles only.
   ========================================================================== */

const ICONS = {
  bodyweight: '<circle cx="24" cy="9" r="4"/><path d="M24 13v15M13 21h22M24 28l-8 14M24 28l8 14"/>',
  bands: '<rect x="3" y="19" width="8" height="10" rx="2" fill="currentColor" stroke="none"/><rect x="37" y="19" width="8" height="10" rx="2" fill="currentColor" stroke="none"/><path d="M11 24h4c3-6 15-6 18 0h4M15 24c3 6 15 6 18 0"/>',
  'pullup-bar': '<path d="M5 12h38M11 12V5M37 12V5"/><circle cx="24" cy="20" r="3.5"/><path d="M24 23.5V34M24 23.5l-8-11M24 23.5l8-11M24 34l-5 9M24 34l5 9"/>',
  kettlebell: '<path d="M16 21c0-11 16-11 16 0"/><circle cx="24" cy="31" r="11"/>',
  dumbbells: '<path d="M14 24h20"/><rect x="10" y="15" width="5" height="18" rx="1.5" fill="currentColor" stroke="none"/><rect x="33" y="15" width="5" height="18" rx="1.5" fill="currentColor" stroke="none"/><rect x="5" y="19" width="4" height="10" rx="1.5" fill="currentColor" stroke="none"/><rect x="39" y="19" width="4" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  barbell: '<path d="M3 24h42"/><rect x="8" y="13" width="5" height="22" rx="1.5" fill="currentColor" stroke="none"/><rect x="35" y="13" width="5" height="22" rx="1.5" fill="currentColor" stroke="none"/><rect x="13" y="17" width="3" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="32" y="17" width="3" height="14" rx="1" fill="currentColor" stroke="none"/>',
  'ez-bar':'<path d="M7 24h7l5-5 5 5 5-5 5 5h7"/><rect x="3" y="17" width="4" height="14" rx="1.5" fill="currentColor" stroke="none"/><rect x="41" y="17" width="4" height="14" rx="1.5" fill="currentColor" stroke="none"/>',
  'flat-bench': '<rect x="7" y="18" width="34" height="7" rx="2"/><path d="M12 25v12M36 25v12M7 37h10M31 37h10"/>',
  'adj-bench': '<path d="M19 25L8 12l5-4 11 13z"/><rect x="19" y="24" width="20" height="7" rx="2"/><path d="M24 31v9M35 31v9M19 40h10M31 40h8"/>',
  rack: '<path d="M11 43V6h26v37M11 21h6M37 21h-6M11 32h6M37 32h-6"/><rect x="5" y="40" width="12" height="3" rx="1.5" fill="currentColor" stroke="none"/><rect x="31" y="40" width="12" height="3" rx="1.5" fill="currentColor" stroke="none"/>',
  smith: '<path d="M10 43V6h28v37M8 22h32"/><rect x="4" y="16" width="5" height="12" rx="1.5" fill="currentColor" stroke="none"/><rect x="39" y="16" width="5" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
  'cable-single': '<rect x="12" y="5" width="10" height="38" rx="2"/><path d="M14 27h6M14 32h6M14 37h6M22 9l14 18"/><rect x="33" y="26" width="8" height="4" rx="1.5" fill="currentColor" stroke="none"/>',
  'cable-dual': '<rect x="4" y="5" width="7" height="38" rx="2"/><rect x="37" y="5" width="7" height="38" rx="2"/><path d="M11 9l10 17M37 9L27 26"/><rect x="17" y="25" width="7" height="4" rx="1.5" fill="currentColor" stroke="none"/><rect x="24" y="25" width="7" height="4" rx="1.5" fill="currentColor" stroke="none"/>',
  'lat-pulldown': '<path d="M9 43V6h22M28 6v9M15 15h26M9 32h22"/><rect x="17" y="30" width="16" height="4" rx="1.5" fill="currentColor" stroke="none"/><path d="M25 34v9"/>',
  'row-machine': '<path d="M5 40h38M11 40V28M25 40V20h4M29 23h10M29 29h10"/><rect x="6" y="26" width="12" height="4" rx="1.5" fill="currentColor" stroke="none"/><rect x="38" y="21" width="5" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  'leg-press': '<path d="M6 40l10-12h10M8 40h22"/><path d="M28 9l12 7-7 12-12-7z"/><path d="M26 28l5-4"/>',
  'leg-ext': '<path d="M10 6v13h18v6H10M12 25v15M26 25v6M28 25l8 14"/><circle cx="37" cy="40" r="3.5" fill="currentColor" stroke="none"/>',
  'leg-curl': '<path d="M10 14v9h22v6H10M12 29v12M30 29v12M32 29l-6 11"/><circle cx="25" cy="41" r="3.5" fill="currentColor" stroke="none"/>',
  'chest-press': '<rect x="8" y="12" width="8" height="30" rx="2"/><path d="M16 20h18M16 32h18M24 42h10"/><circle cx="36" cy="20" r="2.5" fill="currentColor" stroke="none"/><circle cx="36" cy="32" r="2.5" fill="currentColor" stroke="none"/>',
  'dip-station': '<path d="M8 14h12M28 14h12M14 14v26M34 14v26M6 40h16M26 40h16"/>',
};

/** Returns an inline <svg> string for an equipment id (empty string if unknown). */
export function equipmentIcon(id, size = 24) {
  const body = ICONS[id] || '<circle cx="24" cy="24" r="16"/><path d="M24 16v8l5 5"/>';
  return `<svg class="eq-icon" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Element version for DOM insertion. */
export function equipmentIconEl(id, size = 24) {
  const tpl = document.createElement('template');
  tpl.innerHTML = equipmentIcon(id, size);
  return tpl.content.firstChild;
}

export const ICON_IDS = Object.keys(ICONS);
