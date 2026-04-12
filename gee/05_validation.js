/**
 * @fileoverview Module 5: Валидация по наземным данным.
 *
 * Сопоставляет TROPOMI XCH₄ с камерными и профильными данными CH₄
 * из трёх сайтов: Мухрино, Бакчар, ZOTTO.
 *
 * Два уровня валидации:
 *   A. Временной ряд TROPOMI в точках наземных станций
 *   B. Качественное сопоставление: сезонность, знак ΔCH₄, ранжирование типов
 *
 * Output contract:
 *   ee.FeatureCollection — year, month, xch4_point, xch4_wetland,
 *     xch4_forest, delta_ch4, t_air, ndvi, station
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var palettes = require('users/ntcomz18_sand/wetch4_ws:gee/lib/palettes');
var wetlandModule = require('users/ntcomz18_sand/wetch4_ws:gee/01_wetland_mask');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

// ============================================================
// Наземные данные (hardcoded из calibration/all_ground_ch4.csv)
// ============================================================

/**
 * Наземные данные CH₄ flux из публикаций.
 * Все значения в mgCH₄/m²/h.
 */
var GROUND_DATA = ee.FeatureCollection([
  // Dyukarev 2024 — Мухрино, июнь 2023
  ee.Feature(null, {site: 'mukhrino', type: 'hollow', month: 6, year: 2023,
    ch4_flux: 2.76, source: 'Dyukarev2024'}),
  ee.Feature(null, {site: 'mukhrino', type: 'ridge', month: 6, year: 2023,
    ch4_flux: 0.08, source: 'Dyukarev2024'}),
  // Chechin/Alekseychik 2024 — Мухрино, июнь 2022
  ee.Feature(null, {site: 'mukhrino', type: 'hollow', month: 6, year: 2022,
    ch4_flux: 6.0, source: 'Chechin2024'}),
  ee.Feature(null, {site: 'mukhrino', type: 'waterlogged_hollow', month: 6, year: 2022,
    ch4_flux: 11.0, source: 'Chechin2024'}),
  ee.Feature(null, {site: 'mukhrino', type: 'ridge', month: 6, year: 2022,
    ch4_flux: 0.0, source: 'Chechin2024'}),
  // Chechin 2024 ref[25] — Мухрино, авг-сен 2020
  ee.Feature(null, {site: 'mukhrino', type: 'hollow', month: 8, year: 2020,
    ch4_flux: 4.35, source: 'Chechin2024_ref25'}),
  // Veretennikova 2021 — Бакчар
  ee.Feature(null, {site: 'bakchar', type: 'open_bog',
    ch4_flux: 2.66, source: 'Veretennikova2021'}),
  ee.Feature(null, {site: 'bakchar', type: 'forested_bog',
    ch4_flux: 0.57, source: 'Veretennikova2021'}),
  // Winderlich 2014 — ZOTTO
  ee.Feature(null, {site: 'zotto', type: 'mixed',
    ch4_flux: 0.32, source: 'Winderlich2014'})
]);

/**
 * Координаты станций.
 */
var STATIONS = {
  mukhrino: c.MUKHRINO,
  bakchar: c.BAKCHAR,
  zotto: c.ZOTTO
};

// ============================================================
// Helper: месячная температура и NDVI
// ============================================================

/**
 * Месячная средняя температура воздуха (°C) из ERA5-Land.
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
// Core: извлечение TROPOMI в точке станции
// ============================================================

/**
 * Извлечь XCH₄ + delta + T_air + NDVI для одного месяца в точке станции.
 * @param {ee.Image} xch4Image - Месячный композит TROPOMI.
 * @param {ee.Geometry.Point} point - Координаты станции.
 * @param {ee.Image} wetMask - Маска болот (7 км).
 * @param {ee.Image} forMask - Маска лесов (7 км).
 * @param {ee.Geometry} aoi - Область интереса.
 * @param {string} stationName - Название станции.
 * @return {ee.Feature}
 */
