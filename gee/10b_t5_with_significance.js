/**
 * @fileoverview T5 экспорт с пиксельными SD и N для статистической оценки
 * значимости ΔCH₄ = XCH₄(болота) − XCH₄(фон).
 *
 * Замещает таблицу `article_t5_full_aoi_monthly`: добавлены SD и количество
 * валидных пикселей TROPOMI отдельно для болотных (CGLS класс 90) и лесных
 * (CGLS классы 111–126) пикселей внутри FULL_AOI (вся ЗСР). На основе
 * полученных значений вне GEE рассчитывается двухвыборочный t-критерий
 * Уэлча и размер эффекта Cohen's d для каждого из 42 композитов.
 *
 * Не затрагивает T1, T2, T3, T4, T6, T7 и сами модули 02-09. Если
 * нужно — запустить только этот файл, перезаписать прежний CSV в Drive.
 *
 * Запуск: открыть в GEE Code Editor → Run → Tasks → Run for
 * `article_t5_full_aoi_monthly` → скачать из Drive в article/data/.
 *
 * Контракт CSV (9 колонок, 41–42 строки 7 лет × 6 мес минус август 2022):
 *   year, month,
 *   xch4_wetland, xch4_wetland_sd, n_wetland_pixels,
 *   xch4_forest,  xch4_forest_sd,  n_forest_pixels,
 *   delta_ch4
 *
 * @author O.S. Sizov, 2026
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

// ============================================================
// Constants & masks
// ============================================================

/** @const {ee.Geometry} Упрощённая геометрия ЗСР для устойчивых reduceRegion. */
var FULL_AOI = c.FULL_AOI.simplify(1000);

/**
 * @const {ee.Image} CGLS-LC100 Discrete Classification (тот же слой,
 *                   что в 10_article_exports.js).
 */
var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');

/** @const {ee.Image} Маска болот (CGLS class 90) внутри FULL_AOI. */
var wetlandMask = cgls.eq(90).clip(FULL_AOI);

/** @const {ee.Image} Маска лесов (CGLS classes 111–126) внутри FULL_AOI. */
var forestMask = cgls.gte(111).and(cgls.lte(126)).clip(FULL_AOI);

/**
 * @const {ee.ImageCollection} Месячные композиты TROPOMI XCH₄
 *                             (band 'xch4', ppb) за тёплый сезон 2019–2025.
 */
var monthlyAll = tropomiModule
  .buildMonthlyCollection(FULL_AOI, c.START_DATE, c.END_DATE)
  .map(function (img) {
    return ee.Image(img).clip(FULL_AOI);
  });

/** @const {number} Минимум валидных пикселей TROPOMI для расчёта SD. */
var MIN_PIXELS_FOR_SD = 100;

print('═══ T5 EXPORT с пиксельными SD/N (reviewer request) ═══');
print('Number of monthly composites:', monthlyAll.size());

// ============================================================
// Combined reducer: mean + stdDev + count
// ============================================================

/**
 * Комбинированный редьюсер: среднее, стандартное отклонение, число
 * валидных пикселей. Применяется к одному бэнду 'xch4'.
 *
 * Ключи результата (после combine() с sharedInputs:true):
 *   xch4_mean    — среднее по пикселям
 *   xch4_stdDev  — пиксельное стандартное отклонение
 *   xch4_count   — число валидных пикселей TROPOMI после маски
 *
 * Если фактические имена будут отличаться (например, после переименования
 * бэнда), достаточно исправить ключи в `safeGet()` ниже —
 * имена выводятся в консоль через diagnostics-блок в конце.
 */
var combinedReducer = ee.Reducer.mean()
  .combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true})
  .combine({reducer2: ee.Reducer.count(),  sharedInputs: true});

/**
 * Безопасное извлечение значения из словаря reduceRegion.
 *
 * @param {ee.Dictionary} dict   Результат reduceRegion как ee.Dictionary.
 * @param {string}        key    Имя ключа, например 'xch4_mean'.
 * @return {?number}             Значение или null, если ключ отсутствует.
 */
function safeGet(dict, key) {
  return ee.Algorithms.If(dict.contains(key), dict.get(key), null);
}

/**
 * Вычислить статистику XCH₄ в пределах AOI с применением маски.
 *
 * @param {ee.Image}     img      Месячный композит TROPOMI (band 'xch4').
 * @param {ee.Image}     mask     Маска (wetlandMask или forestMask).
 * @param {ee.Geometry}  aoi      Область интегрирования.
 * @return {ee.Dictionary}        Словарь с ключами xch4_mean, xch4_stdDev,
 *                                xch4_count.
 */
