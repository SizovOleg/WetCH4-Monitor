/**
 * @fileoverview Создание 6 assets ΔCH₄ для рисунков: июль, август, сентябрь.
 * Каждый месяц в двух версиях: full (вся ЗСР) и wetlands (только болота).
 *
 * ПРЕДВАРИТЕЛЬНО (вручную):
 *   Assets → New → Folder → имя "WetLandCH4"
 *   (папка должна существовать до Run All)
 *
 * Результат (6 assets):
 *   WetLandCH4/delta_ch4_jul_full       — вся ЗСР, float, ppb
 *   WetLandCH4/delta_ch4_jul_wetlands   — только болота, float, ppb
 *   WetLandCH4/delta_ch4_aug_full
 *   WetLandCH4/delta_ch4_aug_wetlands
 *   WetLandCH4/delta_ch4_sep_full       — ← этот используется для Рис. 2
 *   WetLandCH4/delta_ch4_sep_wetlands
 *
 * Методика (идентично Module 06):
 *   monthly_mean(M)  = avg(monthlyAll, month=M) за 2019–2025
 *   forest_bg(M)     = mean XCH₄ по лесным пикселям CGLS 111–126
 *   delta(M)_full    = monthly_mean(M) − forest_bg(M)
 *   delta(M)_wetland = delta(M)_full.updateMask(wetland_mask)
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

var FOLDER = 'projects/nodal-thunder-481307-u1/assets/WetLandCH4/';
var FULL_AOI = c.FULL_AOI.simplify(1000);

// ============================================================
// Маски и TROPOMI коллекция
// ============================================================

var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var wetlandBinary = cgls.eq(90).clip(FULL_AOI);
var forestBinary  = cgls.gte(111).and(cgls.lte(126)).clip(FULL_AOI);

var monthlyAll = tropomiModule.buildMonthlyCollection(
  FULL_AOI, c.START_DATE, c.END_DATE
).map(function(img) { return ee.Image(img).clip(FULL_AOI); });

// ============================================================
// Расчёт ΔCH₄ для месяца
// ============================================================

function deltaForMonth(month) {
  var monthMean = monthlyAll
    .filter(ee.Filter.eq('month', month))
    .mean()
    .clip(FULL_AOI);

  // Средний XCH₄ над лесом (forest background)
  var forestBg = monthMean.updateMask(forestBinary).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI,
    scale: 7000,
    maxPixels: 1e9,
    tileScale: 8
  }).get('xch4');

  // Средний XCH₄ над болотами (для сверки)
  var wetlandMean = monthMean.updateMask(wetlandBinary).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI,
    scale: 7000,
    maxPixels: 1e9,
    tileScale: 8
  }).get('xch4');

  var deltaFull = monthMean
    .subtract(ee.Image.constant(ee.Number(forestBg)))
    .rename('delta_ch4')
    .clip(FULL_AOI)
    .toFloat();

  // Средний ΔCH₄ только по болотам — ключевое число для статьи
  var deltaWetlandMean = deltaFull.updateMask(wetlandBinary).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI,
    scale: 7000,
    maxPixels: 1e9,
    tileScale: 8
  }).get('delta_ch4');

  return {
    full: deltaFull,
    wetlands: deltaFull.updateMask(wetlandBinary),
    forestBg: forestBg,
    wetlandMean: wetlandMean,
    deltaWetlandMean: deltaWetlandMean
  };
}

// ============================================================
// Экспорт 2 assets (full + wetlands) для одного месяца
// ============================================================

function exportMonth(month, shortName) {
  var d = deltaForMonth(month);
  print('─── Month ' + month + ' (' + shortName.toUpperCase() + ') ───');
  print('  XCH₄ wetlands (mean):', d.wetlandMean, 'ppb');
  print('  XCH₄ forest   (mean):', d.forestBg,    'ppb');
  print('  ΔCH₄ over wetlands (full AOI):', d.deltaWetlandMean, 'ppb');

  Export.image.toAsset({
    image: d.full,
    description: 'asset_delta_' + shortName + '_full',
    assetId: FOLDER + 'delta_ch4_' + shortName + '_full',
    region: FULL_AOI,
    scale: 7000,
    maxPixels: 1e10
  });

  Export.image.toAsset({
    image: d.wetlands,
    description: 'asset_delta_' + shortName + '_wetlands',
    assetId: FOLDER + 'delta_ch4_' + shortName + '_wetlands',
    region: FULL_AOI,
    scale: 7000,
    maxPixels: 1e10
  });

  return d;
}

// ============================================================
// Все три месяца
// ============================================================

var jul = exportMonth(7, 'jul');
var aug = exportMonth(8, 'aug');
var sep = exportMonth(9, 'sep');

// ============================================================
// Preview
// ============================================================

Map.layers().reset();
Map.centerObject(FULL_AOI, 5);
Map.setOptions('HYBRID');

var vis = {
  min: -10, max: 25,
  palette: ['#2166ac','#67a9cf','#d1e5f0','#f7f7f7','#fddbc7','#ef8a62','#b2182b']
};

Map.addLayer(jul.full, vis, 'ΔCH₄ Jul full', false);
Map.addLayer(jul.wetlands, vis, 'ΔCH₄ Jul wetlands', false);
Map.addLayer(aug.full, vis, 'ΔCH₄ Aug full', false);
Map.addLayer(aug.wetlands, vis, 'ΔCH₄ Aug wetlands', false);
Map.addLayer(sep.full, vis, 'ΔCH₄ Sep full', true);   // ← показать по умолчанию
Map.addLayer(sep.wetlands, vis, 'ΔCH₄ Sep wetlands', false);

// ============================================================
print('═══ 6 assets ΔCH₄ (jul/aug/sep × full/wetlands) ═══');
print('ПЕРЕД Run: убедись что папка WetLandCH4 создана в Assets.');
print('Run All 6 задач. Время: ~3–5 мин каждая.');
print('');
print('Для Рис. 2 (ArcGIS) использовать: WetLandCH4/delta_ch4_sep_full');
