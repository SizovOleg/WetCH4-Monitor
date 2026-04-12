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
// SMOKE TEST — три станции + ΔCH₄ + matched comparison
// ============================================================

var BUFFER_RADIUS = 10000;  // 10 км — станционный XCH₄
var FOREST_BUFFER = 100000; // 100 км — лесной фон для ΔCH₄

// Месячные композиты TROPOMI (FULL_AOI — все станции внутри)
var monthlyXCH4 = tropomiModule.buildMonthlyCollection(
    c.FULL_AOI, c.START_DATE, c.END_DATE);

// Лесная маска (forestFraction — глобальный образ, не клипается к AOI)
var maskResult = wetlandModule.buildLandcoverMask(c.FULL_AOI);
var forestMask = maskResult.forestFraction.gte(0.5);

// Буферы станций (precompute)
var stationBuffers = {
  Mukhrino: c.MUKHRINO.buffer(BUFFER_RADIUS),
  Bakchar:  c.BAKCHAR.buffer(BUFFER_RADIUS),
  ZOTTO:    c.ZOTTO.buffer(BUFFER_RADIUS)
};
var forestBuffers = {
  Mukhrino: c.MUKHRINO.buffer(FOREST_BUFFER),
  Bakchar:  c.BAKCHAR.buffer(FOREST_BUFFER),
  ZOTTO:    c.ZOTTO.buffer(FOREST_BUFFER)
};

// --- Шаг 1: ΔCH₄ для каждой станции × месяца ---
var stationDeltaRaw = monthlyXCH4.map(function(img) {
  img = ee.Image(img);
  var year = img.get('year');
  var month = img.get('month');
  var maskedImg = img.updateMask(forestMask);

  // XCH₄ в буферах станций (10 км)
  var xch4Muk = img.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: stationBuffers.Mukhrino,
    scale: 7000, maxPixels: 1e9}).get('xch4');
  var xch4Bak = img.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: stationBuffers.Bakchar,
    scale: 7000, maxPixels: 1e9}).get('xch4');
  var xch4Zot = img.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: stationBuffers.ZOTTO,
    scale: 7000, maxPixels: 1e9}).get('xch4');

  // XCH₄ лесной фон (100 км)
  var forMuk = maskedImg.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: forestBuffers.Mukhrino,
    scale: 7000, maxPixels: 1e9}).get('xch4');
  var forBak = maskedImg.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: forestBuffers.Bakchar,
    scale: 7000, maxPixels: 1e9}).get('xch4');
  var forZot = maskedImg.reduceRegion({
    reducer: ee.Reducer.mean(), geometry: forestBuffers.ZOTTO,
    scale: 7000, maxPixels: 1e9}).get('xch4');

  return ee.FeatureCollection([
    ee.Feature(null, {station: 'Mukhrino', year: year, month: month,
      xch4: xch4Muk, xch4_forest: forMuk}),
    ee.Feature(null, {station: 'Bakchar', year: year, month: month,
      xch4: xch4Bak, xch4_forest: forBak}),
    ee.Feature(null, {station: 'ZOTTO', year: year, month: month,
      xch4: xch4Zot, xch4_forest: forZot})
  ]);
}).flatten();

// Фильтр null → вычислить delta (паттерн из Module 3)
var stationDeltaSeries = ee.FeatureCollection(stationDeltaRaw)
    .filter(ee.Filter.notNull(['xch4', 'xch4_forest']))
    .map(function(f) {
      var delta = ee.Number(f.get('xch4'))
          .subtract(ee.Number(f.get('xch4_forest')));
      return f.set('delta_ch4', delta);
    });

print('═══ MODULE 5B+: THREE-STATION ΔCH₄ VALIDATION ═══');
print('Station delta series records:', stationDeltaSeries.size());
print('Station delta series:', stationDeltaSeries);

// --- Шаг 2: Сезонный ход по станциям ---
var months = ee.List(c.SUMMER_MONTHS);
var stationNames = ee.List(['Mukhrino', 'Bakchar', 'ZOTTO']);

var seasonalByStation = stationNames.map(function(name) {
  return months.map(function(m) {
    var subset = stationDeltaSeries
      .filter(ee.Filter.eq('station', name))
      .filter(ee.Filter.eq('month', m));
    return ee.Feature(null, {
      'station': name,
      'month': m,
      'xch4_mean': subset.aggregate_mean('xch4'),
      'xch4_std': subset.aggregate_total_sd('xch4'),
      'delta_ch4_mean': subset.aggregate_mean('delta_ch4'),
      'delta_ch4_std': subset.aggregate_total_sd('delta_ch4'),
      'n': subset.size()
    });
  });
}).flatten();

