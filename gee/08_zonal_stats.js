/**
 * @fileoverview Зональная статистика для статьи.
 *
 * Для каждой из 8 природных зон ЗСР вычисляет:
 *   1. Доля болот (%)
 *   2. T_air (°C) — средняя за тёплый период над болотами
 *   3. NDVI болот
 *   4. XCH₄ болот (ppb)
 *   5. XCH₄ не-болот (ppb)
 *   6. ΔCH₄ (ppb) = болота − не-болота
 *
 * Средние за май–октябрь 2019–2025.
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var palettes = require('users/ntcomz18_sand/wetch4_ws:gee/lib/palettes');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

// ============================================================
// Подготовка данных
// ============================================================

var FULL_AOI = c.FULL_AOI;
var WSP = c.WSP;

// CGLS маски (без reproject)
var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var wetlandMask = cgls.eq(90).clip(FULL_AOI);
var nonWetlandMask = wetlandMask.not().clip(FULL_AOI);

// XCH₄ месячные → общее среднее за все годы
var monthlyXCH4 = tropomiModule.buildMonthlyCollection(
  FULL_AOI, c.START_DATE, c.END_DATE
).map(function(img) { return ee.Image(img).clip(FULL_AOI); });

var meanXCH4 = monthlyXCH4.mean().rename('xch4');

// ERA5 T_air — среднее за тёплый период 2019–2025
var years = ee.List.sequence(2019, 2025);

var meanTemp = ee.ImageCollection(years.map(function(y) {
  y = ee.Number(y);
  var start = ee.Date.fromYMD(y, 5, 1);
  var end = ee.Date.fromYMD(y, 11, 1);
  return ee.ImageCollection(c.ERA5_COLLECTION)
    .filterDate(start, end)
    .select('temperature_2m')
    .mean()
    .subtract(273.15)
    .rename('t_air');
})).mean();

// MODIS NDVI — среднее за тёплый период 2019–2025
var meanNDVI = ee.ImageCollection(years.map(function(y) {
  y = ee.Number(y);
  var start = ee.Date.fromYMD(y, 5, 1);
  var end = ee.Date.fromYMD(y, 11, 1);
  return ee.ImageCollection('MODIS/061/MOD13A1')
    .filterDate(start, end)
    .select('NDVI')
    .mean()
    .multiply(0.0001)
    .rename('ndvi');
})).mean();

print('═══ ZONAL STATISTICS FOR PAPER ═══');
print('Mean XCH₄ images:', monthlyXCH4.size());

// ============================================================
// Вычисление статистики по 8 зонам
// ============================================================

var zoneNames = ee.Dictionary({
  '1': 'Tundra',
  '2': 'Forest-tundra',
  '3': 'Northern taiga',
  '4': 'Middle taiga',
  '5': 'Southern taiga',
  '6': 'Subtaiga',
  '7': 'Forest-steppe',
  '8': 'Steppe'
});

var zoneStats = WSP.map(function(zone) {
  var geom = zone.geometry();
  var zoneId = ee.Number(zone.get('ID')).int();

  // Площадь зоны (км²)
  var totalArea = ee.Number(ee.Image.pixelArea().reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geom, scale: 1000, maxPixels: 1e11, tileScale: 4
  }).values().get(0));

  // Площадь болот (км²)
  var wetArea = ee.Number(wetlandMask.multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geom, scale: 100, maxPixels: 1e11, tileScale: 4
  }).values().get(0));

  // Доля болот (%)
  var wetFraction = wetArea.divide(totalArea).multiply(100);

  // T_air над болотами (°C)
  var tAirWet = meanTemp.updateMask(wetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom, scale: 11000, maxPixels: 1e10, tileScale: 4
  }).get('t_air');

  // NDVI болот
  var ndviWet = meanNDVI.updateMask(wetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom, scale: 500, maxPixels: 1e10, tileScale: 4
  }).get('ndvi');

  // XCH₄ болот (ppb)
  var xch4Wet = meanXCH4.updateMask(wetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom, scale: 7000, maxPixels: 1e10, tileScale: 4
  }).get('xch4');

  // XCH₄ не-болот (ppb)
  var xch4NonWet = meanXCH4.updateMask(nonWetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom, scale: 7000, maxPixels: 1e10, tileScale: 4
  }).get('xch4');

  // ΔCH₄ (ppb)
  var deltaCH4 = ee.Number(xch4Wet).subtract(ee.Number(xch4NonWet));

  return zone.set({
    'zone_name': zoneNames.get(zoneId.format('%d')),
    'zone_id': zoneId,
    'total_area_km2': totalArea.divide(1e6),
    'wetland_area_km2': wetArea.divide(1e6),
    'wetland_fraction_pct': wetFraction,
    't_air_wetland_c': tAirWet,
    'ndvi_wetland': ndviWet,
    'xch4_wetland_ppb': xch4Wet,
    'xch4_nonwetland_ppb': xch4NonWet,
    'delta_ch4_ppb': deltaCH4
  });
});

// Сортировка по ID (от тундры к степи)
var sorted = zoneStats.sort('zone_id');
print('Zone stats:', sorted);

// ============================================================
// Графики
// ============================================================

// 1. Доля болот по зонам
var chartWetFrac = ui.Chart.feature.byFeature(sorted, 'zone_name', 'wetland_fraction_pct')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Wetland fraction by natural zone (%)',
    hAxis: {title: 'Zone', slantedText: true},
    vAxis: {title: 'Wetland fraction (%)'},
    colors: ['#1f77b4'],
    legend: 'none'
  });
print(chartWetFrac);

// 2. ΔCH₄ по зонам
var chartDelta = ui.Chart.feature.byFeature(sorted, 'zone_name', 'delta_ch4_ppb')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Enhancement ΔCH₄ by natural zone (ppb)',
    hAxis: {title: 'Zone', slantedText: true},
    vAxis: {title: 'ΔCH₄ (ppb)', baseline: 0},
    colors: ['#d62728'],
    legend: 'none'
  });
print(chartDelta);

// 3. ΔCH₄ vs T_air (scatter, 8 точек)
var chartDeltaTemp = ui.Chart.feature.byFeature(sorted, 't_air_wetland_c', 'delta_ch4_ppb')
  .setChartType('ScatterChart')
  .setOptions({
    title: 'ΔCH₄ vs T_air by natural zone',
    hAxis: {title: 'T_air (°C, warm season mean)'},
    vAxis: {title: 'ΔCH₄ (ppb)'},
    pointSize: 8,
    trendlines: {0: {color: 'red', showR2: true}}
  });
print(chartDeltaTemp);

// 4. ΔCH₄ vs wetland fraction (scatter, 8 точек)
var chartDeltaWet = ui.Chart.feature.byFeature(sorted, 'wetland_fraction_pct', 'delta_ch4_ppb')
  .setChartType('ScatterChart')
  .setOptions({
    title: 'ΔCH₄ vs Wetland fraction by zone',
    hAxis: {title: 'Wetland fraction (%)'},
    vAxis: {title: 'ΔCH₄ (ppb)'},
    pointSize: 8,
    trendlines: {0: {color: 'red', showR2: true}}
  });
print(chartDeltaWet);

// ============================================================
// Карта зон
// ============================================================

Map.centerObject(FULL_AOI, 5);
var zonesImage = WSP.reduceToImage({
  properties: ['ID'], reducer: ee.Reducer.first()
}).rename('zone_id');
Map.addLayer(zonesImage, {min: 1, max: 8, palette: c.ZONE_PALETTE}, 'Natural zones');

// Болота поверх зон
Map.addLayer(wetlandMask.selfMask(), {palette: ['cyan'], opacity: 0.3}, 'Wetlands');

// Станции
Map.addLayer(c.MUKHRINO, {color: 'yellow'}, 'Mukhrino');
Map.addLayer(c.BAKCHAR, {color: 'red'}, 'Bakchar');
Map.addLayer(c.ZOTTO, {color: 'magenta'}, 'ZOTTO');

// ============================================================
// Export
// ============================================================

Export.table.toDrive({
  collection: sorted,
  description: 'wetch4_zonal_statistics_8zones',
  fileFormat: 'CSV',
  selectors: ['zone_id', 'zone_name', 'total_area_km2', 'wetland_area_km2',
              'wetland_fraction_pct', 't_air_wetland_c', 'ndvi_wetland',
              'xch4_wetland_ppb', 'xch4_nonwetland_ppb', 'delta_ch4_ppb']
});
