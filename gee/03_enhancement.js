/**
 * @fileoverview Module 3: Enhancement — XCH₄ болота vs леса.
 *
 * KILL OR GO тест. Маски на масштабе 7 км (из Module 1 fraction layers).
 * Delta вычисляется после фильтрации null — месяцы без данных пропускаются.
 *
 * Output contract:
 *   ee.FeatureCollection — year, month, xch4_wetland, xch4_forest, delta_ch4
 */

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var palettes = require('users/ntcomz18_sand/wetch4_ws:gee/lib/palettes');
var wetlandModule = require('users/ntcomz18_sand/wetch4_ws:gee/01_wetland_mask');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

/**
 * Средний XCH₄ по болотным и лесным пикселям для одного композита.
 * Не вычисляет delta — только сырые значения.
 */
function computeMeans(xch4Image, wetMask, forMask, aoi) {
  var wetVal = xch4Image.updateMask(wetMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: aoi, scale: 7000, maxPixels: 1e9
  }).get('xch4');

  var forVal = xch4Image.updateMask(forMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: aoi, scale: 7000, maxPixels: 1e9
  }).get('xch4');

  return ee.Feature(null, {
    'year': xch4Image.get('year'),
    'month': xch4Image.get('month'),
    'xch4_wetland': wetVal,
    'xch4_forest': forVal
  });
}

/**
 * Вычислить enhancement для всех месяцев.
 * @return {ee.FeatureCollection} С полями year, month, xch4_wetland, xch4_forest, delta_ch4.
 */
function computeAllEnhancements(aoi, startDate, endDate) {
  var mask = wetlandModule.buildLandcoverMask(aoi);
  var wetMask = mask.wetlandFraction.gte(0.1);
  var forMask = mask.forestFraction.gte(0.5);
  var monthlyXCH4 = tropomiModule.buildMonthlyCollection(aoi, startDate, endDate);

  // Шаг 1: сырые средние
  var raw = ee.FeatureCollection(monthlyXCH4.map(function(image) {
    return computeMeans(ee.Image(image), wetMask, forMask, aoi);
  }));

  // Шаг 2: отфильтровать null, вычислить delta
  return raw
    .filter(ee.Filter.notNull(['xch4_wetland', 'xch4_forest']))
    .map(function(f) {
      var delta = ee.Number(f.get('xch4_wetland'))
        .subtract(ee.Number(f.get('xch4_forest')));
      return f.set('delta_ch4', delta);
    });
}

exports.computeMeans = computeMeans;
exports.computeAllEnhancements = computeAllEnhancements;

// ===== SMOKE TEST — KILL OR GO =====
var results = computeAllEnhancements(c.TEST_AOI, c.START_DATE, c.END_DATE);

print('Valid months:', results.size());
print('Enhancement table:', results);

// --- XCH₄ болота vs леса ---
var chartDual = ui.Chart.feature.byFeature(results, 'month', ['xch4_wetland', 'xch4_forest'])
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
print(chartDual);

// --- ΔCH₄ ---
var chartDelta = ui.Chart.feature.byFeature(results, 'month', 'delta_ch4')
  .setChartType('ScatterChart')
  .setOptions({
    title: 'Enhancement: XCH₄(wetland) − XCH₄(forest)',
    hAxis: {title: 'Month'},
    vAxis: {title: 'ΔCH₄ (ppb)'},
    pointSize: 5,
    trendlines: {0: {color: 'red'}}
  });
print(chartDelta);

// --- KILL OR GO ---
print('═══ KILL OR GO ═══');
print('Mean ΔCH₄:', results.aggregate_mean('delta_ch4'), 'ppb');
print('Max ΔCH₄:', results.aggregate_max('delta_ch4'), 'ppb');
print('Min ΔCH₄:', results.aggregate_min('delta_ch4'), 'ppb');

// --- Monthly mean ---
var monthlyMean = ee.List(c.SUMMER_MONTHS).map(function(m) {
  var subset = results.filter(ee.Filter.eq('month', m));
  return ee.Feature(null, {
    'month': m,
    'mean_delta': subset.aggregate_mean('delta_ch4'),
    'n': subset.size()
  });
});
print('Monthly mean ΔCH₄:', ee.FeatureCollection(monthlyMean));

// --- Карта Jul 2023 ---
var mask = wetlandModule.buildLandcoverMask(c.TEST_AOI);
var wetMask7k = mask.wetlandFraction.gte(0.1);
var forMask7k = mask.forestFraction.gte(0.5);

var monthlyXCH4 = tropomiModule.buildMonthlyCollection(
  c.TEST_AOI, c.START_DATE, c.END_DATE);

var jul2023 = monthlyXCH4
  .filter(ee.Filter.eq('year', 2023))
  .filter(ee.Filter.eq('month', 7))
  .first();

var bg = jul2023.updateMask(forMask7k).reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: c.TEST_AOI, scale: 7000, maxPixels: 1e9
}).get('xch4');

var enhMap = jul2023
  .subtract(ee.Image.constant(ee.Number(bg)))
  .rename('delta_ch4');

Map.centerObject(c.TEST_AOI, 9);
Map.addLayer(enhMap.updateMask(wetMask7k), {
  min: -10, max: 30, palette: palettes.DELTA_CH4_PALETTE
}, 'Enhancement Jul 2023 (wetland)');
Map.addLayer(enhMap, {
  min: -10, max: 30, palette: palettes.DELTA_CH4_PALETTE
}, 'Enhancement Jul 2023 (all)', false);
Map.addLayer(c.MUKHRINO, {color: 'yellow'}, 'Mukhrino');