var seasonalFC = ee.FeatureCollection(seasonalByStation);
print('Seasonal by station:', seasonalFC);

// --- Шаг 3: График — сезонный XCH₄ (абсолютный) ---
var mukhrinoSeasonal = seasonalFC.filter(ee.Filter.eq('station', 'Mukhrino'));
var bakcharSeasonal = seasonalFC.filter(ee.Filter.eq('station', 'Bakchar'));
var zottoSeasonal = seasonalFC.filter(ee.Filter.eq('station', 'ZOTTO'));

var mergedSeasonal = months.map(function(m) {
  var muk = mukhrinoSeasonal.filter(ee.Filter.eq('month', m)).first();
  var bak = bakcharSeasonal.filter(ee.Filter.eq('month', m)).first();
  var zot = zottoSeasonal.filter(ee.Filter.eq('month', m)).first();
  return ee.Feature(null, {
    'month': m,
    'Mukhrino': muk.get('xch4_mean'),
    'Bakchar': bak.get('xch4_mean'),
    'ZOTTO': zot.get('xch4_mean')
  });
});

var chartStations = ui.Chart.feature.byFeature(
    ee.FeatureCollection(mergedSeasonal), 'month',
    ['Mukhrino', 'Bakchar', 'ZOTTO'])
  .setChartType('LineChart')
  .setOptions({
    title: 'Seasonal XCH₄ at three stations (mean 2019-2025)',
    hAxis: {title: 'Month', ticks: [5, 6, 7, 8, 9, 10]},
    vAxis: {title: 'XCH₄ (ppb)'},
    series: {
      0: {color: 'cyan', lineWidth: 2, pointSize: 6,
          labelInLegend: 'Mukhrino (60.9°N, 68.7°E)'},
      1: {color: 'orange', lineWidth: 2, pointSize: 6,
          labelInLegend: 'Bakchar (56.5°N, 82.5°E)'},
      2: {color: 'purple', lineWidth: 2, pointSize: 6,
          labelInLegend: 'ZOTTO (60.8°N, 89.4°E)'}
    }
  });
print(chartStations);

// --- Шаг 4: График — сезонный ΔCH₄ (station − forest) ---
var mergedDelta = months.map(function(m) {
  var muk = mukhrinoSeasonal.filter(ee.Filter.eq('month', m)).first();
  var bak = bakcharSeasonal.filter(ee.Filter.eq('month', m)).first();
  var zot = zottoSeasonal.filter(ee.Filter.eq('month', m)).first();
  return ee.Feature(null, {
    'month': m,
    'Mukhrino': muk.get('delta_ch4_mean'),
    'Bakchar': bak.get('delta_ch4_mean'),
    'ZOTTO': zot.get('delta_ch4_mean')
  });
});

var chartDelta = ui.Chart.feature.byFeature(
    ee.FeatureCollection(mergedDelta), 'month',
    ['Mukhrino', 'Bakchar', 'ZOTTO'])
  .setChartType('LineChart')
  .setOptions({
    title: 'Seasonal ΔCH₄ (station − forest) at three stations (mean 2019-2025)',
    hAxis: {title: 'Month', ticks: [5, 6, 7, 8, 9, 10]},
    vAxis: {title: 'ΔCH₄ (ppb)'},
    series: {
      0: {color: 'cyan', lineWidth: 2, pointSize: 6,
          labelInLegend: 'Mukhrino (60.9°N, 68.7°E)'},
      1: {color: 'orange', lineWidth: 2, pointSize: 6,
          labelInLegend: 'Bakchar (56.5°N, 82.5°E)'},
      2: {color: 'purple', lineWidth: 2, pointSize: 6,
          labelInLegend: 'ZOTTO (60.8°N, 89.4°E)'}
    }
  });
print(chartDelta);

// --- Шаг 5: Matched comparison (наземные → TROPOMI ΔCH₄) ---
// Только записи с year+month (6 из 9 — Мухрино 2020-2023)
var matchableGround = GROUND_DATA
  .filter(ee.Filter.notNull(['year', 'month']));

