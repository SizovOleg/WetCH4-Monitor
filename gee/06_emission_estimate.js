/**
 * @fileoverview Module 6: Полный AOI + оценка суммарной эмиссии CH₄.
 *
 * Масштабирование на всю Западно-Сибирскую низменность (55–68°N, 60–85°E).
 * Карта ΔCH₄ июль — главная фигура статьи.
 * Transfer function: наземный flux × площадь болот × часы → Тг CH₄/год.
 *
 * ВАЖНО: Не используем buildLandcoverMask() — его reproject({scale:7000})
 * вызывает "Reprojection output too large" на FULL_AOI. Загружаем CGLS
 * напрямую и создаём бинарные маски на 100m без reproject.
 *
 * Output contract:
 *   deltaMap — ee.Image, band 'delta_ch4' (ppb), July mean
 *   fluxMap — ee.Image, band 'flux_estimate' (mg CH₄/m²/h)
 *   суммарная эмиссия: Тг CH₄/год ± sensitivity
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var palettes = require('users/ntcomz18_sand/wetch4_ws:gee/lib/palettes');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

// ============================================================
// Часть A: Маски и площади (CGLS напрямую, без reproject)
// ============================================================

// Полный AOI: контур ЗСР (упрощён до 1км — снижает нагрузку на GEE)
var FULL_AOI = c.FULL_AOI.simplify(1000);

print('═══ MODULE 6: FULL AOI EMISSION ESTIMATE ═══');

// CGLS-LC100 → бинарные маски на 100m (без reduceResolution/reproject)
var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var wetlandBinary = cgls.eq(90).rename('wetland').clip(FULL_AOI);
var forestBinary = cgls.gte(111).and(cgls.lte(126)).rename('forest').clip(FULL_AOI);

// --- Площадь болот (scale:1000 — достаточно для оценки) ---
var wetlandAreaDict = wetlandBinary.multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: FULL_AOI,
    scale: 1000,
    maxPixels: 1e10,
    tileScale: 8
  });
var wetlandAreaM2 = ee.Number(wetlandAreaDict.get('wetland'));

print('Wetland area (km²):', wetlandAreaM2.divide(1e6));
print('Wetland area (× 10³ km²):', wetlandAreaM2.divide(1e9));

// ============================================================
// Часть B: Enhancement на полном AOI
// ============================================================

var monthlyFull = tropomiModule.buildMonthlyCollection(
    FULL_AOI, c.START_DATE, c.END_DATE)
    .map(function(img) { return ee.Image(img).clip(FULL_AOI); });
print('Monthly composites:', monthlyFull.size());

// XCH₄(wetland) − XCH₄(forest) для каждого месячного композита
// GEE ресамплирует 100m маску в 7km через nearest neighbor при reduceRegion
var enhancementRaw = monthlyFull.map(function(img) {
  img = ee.Image(img);
  var xch4Wet = img.updateMask(wetlandBinary).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI,
    scale: 7000,
    maxPixels: 1e9,
    tileScale: 8
  }).get('xch4');

  var xch4For = img.updateMask(forestBinary).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI,
    scale: 7000,
    maxPixels: 1e9,
    tileScale: 8
  }).get('xch4');

  return ee.Feature(null, {
    'year': img.get('year'),
    'month': img.get('month'),
    'xch4_wetland': xch4Wet,
    'xch4_forest': xch4For
  });
});

// Фильтр null → delta (паттерн Module 3)
var enhancementFC = ee.FeatureCollection(enhancementRaw)
    .filter(ee.Filter.notNull(['xch4_wetland', 'xch4_forest']))
    .map(function(f) {
      var delta = ee.Number(f.get('xch4_wetland'))
          .subtract(ee.Number(f.get('xch4_forest')));
      return f.set('delta_ch4', delta);
    });

print('Enhancement records:', enhancementFC.size());
print('Full AOI mean ΔCH₄:', enhancementFC.aggregate_mean('delta_ch4'), 'ppb');

// ============================================================
// Часть C: Сезонный ход
// ============================================================

var months = ee.List(c.SUMMER_MONTHS);

var seasonalFull = ee.FeatureCollection(months.map(function(m) {
  var subset = enhancementFC.filter(ee.Filter.eq('month', m));
  return ee.Feature(null, {
    'month': m,
    'delta_ch4': subset.aggregate_mean('delta_ch4'),
    'delta_ch4_std': subset.aggregate_total_sd('delta_ch4'),
    'xch4_wetland': subset.aggregate_mean('xch4_wetland'),
    'xch4_forest': subset.aggregate_mean('xch4_forest')
  });
}));
print('Seasonal full AOI:', seasonalFull);

// График: XCH₄ Wetlands vs Forests
var chartWetFor = ui.Chart.feature.byFeature(seasonalFull, 'month',
    ['xch4_wetland', 'xch4_forest'])
  .setChartType('LineChart')
  .setOptions({
    title: 'Full AOI: Seasonal XCH₄ Wetlands vs Forests (55-68°N, 60-85°E)',
    hAxis: {title: 'Month', ticks: [5, 6, 7, 8, 9, 10]},
    vAxis: {title: 'XCH₄ (ppb)'},
    series: {
      0: {color: 'cyan', lineWidth: 2, pointSize: 6, labelInLegend: 'Wetlands'},
      1: {color: 'darkgreen', lineWidth: 2, pointSize: 6, labelInLegend: 'Forests'}
    }
  });
print(chartWetFor);

// График: ΔCH₄ столбчатый
var chartDeltaFull = ui.Chart.feature.byFeature(seasonalFull, 'month', 'delta_ch4')
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Full AOI: Seasonal ΔCH₄ (mean 2019-2025)',
    hAxis: {title: 'Month', ticks: [5, 6, 7, 8, 9, 10]},
    vAxis: {title: 'ΔCH₄ (ppb)'},
    colors: ['#1f77b4']
  });
print(chartDeltaFull);

// ============================================================
// Часть D: Карта ΔCH₄ июль (главная фигура статьи)
// ============================================================

var julyComposites = monthlyFull.filter(ee.Filter.eq('month', 7));
var julyMean = julyComposites.mean().clip(FULL_AOI); // band 'xch4'

// Фон: mean XCH₄ по лесам за июль (100m маска + scale:7000)
var julyForestBg = julyMean.updateMask(forestBinary).reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: FULL_AOI,
  scale: 7000,
  maxPixels: 1e9,
  tileScale: 8
}).get('xch4');

print('July forest background XCH₄:', julyForestBg, 'ppb');

var deltaMap = julyMean
  .subtract(ee.Image.constant(ee.Number(julyForestBg)))
  .rename('delta_ch4')
  .clip(FULL_AOI);

var deltaVis = {
  min: -15, max: 30,
  palette: ['blue', 'white', 'yellow', 'orange', 'red']
};

// Очистить слои от smoke test импортированных модулей
Map.layers().reset();
Map.centerObject(FULL_AOI, 5);
Map.addLayer(deltaMap, deltaVis, 'ΔCH₄ July mean (full AOI)');
Map.addLayer(deltaMap.updateMask(wetlandBinary), deltaVis,
  'ΔCH₄ July (wetlands only)');

// Станции
Map.addLayer(c.MUKHRINO, {color: 'yellow'}, 'Mukhrino');
Map.addLayer(c.BAKCHAR, {color: 'red'}, 'Bakchar');
Map.addLayer(c.ZOTTO, {color: 'magenta'}, 'ZOTTO');

// ============================================================
// Часть E: Оценка суммарной эмиссии (transfer function)
// ============================================================

// Параметры из наземных данных (calibration/all_ground_ch4.csv)
var FLUX_HOLLOW = 6.03;    // мг CH₄/м²/ч (hollow + waterlogged hollow mean)
var FLUX_RIDGE  = 0.04;    // мг CH₄/м²/ч (ridge mean)
var HOLLOW_FRACTION = 0.5; // 50% мочажин — типично для raised bogs ЗС

var MEAN_FLUX = FLUX_HOLLOW * HOLLOW_FRACTION + FLUX_RIDGE * (1 - HOLLOW_FRACTION);
// = 6.03 × 0.5 + 0.04 × 0.5 = 3.035 мг CH₄/м²/ч

var EMISSION_HOURS = 180 * 24; // 180 дней (май–октябрь) × 24 ч = 4320 часов

// Total = flux × area × hours / 1e15 (мг → Тг)
var totalEmission = ee.Number(MEAN_FLUX)
  .multiply(wetlandAreaM2)
  .multiply(EMISSION_HOURS)
  .divide(1e15);

print('═══ EMISSION ESTIMATE ═══');
print('Mean flux (weighted):', MEAN_FLUX, 'mg CH₄/m²/h');
print('Hollow fraction:', HOLLOW_FRACTION);
print('Emission season:', EMISSION_HOURS, 'hours');
print('Total emission:', totalEmission, 'Tg CH₄/yr');
print('');
print('Reference: Glagolev Bc8 = 3.21 Tg C-CH₄/yr = 4.28 Tg CH₄/yr');
print('Reference: Kim et al. 2011 ≈ 6 Tg CH₄/yr');

// ============================================================
// Часть F: Sensitivity analysis (30 / 50 / 70% мочажин)
// ============================================================

var flux30 = FLUX_HOLLOW * 0.3 + FLUX_RIDGE * 0.7;
var flux50 = MEAN_FLUX;
var flux70 = FLUX_HOLLOW * 0.7 + FLUX_RIDGE * 0.3;

var em30 = ee.Number(flux30).multiply(wetlandAreaM2)
    .multiply(EMISSION_HOURS).divide(1e15);
var em50 = totalEmission;
var em70 = ee.Number(flux70).multiply(wetlandAreaM2)
    .multiply(EMISSION_HOURS).divide(1e15);

var scenarios = ee.FeatureCollection([
  ee.Feature(null, {
    scenario: 'Low (30% hollow)', flux_mg: flux30, emission_tg: em30}),
  ee.Feature(null, {
    scenario: 'Mid (50% hollow)', flux_mg: flux50, emission_tg: em50}),
  ee.Feature(null, {
    scenario: 'High (70% hollow)', flux_mg: flux70, emission_tg: em70})
]);

print('═══ SENSITIVITY ═══');
print('Scenarios:', scenarios);

// ============================================================
// Часть G: Зональная декомпозиция (8 природных зон ЗСР)
// ============================================================

var zones = c.WSP; // 8 зон из shapefile (поле ID)

// reduceRegions: 2 вызова вместо 16 reduceRegion

// Шаг 1: площадь болот по зонам (scale:1000)
var zoneStats = wetlandBinary.multiply(ee.Image.pixelArea())
  .reduceRegions({
    collection: zones,
    reducer: ee.Reducer.sum(),
    scale: 1000,
    tileScale: 8
  });

// Шаг 2: ΔCH₄ июль по болотным пикселям зон (7km)
zoneStats = deltaMap.updateMask(wetlandBinary)
  .reduceRegions({
    collection: zoneStats,
    reducer: ee.Reducer.mean(),
    scale: 7000,
    tileScale: 8
  });

// Шаг 3: имя зоны + расчёт эмиссии
// ee.Algorithms.If для зон без болот (степь/лесостепь → wetland = null)
var ZONES_DICT = ee.Dictionary(c.ZONES);
zoneStats = zoneStats.map(function(zone) {
  var wetRaw = zone.get('wetland');
  var wetArea = ee.Number(ee.Algorithms.If(wetRaw, wetRaw, 0));
  var zoneId = ee.Number(zone.get('ID'));
  var emission = ee.Number(MEAN_FLUX)
    .multiply(wetArea)
    .multiply(EMISSION_HOURS)
    .divide(1e15);
  var deltaRaw = zone.get('delta_ch4');
  return zone.set({
    'zone_name': ZONES_DICT.get(zoneId.format('%d')),
    'wetland_area_km2': wetArea.divide(1e6),
    'july_delta_ch4': ee.Algorithms.If(deltaRaw, deltaRaw, 0),
    'emission_tg': emission
  });
});

print('═══ ZONAL DECOMPOSITION (8 natural zones) ═══');
print('Zone stats:', zoneStats);

// Визуализация зон на карте
var zonesImage = c.WSP.reduceToImage({
  properties: ['ID'], reducer: ee.Reducer.first()
}).rename('zone_id');
Map.addLayer(zonesImage, {min: 1, max: 8, palette: c.ZONE_PALETTE},
  'Natural zones', false);

// ============================================================
// Часть H: Flux estimate map (для Module 7 App)
// ============================================================

var fluxMap = ee.Image.constant(MEAN_FLUX)
  .updateMask(wetlandBinary)
  .rename('flux_estimate')
  .clip(FULL_AOI);

Map.addLayer(fluxMap, {
  min: 0, max: 6,
  palette: ['white', 'yellow', 'orange', 'red']
}, 'Flux estimate (mg CH₄/m²/h)', false);

// ============================================================
// Exports
// ============================================================

exports.deltaMap = deltaMap;
exports.fluxMap = fluxMap;
exports.enhancementFC = enhancementFC;
exports.wetlandAreaM2 = wetlandAreaM2;

// --- Export to Drive ---
Export.table.toDrive({
  collection: enhancementFC,
  description: 'wetch4_full_aoi_enhancement',
  fileNamePrefix: 'full_aoi_enhancement',
  fileFormat: 'CSV',
  selectors: ['year', 'month', 'xch4_wetland', 'xch4_forest', 'delta_ch4']
});

Export.table.toDrive({
  collection: zoneStats,
  description: 'wetch4_zonal_emission',
  fileNamePrefix: 'zonal_emission',
  fileFormat: 'CSV',
  selectors: ['ID', 'zone_name', 'wetland_area_km2', 'july_delta_ch4', 'emission_tg']
});

Export.image.toDrive({
  image: deltaMap,
  description: 'wetch4_delta_ch4_july_mean',
  fileNamePrefix: 'delta_ch4_july_mean',
  region: FULL_AOI,
  scale: 7000,
  maxPixels: 1e10
});
