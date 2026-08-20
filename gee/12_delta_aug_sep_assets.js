/**
 * @fileoverview Создание assets ΔCH₄ на весь сезон май–октябрь.
 * Каждый месяц в двух версиях: full (вся ЗСР) и wetlands (только болота).
 * Имя файла историческое: изначально скрипт покрывал только jul/aug/sep.
 *
 * Зачем: режим "Western Siberia" в App (07_app.js, тип "Seasonal mean")
 * читает эти растры напрямую вместо расчёта из сырого TROPOMI. Экспорт идёт
 * по batch-квоте EECU и делается один раз, а App после этого не тратит
 * интерактивную квоту вообще. Без этих ассетов App честно падает обратно
 * на on-the-fly — работает, но жжёт квоту у каждого посетителя.
 *
 * ПРЕДВАРИТЕЛЬНО (вручную):
 *   Assets → New → Folder → имя "WetLandCH4"
 *   (папка должна существовать до Run All)
 *
 * Результат (12 assets, по 2 на месяц):
 *   WetLandCH4/delta_ch4_may_full       — вся ЗСР, float, ppb
 *   WetLandCH4/delta_ch4_may_wetlands   — только болота, float, ppb
 *   WetLandCH4/delta_ch4_jun_full  … _wetlands
 *   WetLandCH4/delta_ch4_jul_full  … _wetlands
 *   WetLandCH4/delta_ch4_aug_full  … _wetlands
 *   WetLandCH4/delta_ch4_sep_full       — ← этот используется для Рис. 2
 *   WetLandCH4/delta_ch4_sep_wetlands
 *   WetLandCH4/delta_ch4_oct_full  … _wetlands
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
// Весь сезон эмиссии: май–октябрь
// ============================================================

// Короткие имена месяцев — часть asset id, менять нельзя без правки
// каталога DELTA_ASSETS в 07_app.js.
var MONTHS = [
  {n: 5,  s: 'may'}, {n: 6,  s: 'jun'}, {n: 7,  s: 'jul'},
  {n: 8,  s: 'aug'}, {n: 9,  s: 'sep'}, {n: 10, s: 'oct'}
];

var results = MONTHS.map(function(m) { return exportMonth(m.n, m.s); });

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

MONTHS.forEach(function(m, i) {
  var name = m.s.charAt(0).toUpperCase() + m.s.slice(1);
  // По умолчанию показываем только сентябрь full — он идёт в Рис. 2
  Map.addLayer(results[i].full, vis, 'ΔCH₄ ' + name + ' full', m.n === 9);
  Map.addLayer(results[i].wetlands, vis, 'ΔCH₄ ' + name + ' wetlands', false);
});

// ============================================================
print('═══ 12 assets ΔCH₄ (may–oct × full/wetlands) ═══');
print('ПЕРЕД Run: убедись что папка WetLandCH4 создана в Assets.');
print('Run All 12 задач. Время: ~3–5 мин каждая, идут по batch-квоте EECU');
print('(отдельной от интерактивной, которую тратит App).');
print('Существующий ассет Export НЕ перезапишет — задача упадёт с');
print('"Cannot overwrite asset". Чтобы пересчитать месяц, сначала удали старый.');
print('');
print('Для Рис. 2 (ArcGIS) использовать: WetLandCH4/delta_ch4_sep_full');
print('После прогона App перестаёт считать Seasonal mean on-the-fly.');