function extractAtStation(xch4Image, point, wetMask, forMask, aoi, stationName) {
  var year = ee.Number(xch4Image.get('year'));
  var month = ee.Number(xch4Image.get('month'));

  // XCH₄ в точке станции (буфер 3.5 км ≈ половина пикселя TROPOMI)
  var pointVal = xch4Image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: point.buffer(3500),
    scale: 7000, maxPixels: 1e9
  }).get('xch4');

  // XCH₄ по болотам и лесам в AOI
  var wetVal = xch4Image.updateMask(wetMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: aoi, scale: 7000, maxPixels: 1e9
  }).get('xch4');

  var forVal = xch4Image.updateMask(forMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: aoi, scale: 7000, maxPixels: 1e9
  }).get('xch4');

  // T_air и NDVI в точке
  var temp = getMonthlyTemp(year, month, aoi);
  var ndvi = getMonthlyNDVI(year, month, aoi);

  var tVal = temp.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: point.buffer(5000),
    scale: 11132, maxPixels: 1e9
  }).get('t_air');

  var ndviVal = ndvi.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: point.buffer(5000),
    scale: 500, maxPixels: 1e9
  }).get('ndvi');

  return ee.Feature(null, {
    'year': year,
    'month': month,
    'station': stationName,
    'xch4_point': pointVal,
    'xch4_wetland': wetVal,
    'xch4_forest': forVal,
    't_air': tVal,
    'ndvi': ndviVal
  });
}

/**
 * Построить таблицу валидации для одной станции.
 * @param {ee.Geometry.Point} point
 * @param {string} stationName
 * @param {ee.Geometry} aoi
 * @param {string} startDate
 * @param {string} endDate
 * @return {ee.FeatureCollection} С полем delta_ch4.
 */
function buildStationTable(point, stationName, aoi, startDate, endDate) {
  var mask = wetlandModule.buildLandcoverMask(aoi);
  var wetMask = mask.wetlandFraction.gte(0.1);
  var forMask = mask.forestFraction.gte(0.5);
  var monthlyXCH4 = tropomiModule.buildMonthlyCollection(aoi, startDate, endDate);

  var raw = ee.FeatureCollection(monthlyXCH4.map(function(image) {
    return extractAtStation(ee.Image(image), point, wetMask, forMask, aoi, stationName);
  }));

  return raw
    .filter(ee.Filter.notNull(['xch4_point', 'xch4_wetland', 'xch4_forest']))
    .map(function(f) {
      var delta = ee.Number(f.get('xch4_wetland'))
        .subtract(ee.Number(f.get('xch4_forest')));
      return f.set('delta_ch4', delta);
    });
}

// ============================================================
// Exports
// ============================================================

exports.buildStationTable = buildStationTable;
exports.GROUND_DATA = GROUND_DATA;
exports.STATIONS = STATIONS;

// ============================================================
// SMOKE TEST — Мухрино
// ============================================================

var results = buildStationTable(
  c.MUKHRINO, 'mukhrino', c.TEST_AOI, c.START_DATE, c.END_DATE);

print('═══ MODULE 5: VALIDATION ═══');
print('Valid months (Mukhrino):', results.size());
print('Validation table:', results);

// --- 1. XCH₄ в точке Мухрино: временной ряд ---
var chartTimeSeries = ui.Chart.feature.byFeature(results, 'month', 'xch4_point')
  .setChartType('ScatterChart')
  .setOptions({
    title: 'XCH₄ at Mukhrino station (all years)',
    hAxis: {title: 'Month'},
    vAxis: {title: 'XCH₄ (ppb)'},
    pointSize: 4,
    trendlines: {0: {color: 'red', type: 'polynomial', degree: 2}}
  });
print(chartTimeSeries);

// --- 2. XCH₄ болота vs леса ---
var chartDual = ui.Chart.feature.byFeature(
    results, 'month', ['xch4_wetland', 'xch4_forest'])
  .setChartType('ScatterChart')
  .setOptions({
    title: 'XCH₄: Wetlands vs Forests (Mukhrino AOI)',
    hAxis: {title: 'Month'},
    vAxis: {title: 'XCH₄ (ppb)'},
    pointSize: 4,
    series: {
      0: {color: 'cyan', labelInLegend: 'Wetlands'},
      1: {color: 'darkgreen', labelInLegend: 'Forests'}
    }
  });
print(chartDual);

// --- 3. ΔCH₄ enhancement по месяцам ---
var chartDelta = ui.Chart.feature.byFeature(results, 'month', 'delta_ch4')
  .setChartType('ScatterChart')
  .setOptions({
    title: 'Enhancement ΔCH₄ = XCH₄(wetland) − XCH₄(forest)',
    hAxis: {title: 'Month'},
    vAxis: {title: 'ΔCH₄ (ppb)'},
    pointSize: 5,
    trendlines: {0: {color: 'red'}}
  });
print(chartDelta);

// --- 4. ΔCH₄ vs T_air ---
var chartDeltaT = ui.Chart.feature.byFeature(results, 't_air', 'delta_ch4')
  .setChartType('ScatterChart')
  .setOptions({
    title: 'Enhancement vs Temperature',
    hAxis: {title: 'T_air (°C)'},
    vAxis: {title: 'ΔCH₄ (ppb)'},
    pointSize: 5,
    trendlines: {0: {color: 'orange'}}
  });