function reduceWithStats(img, mask, aoi) {
  return ee.Dictionary(img.updateMask(mask).reduceRegion({
    reducer: combinedReducer,
    geometry: aoi,
    scale: 7000,           // ≈ нативный пиксель TROPOMI L3
    maxPixels: 1e10,
    bestEffort: true
  }));
}

// ============================================================
// T5: Full AOI monthly с SD и N
// ============================================================

/** @type {ee.FeatureCollection} 42 строки (год × месяц), 9 колонок. */
var t5MonthlyFull = ee.FeatureCollection(monthlyAll.map(function (img) {
  img = ee.Image(img);

  var wetStats = reduceWithStats(img, wetlandMask, FULL_AOI);
  var forStats = reduceWithStats(img, forestMask,  FULL_AOI);

  // Извлекаем сырые значения с защитой от отсутствующих ключей
  var xWetMean   = safeGet(wetStats, 'xch4_mean');
  var xWetSdRaw  = safeGet(wetStats, 'xch4_stdDev');
  var nWetRaw    = safeGet(wetStats, 'xch4_count');
  var xForMean   = safeGet(forStats, 'xch4_mean');
  var xForSdRaw  = safeGet(forStats, 'xch4_stdDev');
  var nForRaw    = safeGet(forStats, 'xch4_count');

  // Count: если null — считаем 0
  var nWet = ee.Number(ee.Algorithms.If(
    ee.Algorithms.IsEqual(nWetRaw, null), 0, nWetRaw
  ));
  var nFor = ee.Number(ee.Algorithms.If(
    ee.Algorithms.IsEqual(nForRaw, null), 0, nForRaw
  ));

  // SD: NaN (null) если число пикселей < 100; иначе исходное значение
  var xWetSd = ee.Algorithms.If(
    nWet.gte(MIN_PIXELS_FOR_SD), xWetSdRaw, null
  );
  var xForSd = ee.Algorithms.If(
    nFor.gte(MIN_PIXELS_FOR_SD), xForSdRaw, null
  );

  // ΔCH4 = mean_wet − mean_forest (как в исходной T5)
  var deltaCh4 = ee.Algorithms.If(
    ee.Algorithms.IsEqual(xWetMean, null), null,
    ee.Algorithms.If(ee.Algorithms.IsEqual(xForMean, null), null,
      ee.Number(xWetMean).subtract(ee.Number(xForMean))
    )
  );

  return ee.Feature(ee.Geometry.Point([0, 0]), {
    year:              img.get('year'),
    month:             img.get('month'),
    xch4_wetland:      xWetMean,
    xch4_wetland_sd:   xWetSd,
    n_wetland_pixels:  nWet,
    xch4_forest:       xForMean,
    xch4_forest_sd:    xForSd,
    n_forest_pixels:   nFor,
    delta_ch4:         deltaCh4
  });
}));

// Не фильтруем по notNull — все строки сохраняются (август 2022 уже
// исключён upstream-модулем 02_tropomi_monthly при отсутствии данных).

// ============================================================
// Diagnostics — печатать в консоли GEE для проверки
// ============================================================

// Имена ключей комбинированного редьюсера на первом композите
var firstImg = ee.Image(monthlyAll.first());
var firstWetKeys = ee.Dictionary(firstImg.updateMask(wetlandMask).reduceRegion({
  reducer: combinedReducer,
  geometry: FULL_AOI,
  scale: 7000,
  maxPixels: 1e10,
  bestEffort: true
})).keys();
print('Reducer keys (sanity check, ожидается xch4_mean / xch4_stdDev / xch4_count):',
      firstWetKeys);

// Первые 3 строки результата
print('=== Первые 3 строки T5 (mean/sd/n для wetland и forest) ===');
print(t5MonthlyFull.limit(3));

// Сводка по объёму
print('Total features in T5:', t5MonthlyFull.size());

// ============================================================
// Export to Drive (перезаписывает прежний CSV)
// ============================================================

Export.table.toDrive({
  collection: t5MonthlyFull,
  description: 'article_t5_full_aoi_monthly',
  fileFormat: 'CSV',
  selectors: [
    'year', 'month',
    'xch4_wetland', 'xch4_wetland_sd', 'n_wetland_pixels',
    'xch4_forest',  'xch4_forest_sd',  'n_forest_pixels',
    'delta_ch4'
  ]
});

print('═══ Export task queued: article_t5_full_aoi_monthly ═══');
print('Запустите задачу из вкладки Tasks → Run.');
print('После скачивания CSV из Drive — рассчитайте Welch\'s t и Cohen\'s d ' +
      'вне GEE (R/Python).');
