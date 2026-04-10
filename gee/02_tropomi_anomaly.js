/**
 * @fileoverview Module 2: TROPOMI CH4 monthly anomaly calculation.
 *
 * Algorithm:
 *   1. Load COPERNICUS/S5P/OFFL/L3_CH4, filter by AOI/date/QA
 *   2. Aggregate into monthly median composites
 *   3. Compute background via focal_median (200 km kernel)
 *   4. ΔCH₄ = composite − background
 *
 * Output contract:
 *   ee.ImageCollection, band: 'delta_ch4' (float, ppb)
 *   Properties per image: 'year' (int), 'month' (int), 'n_observations' (int)
 *
 * Usage in GEE Code Editor (standalone):
 *   Just run this file — the smoke test block at the bottom executes.
 *
 * Usage as module:
 *   var tropomi = require('path/to/02_tropomi_anomaly');
 *   var anomalies = tropomi.buildAnomalyCollection(aoi, startDate, endDate);
 *
 * @see DNA.md §3.1 — Only anomalies, never absolute XCH4
 * @see DNA.md §3.2 — Wetland mask required for background (TODO: Phase 1C)
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/YOUR_USERNAME/wetch4-ws:gee/lib/constants');
var utils = require('users/YOUR_USERNAME/wetch4-ws:gee/lib/utils');
var palettes = require('users/YOUR_USERNAME/wetch4-ws:gee/lib/palettes');

// ============================================================
// Core functions
// ============================================================

/**
 * Load and filter TROPOMI CH4 collection with QA masking.
 * @param {ee.Geometry} aoi - Area of interest.
 * @param {string} startDate - Start date (YYYY-MM-DD).
 * @param {string} endDate - End date (YYYY-MM-DD).
 * @return {ee.ImageCollection} Filtered collection with single band (XCH4, ppb).
 */
function loadTropomi(aoi, startDate, endDate) {
  return ee.ImageCollection(c.TROPOMI_COLLECTION)
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .map(function(image) {
      var qa = image.select(c.QA_BAND);
      var qaMask = qa.gt(c.QA_THRESHOLD * 100);
      return image
        .select(c.CH4_BAND)
        .updateMask(qaMask)
        .copyProperties(image, ['system:time_start']);
    });
}

/**
 * Create a monthly median composite from a TROPOMI collection.
 * @param {ee.ImageCollection} collection - QA-filtered TROPOMI collection.
 * @param {ee.Number} year - Target year.
 * @param {ee.Number} month - Target month (1–12).
 * @param {ee.Geometry} aoi - Area for pixel counting.
 * @return {ee.Image} Monthly median composite with properties set.
 */
function makeMonthlyComposite(collection, year, month, aoi) {
  var startDate = ee.Date.fromYMD(year, month, 1);
  var endDate = startDate.advance(1, 'month');

  var monthly = collection
    .filterDate(startDate, endDate);

  var composite = monthly.median()
    .set('year', year)
    .set('month', month)
    .set('system:time_start', startDate.millis());

  // Count valid observations for metadata
  var nObs = monthly.count().rename('count');
  var obsCount = utils.countValidPixels(nObs, aoi, 7000);
  return composite.set('n_observations', obsCount);
}

/**
 * Compute background XCH4 via spatial focal median.
 * Background = regional median over a ~200 km circular window.
 *
 * TODO (Phase 1C): Apply wetland mask before focal_median to exclude
 * wetland pixels from the background. Required by DNA §3.2.
 * When Module 1 is ready, pass wetlandMask (ee.Image, 0 = non-wetland)
 * and uncomment the masking line below.
 *
 * @param {ee.Image} monthlyImage - Monthly CH4 composite.
 * @param {ee.Image} [opt_wetlandMask] - Optional wetland mask (0 = non-wetland).
 *   When provided, wetland pixels are excluded from background calculation.
 * @return {ee.Image} Background XCH4 image.
 */