print(chartDeltaT);

// --- 5. Сезонный ход (среднее по месяцам) ---
var seasonalMean = ee.List(c.SUMMER_MONTHS).map(function(m) {
  var subset = results.filter(ee.Filter.eq('month', m));
  return ee.Feature(null, {
    'month': m,
    'mean_delta': subset.aggregate_mean('delta_ch4'),
    'mean_xch4_point': subset.aggregate_mean('xch4_point'),
    'mean_t_air': subset.aggregate_mean('t_air'),
    'mean_ndvi': subset.aggregate_mean('ndvi'),
    'n': subset.size()
  });
});
var seasonalFC = ee.FeatureCollection(seasonalMean);

var chartSeasonal = ui.Chart.feature.byFeature(
    seasonalFC, 'month', ['mean_delta', 'mean_t_air'])
  .setChartType('ScatterChart')
  .setOptions({
    title: 'Seasonal: mean ΔCH₄ and T_air by month',
    hAxis: {title: 'Month'},
    series: {
      0: {targetAxisIndex: 0, color: 'red', labelInLegend: 'ΔCH₄ (ppb)',
          pointSize: 8, lineWidth: 2},
      1: {targetAxisIndex: 1, color: 'orange', labelInLegend: 'T_air (°C)',
          pointSize: 8, lineWidth: 2}
    },
    vAxes: {
      0: {title: 'ΔCH₄ (ppb)'},
      1: {title: 'T_air (°C)'}
    }
  });
print(chartSeasonal);

print('Seasonal summary:', seasonalFC);

// --- 6. Сводная статистика ---
print('═══ VALIDATION SUMMARY ═══');
print('Mean ΔCH₄:', results.aggregate_mean('delta_ch4'), 'ppb');
print('Max ΔCH₄:', results.aggregate_max('delta_ch4'), 'ppb');
print('Min ΔCH₄:', results.aggregate_min('delta_ch4'), 'ppb');
print('Mean T_air:', results.aggregate_mean('t_air'), '°C');
print('Mean XCH₄ at station:', results.aggregate_mean('xch4_point'), 'ppb');

// --- 7. Наземные данные — вывод для контекста ---
print('═══ GROUND TRUTH DATA ═══');
print('Ground data records:', GROUND_DATA.size());
print('Ground data:', GROUND_DATA);

// --- 8. Наземные данные — сводка hollow vs ridge ---
var groundHollow = GROUND_DATA
  .filter(ee.Filter.eq('site', 'mukhrino'))
  .filter(ee.Filter.or(
    ee.Filter.eq('type', 'hollow'),
    ee.Filter.eq('type', 'waterlogged_hollow')
  ));
var groundRidge = GROUND_DATA
  .filter(ee.Filter.eq('site', 'mukhrino'))
  .filter(ee.Filter.eq('type', 'ridge'));

print('Ground hollow mean flux:', groundHollow.aggregate_mean('ch4_flux'), 'mgCH₄/m²/h');
print('Ground ridge mean flux:', groundRidge.aggregate_mean('ch4_flux'), 'mgCH₄/m²/h');
print('Ground hollow/ridge ratio:',
  ee.Number(groundHollow.aggregate_mean('ch4_flux'))
    .divide(ee.Number(groundRidge.aggregate_mean('ch4_flux')).max(0.01)));

// --- 9. Карта: станции на фоне маски болот ---
var mask = wetlandModule.buildLandcoverMask(c.TEST_AOI);
Map.centerObject(c.MUKHRINO, 9);
Map.addLayer(mask.wetlandFraction, {
  min: 0, max: 0.8, palette: ['white', 'cyan', 'darkblue']
}, 'Wetland fraction (7km)');
Map.addLayer(c.MUKHRINO, {color: 'yellow'}, 'Mukhrino');
Map.addLayer(c.BAKCHAR, {color: 'red'}, 'Bakchar');
Map.addLayer(c.ZOTTO, {color: 'magenta'}, 'ZOTTO');

// --- 10. Export CSV ---
Export.table.toDrive({
  collection: results,
  description: 'validation_mukhrino_tropomi',
  fileNamePrefix: 'validation_mukhrino',
  fileFormat: 'CSV',
  selectors: ['year', 'month', 'station', 'xch4_point', 'xch4_wetland',
    'xch4_forest', 'delta_ch4', 't_air', 'ndvi']
});
