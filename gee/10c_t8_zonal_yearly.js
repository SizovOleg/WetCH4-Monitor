/**
 * @fileoverview T8: зональные данные с годовой резолюцией.
 *
 * Экспортирует ΔCH₄ для каждой комбинации (зона × год × месяц) — это даёт
 * 8 зон × 7 лет × 6 месяцев = 336 записей. Из этого вне GEE считаются
 * межгодовые SE для рисунков fig3 (бары ΔCH₄ по зонам) и fig4 (сезонный ход
 * по зонам). Существующие T1/T2 уже усреднены по годам, поэтому реплик в них
 * нет — этот модуль их добавляет.
 *
 * Не затрагивает T1, T2, T3, T4, T5, T6, T7 и сами модули 02–09. Запускать
 * отдельно, потом скачать article_t8_zonal_yearly_monthly.csv в article/data/.
 *
 * Контракт CSV (8 колонок, ≈336 строк):
 *   zone_id, zone_name, year, month,
 *   xch4_wetland, xch4_forest, delta_ch4,
 *   n_wetland_pixels
 *
 * @author O.S. Sizov, 2026
 */

// ============================================================
// Imports & masks
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

var FULL_AOI = c.FULL_AOI.simplify(1000);
var WSP = c.WSP;

var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var wetlandMask = cgls.eq(90).clip(FULL_AOI);
var forestMask  = cgls.gte(111).and(cgls.lte(126)).clip(FULL_AOI);

var monthlyAll = tropomiModule
  .buildMonthlyCollection(FULL_AOI, c.START_DATE, c.END_DATE)
  .map(function (img) { return ee.Image(img).clip(FULL_AOI); });

print('═══ T8: ZONAL × YEARLY × MONTHLY (для CI на fig3/fig4) ═══');
print('Monthly composites:', monthlyAll.size());
print('Zones:', WSP.size());

// ============================================================
// Build T8: для каждого месячного композита и каждой зоны — mean + count
// ============================================================

/**
 * Объединить редьюсер mean + count для подсчёта числа пикселей одновременно
 * со средним. Используем для проверки достаточности данных (n>=100).
 */
var meanCountReducer = ee.Reducer.mean()
  .combine({reducer2: ee.Reducer.count(), sharedInputs: true});

/**
 * Извлечь {mean, count} XCH₄ в зоне с заданной маской.
 *
 * @param {ee.Image}    img   Месячный композит TROPOMI (band 'xch4').
 * @param {ee.Image}    mask  Маска (wetland или forest).
 * @param {ee.Geometry} geom  Геометрия зоны.
 * @return {ee.Dictionary}    Ключи: xch4_mean, xch4_count.
 */
function reduceZone(img, mask, geom) {
  return ee.Dictionary(img.updateMask(mask).reduceRegion({
    reducer: meanCountReducer,
    geometry: geom,
    scale: 7000,
    maxPixels: 1e10,
    bestEffort: true
  }));
}

function safeGet(dict, key) {
  return ee.Algorithms.If(dict.contains(key), dict.get(key), null);
}

// Кросс-произведение: каждый месячный композит × каждая зона
var t8 = ee.FeatureCollection(monthlyAll.map(function (img) {
  img = ee.Image(img);
  var year  = img.get('year');
  var month = img.get('month');

  return WSP.map(function (zone) {
    var geom   = zone.geometry();
    var zoneId = ee.Number(zone.get('ID')).int();

    var wetStats = reduceZone(img, wetlandMask, geom);
    var forStats = reduceZone(img, forestMask,  geom);

    var xWet = safeGet(wetStats, 'xch4_mean');
    var nWet = ee.Number(ee.Algorithms.If(
      ee.Algorithms.IsEqual(safeGet(wetStats, 'xch4_count'), null), 0,
      safeGet(wetStats, 'xch4_count')
    ));
    var xFor = safeGet(forStats, 'xch4_mean');

    var delta = ee.Algorithms.If(
      ee.Algorithms.IsEqual(xWet, null), null,
      ee.Algorithms.If(ee.Algorithms.IsEqual(xFor, null), null,
        ee.Number(xWet).subtract(ee.Number(xFor))
      )
    );

    return ee.Feature(ee.Geometry.Point([0, 0]), {
      zone_id:           zoneId,
      zone_name:         zone.get('zone_name'),
      year:              year,
      month:             month,
      xch4_wetland:      xWet,
      xch4_forest:       xFor,
      delta_ch4:         delta,
      n_wetland_pixels:  nWet
    });
  });
})).flatten();

// Diagnostics — первые 3 строки и общее количество
print('Total features (≈336 = 8 zones × 7 years × 6 months):', t8.size());
print('Первые 3 строки T8:', t8.limit(3));

// ============================================================
// Export
// ============================================================

Export.table.toDrive({
  collection: t8,
  description: 'article_t8_zonal_yearly_monthly',
  fileFormat: 'CSV',
  selectors: [
    'zone_id', 'zone_name', 'year', 'month',
    'xch4_wetland', 'xch4_forest', 'delta_ch4',
    'n_wetland_pixels'
  ]
});

// Параллельный экспорт в asset — для использования в 07_app.js
// (charts 3, 4 будут считать межгодовые SE on-the-fly из этого asset)
Export.table.toAsset({
  collection: t8,
  description: 'asset_zonal_seasonal_yearly',
  assetId: 'projects/nodal-thunder-481307-u1/assets/WetLandCH4/zonal_seasonal_yearly'
});

print('═══ Export queued: article_t8_zonal_yearly_monthly ═══');
print('Запустите Tasks → Run; после скачивания CSV пересоберутся fig3/fig4 ' +
      'с межгодовыми SE.');