function computeBackground(monthlyImage, opt_wetlandMask) {
  var imageForBackground = monthlyImage;

  // TODO: uncomment when wetland mask (Module 1) is available
  // if (opt_wetlandMask) {
  //   var nonWetland = opt_wetlandMask.eq(0);
  //   imageForBackground = monthlyImage.updateMask(nonWetland);
  // }

  var kernel = ee.Kernel.circle({
    radius: c.BACKGROUND_WINDOW_KM * 1000,
    units: 'meters'
  });

  return imageForBackground.focal_median({
    kernel: kernel,
    iterations: 1
  }).rename(c.CH4_BAND);
}

/**
 * Compute CH4 anomaly: ΔCH₄ = observed − background.
 * @param {ee.Image} composite - Monthly CH4 composite.
 * @param {ee.Image} background - Background CH4 from focal_median.
 * @return {ee.Image} Anomaly image with band 'delta_ch4' (float, ppb).
 */
function computeAnomaly(composite, background) {
  return composite
    .subtract(background)
    .rename('delta_ch4');
}

/**
 * Build a complete anomaly collection for summer months over a date range.
 * Iterates over years × SUMMER_MONTHS, computing anomaly for each.
 * @param {ee.Geometry} aoi - Area of interest.
 * @param {string} startDate - Start date (YYYY-MM-DD).
 * @param {string} endDate - End date (YYYY-MM-DD).
 * @return {ee.ImageCollection} Collection of monthly ΔCH₄ images.
 */
function buildAnomalyCollection(aoi, startDate, endDate) {
  var tropomi = loadTropomi(aoi, startDate, endDate);

  var startYear = ee.Date(startDate).get('year');
  var endYear = ee.Date(endDate).get('year');
  var ymList = utils.generateMonthList(startYear, endYear, c.SUMMER_MONTHS);

  var anomalyList = ymList.map(function(ym) {
    var dict = ee.Dictionary(ym);
    var year = ee.Number(dict.get('year'));
    var month = ee.Number(dict.get('month'));

    var composite = makeMonthlyComposite(tropomi, year, month, aoi);
    var background = computeBackground(composite);
    var anomaly = computeAnomaly(composite, background);

    return anomaly
      .copyProperties(composite, ['year', 'month', 'n_observations', 'system:time_start']);
  });

  return ee.ImageCollection.fromImages(anomalyList);
}

// ============================================================
// Exports (for use as module)
// ============================================================

exports.loadTropomi = loadTropomi;
exports.makeMonthlyComposite = makeMonthlyComposite;
exports.computeBackground = computeBackground;
exports.computeAnomaly = computeAnomaly;
exports.buildAnomalyCollection = buildAnomalyCollection;

// ============================================================
// SMOKE TEST — Run in GEE Code Editor
// ============================================================
// Uncomment the block below to execute the smoke test.
// Expected: positive anomaly 5–30 ppb over wetlands near Mukhrino,
// ~0 over forests and rivers. Range: −30 to +60 ppb.

// --- Smoke test start ---
var anomalies = buildAnomalyCollection(
  c.TEST_AOI, c.START_DATE, c.END_DATE
);

// July 2023 anomaly
var jul2023 = anomalies
  .filter(ee.Filter.eq('year', 2023))
  .filter(ee.Filter.eq('month', 7))
  .first();

// Print statistics
print('ΔCH₄ July 2023 — image info:', jul2023);
print('ΔCH₄ July 2023 — stats:', jul2023.reduceRegion({
  reducer: ee.Reducer.mean()
    .combine(ee.Reducer.minMax(), '', true)
    .combine(ee.Reducer.stdDev(), '', true),
  geometry: c.TEST_AOI,
  scale: 7000,
  maxPixels: 1e9
}));

// Visualize
Map.centerObject(c.TEST_AOI, 8);
Map.addLayer(jul2023, {
  min: -20,
  max: 40,
  palette: palettes.DELTA_CH4_PALETTE
}, 'ΔCH₄ July 2023');

// Mark Mukhrino station
Map.addLayer(c.MUKHRINO_POINT, {color: 'yellow'}, 'Mukhrino Station');

// Print collection size (should be ~42: 7 years × 6 months)
print('Total anomaly images:', anomalies.size());
// --- Smoke test end ---
