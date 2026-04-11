/**
 * @fileoverview Module 2: TROPOMI monthly XCH4 composites.
 *
 * Produces clean monthly median maps of column-averaged CH4 over
 * Western Siberia. No background subtraction or enhancement —
 * that is Module 3's responsibility.
 *
 * Algorithm:
 *   1. Load COPERNICUS/S5P/OFFL/L3_CH4, filter by AOI/date/QA
 *   2. For each year-month (May–Oct): compute median composite
 *   3. Count valid observations per pixel
 *
 * Output contract:
 *   ee.ImageCollection, band: 'xch4' (float, ppb)
 *   Properties per image: 'year' (int), 'month' (int 5–10), 'n_obs' (int)
 *
 * Usage in GEE Code Editor (standalone):
 *   Just run this file — the smoke test block at the bottom executes.
 *
 * Usage as module:
 *   var tropomi = require('path/to/02_tropomi_monthly');
 *   var monthly = tropomi.buildMonthlyCollection(aoi, startDate, endDate);
 *
 * @see DNA.md §3.1 — TROPOMI is the central monitoring instrument
 * @see RNA.md §2 — Output contract: band 'xch4', properties year/month/n_obs
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var utils = require('users/ntcomz18_sand/wetch4_ws:gee/lib/utils');
var palettes = require('users/ntcomz18_sand/wetch4_ws:gee/lib/palettes');

// ============================================================
// Core functions
// ============================================================

/**
 * Load and filter TROPOMI CH4 collection with QA masking.
 * @param {ee.Geometry} aoi - Area of interest.
 * @param {string} startDate - Start date (YYYY-MM-DD).
 * @param {string} endDate - End date (YYYY-MM-DD).
 * @return {ee.ImageCollection} Filtered collection, single band renamed 'xch4'.
 */
function loadTropomi(aoi, startDate, endDate) {
  // L3 product is already QA-filtered at production level — no validity band.
  return ee.ImageCollection(c.TROPOMI_COLLECTION)
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .map(function(image) {
      return image
        .select(c.CH4_BAND)
        .rename('xch4')
        .copyProperties(image, ['system:time_start']);
    });
}

/**
 * Create a monthly median composite from a filtered TROPOMI collection.
 * @param {ee.ImageCollection} collection - QA-filtered TROPOMI collection.
 * @param {ee.Number} year - Target year.
 * @param {ee.Number} month - Target month (1–12).
 * @param {ee.Geometry} aoi - Area for valid-pixel counting.
 * @return {ee.Image} Monthly median composite with band 'xch4'
 *   and properties year, month, n_obs.
 */
function makeMonthlyComposite(collection, year, month, aoi) {
  var startDate = ee.Date.fromYMD(year, month, 1);
  var endDate = startDate.advance(1, 'month');

  var monthly = collection.filterDate(startDate, endDate);

  var composite = monthly.median()
    .set('year', year)
    .set('month', month)
    .set('system:time_start', startDate.millis());

  // Count valid observations for metadata
  var nObs = utils.countValidPixels(monthly.count(), aoi, 7000);
  return composite.set('n_obs', nObs);
}

/**
 * Build a complete monthly XCH4 collection for summer months.
 * @param {ee.Geometry} aoi - Area of interest.
 * @param {string} startDate - Start date (YYYY-MM-DD).
 * @param {string} endDate - End date (YYYY-MM-DD).
 * @return {ee.ImageCollection} Monthly XCH4 composites (May–October per year).
 */
function buildMonthlyCollection(aoi, startDate, endDate) {
  var tropomi = loadTropomi(aoi, startDate, endDate);

  var startYear = ee.Date(startDate).get('year');
  var endYear = ee.Date(endDate).get('year');
  var ymList = utils.generateMonthList(startYear, endYear, c.SUMMER_MONTHS);

  var images = ymList.map(function(ym) {
    var dict = ee.Dictionary(ym);
    var year = ee.Number(dict.get('year'));
    var month = ee.Number(dict.get('month'));
    return makeMonthlyComposite(tropomi, year, month, aoi);
  });

  return ee.ImageCollection.fromImages(images);
}

// ============================================================
// Exports (for use as module)
// ============================================================

exports.loadTropomi = loadTropomi;
exports.makeMonthlyComposite = makeMonthlyComposite;
exports.buildMonthlyCollection = buildMonthlyCollection;

// ============================================================
// SMOKE TEST — Run in GEE Code Editor
// ============================================================

var monthlyCollection = buildMonthlyCollection(
  c.TEST_AOI, c.START_DATE, c.END_DATE
);

// --- July 2023 map ---
var jul2023 = monthlyCollection
  .filter(ee.Filter.eq('year', 2023))
  .filter(ee.Filter.eq('month', 7))
  .first();

Map.centerObject(c.TEST_AOI, 9);
Map.addLayer(jul2023, {
  bands: ['xch4'],
  min: 1870,
  max: 1920,
  palette: palettes.XCH4_PALETTE
}, 'XCH₄ July 2023');

// Mark Mukhrino station
Map.addLayer(c.MUKHRINO, {color: 'yellow'}, 'Mukhrino Station');

// --- Statistics ---
print('July 2023 stats:', jul2023.reduceRegion({
  reducer: ee.Reducer.mean()
    .combine(ee.Reducer.stdDev(), '', true)
    .combine(ee.Reducer.count(), '', true),
  geometry: c.TEST_AOI,
  scale: 7000,
  maxPixels: 1e9
}));

// --- Time series: mean XCH4 2019–2025 ---
var chart = ui.Chart.image.series({
  imageCollection: monthlyCollection.select('xch4'),
  region: c.TEST_AOI,
  reducer: ee.Reducer.mean(),
  scale: 7000
}).setOptions({title: 'Mean XCH₄ over Mukhrino region'});
print(chart);

// --- Collection metadata ---
print('Collection size:', monthlyCollection.size());
print('First image properties:', monthlyCollection.first().toDictionary());