var matched = matchableGround.map(function(f) {
  var siteName = f.get('site');
  var stName = ee.Algorithms.If(
    ee.Algorithms.IsEqual(siteName, 'mukhrino'), 'Mukhrino',
    ee.Algorithms.If(
      ee.Algorithms.IsEqual(siteName, 'bakchar'), 'Bakchar', 'ZOTTO'));

  var yr = f.get('year');
  var mo = f.get('month');

  var tropomiRecord = stationDeltaSeries
    .filter(ee.Filter.eq('station', stName))
    .filter(ee.Filter.eq('year', yr))
    .filter(ee.Filter.eq('month', mo));

  var xch4 = ee.Algorithms.If(tropomiRecord.size().gt(0),
    tropomiRecord.first().get('xch4'), null);
  var xch4Forest = ee.Algorithms.If(tropomiRecord.size().gt(0),
    tropomiRecord.first().get('xch4_forest'), null);
  var deltaCh4 = ee.Algorithms.If(tropomiRecord.size().gt(0),
    tropomiRecord.first().get('delta_ch4'), null);

  return f
    .set('tropomi_xch4', xch4)
    .set('tropomi_xch4_forest', xch4Forest)
    .set('tropomi_delta_ch4', deltaCh4)
    .set('station_name', stName);
});

matched = matched.filter(ee.Filter.notNull(['tropomi_delta_ch4']));

print('═══ MATCHED: TROPOMI ΔCH₄ vs GROUND ═══');
print('Matched records:', matched.size());
print('Matched table:', matched);

// --- Шаг 6: Scatter — ground flux vs TROPOMI ΔCH₄ ---
var chartScatter = ui.Chart.feature.byFeature(
    matched, 'ch4_flux', 'tropomi_delta_ch4')
  .setChartType('ScatterChart')
  .setOptions({
    title: 'TROPOMI ΔCH₄ vs Ground CH₄ flux (matched months)',
    hAxis: {title: 'Ground flux (mg CH₄ m⁻² h⁻¹)'},
    vAxis: {title: 'TROPOMI ΔCH₄ (ppb)'},
    pointSize: 8,
    trendlines: {0: {color: 'red', showR2: true}}
  });
print(chartScatter);

// --- Шаг 7: Mukhrino TROPOMI seasonal ---
var chartMukhrino = ui.Chart.feature.byFeature(
    mukhrinoSeasonal, 'month', 'xch4_mean')
  .setChartType('LineChart')
  .setOptions({
    title: 'Mukhrino: TROPOMI XCH₄ seasonal cycle (mean 2019-2025)',
    hAxis: {title: 'Month', ticks: [5, 6, 7, 8, 9, 10]},
    vAxis: {title: 'XCH₄ (ppb)'},
    pointSize: 8, lineWidth: 2, colors: ['blue']
  });
print(chartMukhrino);

// --- Шаг 8: Сводная статистика ---
print('═══ STATION SUMMARY ═══');
print('Mean XCH₄ Mukhrino:', mukhrinoSeasonal.aggregate_mean('xch4_mean'));
print('Mean XCH₄ Bakchar:', bakcharSeasonal.aggregate_mean('xch4_mean'));
print('Mean XCH₄ ZOTTO:', zottoSeasonal.aggregate_mean('xch4_mean'));
print('Mean ΔCH₄ Mukhrino:', mukhrinoSeasonal.aggregate_mean('delta_ch4_mean'));
print('Mean ΔCH₄ Bakchar:', bakcharSeasonal.aggregate_mean('delta_ch4_mean'));
print('Mean ΔCH₄ ZOTTO:', zottoSeasonal.aggregate_mean('delta_ch4_mean'));

// Наземные данные
print('═══ GROUND TRUTH DATA ═══');
print('Ground data records:', GROUND_DATA.size());
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

// --- Шаг 9: Карта ---
Map.centerObject(c.MUKHRINO, 5);
Map.addLayer(c.MUKHRINO, {color: 'yellow'}, 'Mukhrino');
Map.addLayer(c.BAKCHAR, {color: 'red'}, 'Bakchar');
Map.addLayer(c.ZOTTO, {color: 'magenta'}, 'ZOTTO');

// --- Шаг 10: Export CSV ---
Export.table.toDrive({
  collection: stationDeltaSeries,
  description: 'wetch4_station_tropomi_delta',
  fileNamePrefix: 'station_tropomi_delta',
  fileFormat: 'CSV',
  selectors: ['station', 'year', 'month', 'xch4', 'xch4_forest', 'delta_ch4']
});

Export.table.toDrive({
  collection: matched,
  description: 'wetch4_tropomi_vs_ground',
  fileNamePrefix: 'tropomi_vs_ground',
  fileFormat: 'CSV',
  selectors: ['site', 'type', 'month', 'year', 'ch4_flux',
              'tropomi_xch4', 'tropomi_xch4_forest', 'tropomi_delta_ch4', 'source']
});
