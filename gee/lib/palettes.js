/**
 * @fileoverview Color palettes for WetCH4-WS visualization layers.
 * Import: var pal = require('path/to/lib/palettes');
 */

// ============================================================
// Wetland microlandscape classes (0–8)
// ============================================================

/**
 * 9-color palette for wetland_type band (int8, 0–8).
 * Index matches class number in constants.WETLAND_CLASSES.
 *   0 = non-wetland (gray)
 *   1 = palsas (light brown — dry permafrost mounds)
 *   2 = ryams (dark green — pine-shrub-sphagnum)
 *   3 = ridges (olive — elevated bog ridges)
 *   4 = oligotrophic hollows (light cyan — nutrient-poor wet)
 *   5 = mesotrophic hollows (medium blue — moderate wet)
 *   6 = eutrophic hollows (dark blue — nutrient-rich wet)
 *   7 = peat mats (purple — floating mats)
 *   8 = ponds (navy — open water)
 */
var WETLAND_PALETTE = [
  '#bdbdbd', // 0 non-wetland
  '#c4a882', // 1 palsas
  '#1b7837', // 2 ryams
  '#7a8c3e', // 3 ridges
  '#a6dba0', // 4 oligotrophic hollows
  '#5ab4ac', // 5 mesotrophic hollows
  '#2166ac', // 6 eutrophic hollows
  '#762a83', // 7 peat mats
  '#08306b'  // 8 ponds
];

// ============================================================
// Delta CH4 anomaly (diverging)
// ============================================================

/**
 * Blue–white–red diverging palette for delta_ch4 (ppb).
 * Blue = negative anomaly, white = zero, red = positive (emission).
 */
var DELTA_CH4_PALETTE = [
  '#2166ac', '#67a9cf', '#d1e5f0',
  '#f7f7f7',
  '#fddbc7', '#ef8a62', '#b2182b'
];

// ============================================================
// Emission proxy (sequential)
// ============================================================

/**
 * Yellow–orange–red sequential palette for emission_proxy (mgC m-2 h-1).
 */
var EMISSION_PALETTE = [
  '#ffffb2', '#fed976', '#feb24c',
  '#fd8d3c', '#fc4e2a', '#e31a1c', '#b10026'
];

// ============================================================
// NDVI (sequential green)
// ============================================================

var NDVI_PALETTE = [
  '#d73027', '#fc8d59', '#fee08b',
  '#d9ef8b', '#91cf60', '#1a9850'
];

// ============================================================
// Exports
// ============================================================

exports.WETLAND_PALETTE = WETLAND_PALETTE;
exports.DELTA_CH4_PALETTE = DELTA_CH4_PALETTE;
exports.EMISSION_PALETTE = EMISSION_PALETTE;
exports.NDVI_PALETTE = NDVI_PALETTE;
