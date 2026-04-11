/**
 * @fileoverview Module 4: Три показателя — CH₄ + T_air + NDVI.
 *
 * Для каждого месяца (май–окт, 2019–2025) извлекает средние значения
 * XCH₄, температуры воздуха и NDVI по болотным и лесным пикселям.
 * Строит scatter plots и корреляции для пространственно-временного анализа.
 *
 * Источники:
 *   XCH₄  — Module 2 (TROPOMI monthly composites)
 *   T_air  — ERA5-Land daily aggregated → monthly mean (K → °C)
 *   NDVI   — MODIS MOD13A1 16-day 500m → monthly mean (×0.0001)
 *   Маски  — Module 1 (wetland/forest fractions at 7km)
 *
 * Output contract:
 *   ee.FeatureCollection — year, month,
 *     xch4_wetland, xch4_forest, delta_ch4,
 *     t_air_wetland, t_air_forest,
 *     ndvi_wetland, ndvi_forest
 *
 * Usage as module:
 *   var tv = require('users/ntcomz18_sand/wetch4_ws:gee/04_three_variables');
 *   var table = tv.buildThreeVarTable(aoi, startDate, endDate);
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var palettes = require('users/ntcomz18_sand/wetch4_ws:gee/lib/palettes');
var wetlandModule = require('users/ntcomz18_sand/wetch4_ws:gee/01_wetland_mask');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

// ============================================================
// Helper: monthly composites for T_air and NDVI
// ============================================================

/**
 * Месячная средняя температура воздуха (°C) из ERA5-Land.
 * @param {ee.Number} year
 * @param {ee.Number} month
 * @param {ee.Geometry} aoi
 * @return {ee.Image} Band 't_air' (float, °C).
 */
function getMonthlyTemp(year, month, aoi) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  return ee.ImageCollection(c.ERA5_COLLECTION)
    .filterBounds(aoi)
    .filterDate(start, end)
    .select('temperature_2m')
    .mean()
    .subtract(273.15)
    .rename('t_air');
}

/**
 * Месячный средний NDVI из MODIS MOD13A1 (500 м).
 * @param {ee.Number} year
 * @param {ee.Number} month
 * @param {ee.Geometry} aoi
 * @return {ee.Image} Band 'ndvi' (float, 0–1).
 */
function getMonthlyNDVI(year, month, aoi) {
  var start = ee.Date.fromYMD(year, month, 1);
  var end = start.advance(1, 'month');
  return ee.ImageCollection('MODIS/061/MOD13A1')
    .filterBounds(aoi)
    .filterDate(start, end)
    .select('NDVI')
    .mean()
    .multiply(0.0001)
    .rename('ndvi');
}

// ============================================================
// Core function
// ============================================================

/**
 * Извлечь три показателя для одного месячного композита.
 * @param {ee.Image} xch4Image - TROPOMI composite с band 'xch4'.
 * @param {ee.Image} wetMask - Маска болот на 7 км.
 * @param {ee.Image} forMask - Маска лесов на 7 км.
 * @param {ee.Geometry} aoi
 * @return {ee.Feature} 7 полей (без delta).
 */
function extractThreeVariables(xch4Image, wetMask, forMask, aoi) {
  var year = ee.Number(xch4Image.get('year'));
  var month = ee.Number(xch4Image.get('month'));

  var temp = getMonthlyTemp(year, month, aoi);
  var ndvi = getMonthlyNDVI(year, month, aoi);

  var combined = xch4Image.addBands(temp).addBands(ndvi);

  var wetStats = combined.updateMask(wetMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: aoi, scale: 7000, maxPixels: 1e9
  });

  var forStats = combined.updateMask(forMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: aoi, scale: 7000, maxPixels: 1e9
  });

  return ee.Feature(null, {
    'year': year,
    'month': month,
    'xch4_wetland': wetStats.get('xch4'),
    'xch4_forest': forStats.get('xch4'),
    't_air_wetland': wetStats.get('t_air'),
    't_air_forest': forStats.get('t_air'),
    'ndvi_wetland': wetStats.get('ndvi'),
    'ndvi_forest': forStats.get('ndvi')
  });
}

/**
 * Построить таблицу трёх показателей для всех месяцев.
 * @param {ee.Geometry} aoi
 * @param {string} startDate
 * @param {string} endDate
 * @return {ee.FeatureCollection} С delta_ch4.
 */
