/**
 * @fileoverview Module 1: Маска болот из Copernicus Global Land Cover.
 *
 * Извлекает упрощённую маску landcover (болота / леса / вода / прочее)
 * из CGLS-LC100 (100 м, 2019) и агрегирует в доли на масштабе TROPOMI (7 км).
 *
 * Источник: COPERNICUS/Landcover/100m/Proba-V-C3/Global/2019
 *   - discrete_classification: класс 90 = Herbaceous Wetland
 *   - Отдельного бэнда wetland_cover_fraction нет — доля вычисляется
 *     через reduceResolution бинарной маски 100 м → 7 км.
 *
 * Output contract:
 *   landcover — ee.Image, band 'landcover' (int8)
 *     0 = other, 1 = wetland, 2 = forest, 3 = water, scale 100 m
 *   wetlandFraction — ee.Image, band 'wetland_fraction' (float, 0–1), scale 7000 m
 *   forestFraction — ee.Image, band 'forest_fraction' (float, 0–1), scale 7000 m
 *
 * Usage in GEE Code Editor (standalone):
 *   Just run this file — the smoke test block at the bottom executes.
 *
 * Usage as module:
 *   var wetland = require('users/ntcomz18_sand/wetch4_ws:gee/01_wetland_mask');
 *   var result = wetland.buildLandcoverMask(aoi);
 *   // result.landcover, result.wetlandFraction, result.forestFraction
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var palettes = require('users/ntcomz18_sand/wetch4_ws:gee/lib/palettes');

// ============================================================
// Core functions
// ============================================================

/**
 * Построить маску landcover и доли болот/лесов на масштабе TROPOMI.
 *
 * Классы CGLS-LC100 discrete_classification:
 *   90       = Herbaceous wetland
 *   111–126  = Closed/open forest (все типы)
 *   80       = Permanent water bodies
 *   200      = Open sea
 *
 * @param {ee.Geometry} aoi - Область интереса.
 * @return {Object} {landcover: ee.Image, wetlandFraction: ee.Image, forestFraction: ee.Image}
 */
function buildLandcoverMask(aoi) {
  var cgls = ee.Image(c.CGLS_COLLECTION)
    .select('discrete_classification');

  // Бинарные маски по классам
  var wetlandMask = cgls.eq(90).rename('wetland');
  var forestMask = cgls.gte(111).and(cgls.lte(126)).rename('forest');
  var waterMask = cgls.eq(80).or(cgls.eq(200));

  // Объединённая маска: 0=other, 1=wetland, 2=forest, 3=water
  var landcover = ee.Image(0)
    .where(forestMask, 2)
    .where(wetlandMask, 1)
    .where(waterMask, 3)
    .rename('landcover')
    .clip(aoi)
    .toInt8();

  // Доли на масштабе TROPOMI (~7 км)
  var wetlandFraction = wetlandMask
    .reduceResolution({
      reducer: ee.Reducer.mean(),
      maxPixels: 65536
    })
    .reproject({crs: 'EPSG:4326', scale: 7000})
    .rename('wetland_fraction');

  var forestFraction = forestMask
    .reduceResolution({
      reducer: ee.Reducer.mean(),
      maxPixels: 65536
    })
    .reproject({crs: 'EPSG:4326', scale: 7000})
    .rename('forest_fraction');

  return {
    landcover: landcover,
    wetlandFraction: wetlandFraction,
    forestFraction: forestFraction
  };
}

/**
 * Рассчитать площади по классам landcover (км²).
 * @param {ee.Image} landcover - Маска из buildLandcoverMask().landcover.
 * @param {ee.Geometry} aoi - Область интереса.
 * @return {ee.Dictionary} Результат group reducer с площадями по классам.
 */
function computeAreaStats(landcover, aoi) {
  var areaImage = ee.Image.pixelArea().addBands(landcover);
  return areaImage.reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'class'
    }),
    geometry: aoi,
    scale: 100,
    maxPixels: 1e10
  });
}

// ============================================================
// Exports (for use as module)
// ============================================================

exports.buildLandcoverMask = buildLandcoverMask;
exports.computeAreaStats = computeAreaStats;

// ============================================================
// SMOKE TEST — Run in GEE Code Editor
// ============================================================

var result = buildLandcoverMask(c.TEST_AOI);
var landcover = result.landcover;
var wetlandFraction = result.wetlandFraction;
var forestFraction = result.forestFraction;

// --- Карта landcover 100 м ---
Map.centerObject(c.TEST_AOI, 9);
Map.addLayer(landcover, {
  min: 0, max: 3,
  palette: palettes.LANDCOVER_PALETTE
}, 'Land cover 100m');

// --- Доля болот на масштабе TROPOMI ---
Map.addLayer(wetlandFraction, {
  min: 0, max: 0.8,
  palette: ['white', 'cyan', 'darkblue']
}, 'Wetland fraction (7km)');

// --- Mukhrino station ---
Map.addLayer(c.MUKHRINO, {color: 'yellow'}, 'Mukhrino Station');

// --- S2 SWIR подложка для визуальной верификации ---
var s2 = ee.ImageCollection(c.S2_COLLECTION)
  .filterBounds(c.TEST_AOI)
  .filterDate('2023-06-01', '2023-08-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', c.CLOUD_THRESHOLD))
  .median();
Map.addLayer(s2, {bands: ['B11', 'B8', 'B4'], min: 0, max: 4000}, 'S2 SWIR', false);

// --- Площади по классам ---
print('Area by class:', computeAreaStats(landcover, c.TEST_AOI));

// --- Доля болот в AOI ---
var wetlandPixels = landcover.eq(1).multiply(ee.Image.pixelArea());
var wetlandAreaM2 = wetlandPixels.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: c.TEST_AOI,
  scale: 100,
  maxPixels: 1e10
}).get('landcover');

var totalAreaM2 = ee.Image.pixelArea().reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: c.TEST_AOI,
  scale: 100,
  maxPixels: 1e10
}).get('area');

print('Wetland area (km²):', ee.Number(wetlandAreaM2).divide(1e6));
print('Wetland fraction of AOI (%):',
  ee.Number(wetlandAreaM2).divide(ee.Number(totalAreaM2)).multiply(100));

// --- Wetland fraction статистика на масштабе TROPOMI ---
print('Wetland fraction stats (7km):', wetlandFraction.reduceRegion({
  reducer: ee.Reducer.mean()
    .combine(ee.Reducer.max(), '', true),
  geometry: c.TEST_AOI,
  scale: 7000,
  maxPixels: 1e9
}));
