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
var MUKHRINO = ee.Geometry.Point([68.682, 60.892]);

/** Bakchar peatland station (southern taiga, Tomsk region) */
var BAKCHAR = ee.Geometry.Point([82.67, 56.93]);

/** ZOTTO tall tower observatory (60°48'N, 89°21'E) */
var ZOTTO = ee.Geometry.Point([89.35, 60.80]);

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
var MODIS_NDVI_COLLECTION = 'MODIS/061/MOD13A2';
var JRC_WATER = 'JRC/GSW1_4/GlobalSurfaceWater';

// ============================================================
// TROPOMI parameters
// ============================================================

/** XCH4 band in S5P L3 product */
var CH4_BAND = 'CH4_column_volume_mixing_ratio_dry_air';

/** QA band (values 0–100, percentage) */
var QA_BAND = 'CH4_column_volume_mixing_ratio_dry_air_validity';

/** QA threshold on raw 0–100 scale. Pixels with validity > 50 are kept. */
var QA_THRESHOLD = 50;

// ============================================================
// Sentinel-2 parameters
// ============================================================

/** Max cloud cover percentage for S2 scene selection */
var CLOUD_THRESHOLD = 20;

// ============================================================
// Wetland microlandscape classes (Bc8 model)
// ============================================================

var WETLAND_CLASSES = {
  0: 'non_wetland',
  1: 'palsas',
  2: 'ryams',
  3: 'ridges',
  4: 'olig_hollows',
  5: 'meso_hollows',
  6: 'eutr_hollows',
  7: 'peat_mats',
  8: 'ponds'
};

/** Number of wetland types (excluding non-wetland class 0) */
var N_WETLAND_TYPES = 8;

// ============================================================
// CGLS Land Cover parameters
// ============================================================

/** Copernicus Global Land Cover 100m, 2019 */
var CGLS_COLLECTION = 'COPERNICUS/Landcover/100m/Proba-V-C3/Global/2019';

/** Simplified landcover classes for kill-or-go analysis */
var LANDCOVER_CLASSES = {
  0: 'other',
  1: 'wetland',
  2: 'forest',
  3: 'water'
};

// ============================================================
// Visualization defaults
// ============================================================

/** XCH4 absolute values (ppb) — sequential palette */
var XCH4_VIS = {
  min: 1870,
  max: 1920,
  palette: ['blue', 'cyan', 'green', 'yellow', 'red']
};

// ============================================================
// Exports
// ============================================================

exports.FULL_AOI = FULL_AOI;
exports.TEST_AOI = TEST_AOI;
exports.MUKHRINO = MUKHRINO;
exports.BAKCHAR = BAKCHAR;
exports.ZOTTO = ZOTTO;
exports.START_DATE = START_DATE;
exports.END_DATE = END_DATE;
exports.SUMMER_MONTHS = SUMMER_MONTHS;
exports.TROPOMI_COLLECTION = TROPOMI_COLLECTION;
exports.S2_COLLECTION = S2_COLLECTION;
exports.ERA5_COLLECTION = ERA5_COLLECTION;
exports.MODIS_NDVI_COLLECTION = MODIS_NDVI_COLLECTION;
exports.JRC_WATER = JRC_WATER;
exports.CH4_BAND = CH4_BAND;
exports.QA_BAND = QA_BAND;
exports.QA_THRESHOLD = QA_THRESHOLD;
exports.CLOUD_THRESHOLD = CLOUD_THRESHOLD;
exports.WETLAND_CLASSES = WETLAND_CLASSES;
exports.N_WETLAND_TYPES = N_WETLAND_TYPES;
exports.XCH4_VIS = XCH4_VIS;
exports.CGLS_COLLECTION = CGLS_COLLECTION;
exports.LANDCOVER_CLASSES = LANDCOVER_CLASSES;
