/**
 * @fileoverview Global constants for the WetCH4-WS project.
 * All AOI definitions, thresholds, dataset IDs, and class dictionaries.
 * Import: var c = require('path/to/lib/constants');
 */

// ============================================================
// Area of Interest
// ============================================================

/** Full study region: Western Siberian Lowland */
var FULL_AOI = ee.Geometry.Rectangle([60, 55, 85, 68]);

/** Test AOI: Mukhrino Field Station vicinity */
var TEST_AOI = ee.Geometry.Rectangle([68.0, 60.5, 69.5, 61.3]);

/** Mukhrino eddy-covariance tower location */
var MUKHRINO_POINT = ee.Geometry.Point([68.68, 60.89]);

// ============================================================
// Temporal parameters
// ============================================================

var START_DATE = '2019-05-01';
var END_DATE = '2025-10-31';

/** Active emission season months (May–October) */
var SUMMER_MONTHS = [5, 6, 7, 8, 9, 10];

// ============================================================
// Dataset IDs
// ============================================================

var TROPOMI_COLLECTION = 'COPERNICUS/S5P/OFFL/L3_CH4';
var S2_COLLECTION = 'COPERNICUS/S2_SR_HARMONIZED';
var ERA5_COLLECTION = 'ECMWF/ERA5_LAND/DAILY_AGGR';
var JRC_WATER = 'JRC/GSW1_4/GlobalSurfaceWater';

// ============================================================
// TROPOMI parameters
// ============================================================

/** XCH4 band in S5P L3 product */
var CH4_BAND = 'CH4_column_volume_mixing_ratio_dry_air';

/** QA band (values 0–100, percentage) */
var QA_BAND = 'CH4_column_volume_mixing_ratio_dry_air_validity';

/**
 * QA threshold (normalized 0–1).
 * Applied as: qa_band > QA_THRESHOLD * 100  →  qa > 50
 */
var QA_THRESHOLD = 0.5;

/** Background window radius in km for focal_median */
var BACKGROUND_WINDOW_KM = 200;

// ============================================================
// Sentinel-2 parameters
// ============================================================

/** Max cloud cover percentage for S2 scene selection */
var CLOUD_THRESHOLD = 20;

// ============================================================
// Wetland microlandscape classes (Bc8 model)
// ============================================================

var WETLAND_CLASSES = {
  0: 'non-wetland',
  1: 'palsas',
  2: 'ryams',
  3: 'ridges',
  4: 'oligotrophic_hollows',
  5: 'mesotrophic_hollows',
  6: 'eutrophic_hollows',
  7: 'peat_mats',
  8: 'ponds'
};

/** Number of wetland types (excluding non-wetland class 0) */
var N_WETLAND_TYPES = 8;

// ============================================================
// Visualization defaults
// ============================================================

var DELTA_CH4_VIS = {
  min: -20,
  max: 40,
  palette: ['#2166ac', '#67a9cf', '#d1e5f0', '#f7f7f7',
            '#fddbc7', '#ef8a62', '#b2182b']
};

// ============================================================
// Exports
// ============================================================

exports.FULL_AOI = FULL_AOI;
exports.TEST_AOI = TEST_AOI;
exports.MUKHRINO_POINT = MUKHRINO_POINT;
exports.START_DATE = START_DATE;
exports.END_DATE = END_DATE;
exports.SUMMER_MONTHS = SUMMER_MONTHS;
exports.TROPOMI_COLLECTION = TROPOMI_COLLECTION;
exports.S2_COLLECTION = S2_COLLECTION;
exports.ERA5_COLLECTION = ERA5_COLLECTION;
exports.JRC_WATER = JRC_WATER;
exports.CH4_BAND = CH4_BAND;
exports.QA_BAND = QA_BAND;
exports.QA_THRESHOLD = QA_THRESHOLD;
exports.BACKGROUND_WINDOW_KM = BACKGROUND_WINDOW_KM;
exports.CLOUD_THRESHOLD = CLOUD_THRESHOLD;
exports.WETLAND_CLASSES = WETLAND_CLASSES;
exports.N_WETLAND_TYPES = N_WETLAND_TYPES;
exports.DELTA_CH4_VIS = DELTA_CH4_VIS;