function buildThreeVarTable(aoi, startDate, endDate) {
  var mask = wetlandModule.buildLandcoverMask(aoi);
  var wetMask = mask.wetlandFraction.gte(0.1);
  var forMask = mask.forestFraction.gte(0.5);

  var monthlyXCH4 = tropomiModule.buildMonthlyCollection(aoi, startDate, endDate);

  var raw = ee.FeatureCollection(monthlyXCH4.map(function(image) {
    return extractThreeVariables(ee.Image(image), wetMask, forMask, aoi);
  }));

  return raw
    .filter(ee.Filter.notNull(['xch4_wetland', 'xch4_forest']))
    .map(function(f) {
      var delta = ee.Number(f.get('xch4_wetland'))
        .subtract(ee.Number(f.get('xch4_forest')));
      return f.set('delta_ch4', delta);
    });
}

// ============================================================
// Exports
// ============================================================

exports.buildThreeVarTable = buildThreeVarTable;

// ============================================================
// SMOKE TEST
// ============================================================

var table = buildThreeVarTable(c.TEST_AOI, c.START_DATE, c.END_DATE);

print('Three variables table:', table);
print('Valid months:', table.size());

// --- ΔCH₄ vs T_air ---
var chartDeltaTemp = ui.Chart.feature.byFeature(table, 't_air_wetland', 'delta_ch4')
  .setChartType('ScatterChart')
  .setOptions({
    title: 'ΔCH₄ vs Temperature (wetlands)',
    hAxis: {title: 'T_air (°C)'},
    vAxis: {title: 'ΔCH₄ (ppb)'},
    pointSize: 5,
    trendlines: {0: {color: 'red', showR2: true}}
  });
print(chartDeltaTemp);

// --- ΔCH₄ vs NDVI ---
var chartDeltaNDVI = ui.Chart.feature.byFeature(table, 'ndvi_wetland', 'delta_ch4')
  .setChartType('ScatterChart')
  .setOptions({
    title: 'ΔCH₄ vs NDVI (wetlands)',
    hAxis: {title: 'NDVI'},
    vAxis: {title: 'ΔCH₄ (ppb)'},
    pointSize: 5,
    trendlines: {0: {color: 'red', showR2: true}}
  });
print(chartDeltaNDVI);

// --- Сезонный ход ---
var chartSeasonal = ui.Chart.feature.byFeature(table, 'month',
    ['delta_ch4', 't_air_wetland', 'ndvi_wetland'])
  .setChartType('ScatterChart')
  .setOptions({
    title: 'Seasonal: ΔCH₄, T_air, NDVI over wetlands',
    hAxis: {title: 'Month'},
    series: {
      0: {targetAxisIndex: 0, color: 'blue', labelInLegend: 'ΔCH₄ (ppb)'},
      1: {targetAxisIndex: 1, color: 'red', labelInLegend: 'T_air (°C)'},
      2: {targetAxisIndex: 1, color: 'green', labelInLegend: 'NDVI'}
    },
    vAxes: {
      0: {title: 'ΔCH₄ (ppb)'},
      1: {title: 'T_air (°C) / NDVI'}
    },
    pointSize: 4
  });
print(chartSeasonal);

// --- XCH₄ wetland vs forest ---
var chartWetFor = ui.Chart.feature.byFeature(table, 'month',
    ['xch4_wetland', 'xch4_forest'])
  .setChartType('ScatterChart')
  .setOptions({
    title: 'XCH₄: Wetlands vs Forests',
    hAxis: {title: 'Month'},
    vAxis: {title: 'XCH₄ (ppb)'},
    pointSize: 4,
    series: {
      0: {color: 'cyan', labelInLegend: 'Wetlands'},
      1: {color: 'darkgreen', labelInLegend: 'Forests'}
    }
  });
print(chartWetFor);

// --- Сводка ---
print('═══ THREE VARIABLES SUMMARY ═══');
print('Mean ΔCH₄:', table.aggregate_mean('delta_ch4'), 'ppb');
print('Mean T_air wetland:', table.aggregate_mean('t_air_wetland'), '°C');
print('Mean T_air forest:', table.aggregate_mean('t_air_forest'), '°C');
print('Mean NDVI wetland:', table.aggregate_mean('ndvi_wetland'));
print('Mean NDVI forest:', table.aggregate_mean('ndvi_forest'));

// --- CSV экспорт ---
Export.table.toDrive({
  collection: table,
  description: 'wetch4_three_variables',
  fileFormat: 'CSV'
});
