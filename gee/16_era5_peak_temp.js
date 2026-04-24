/**
 * @fileoverview Пиковая температура воздуха на болотах ЗСР по месяцам (ERA5-Land).
 *
 * Считает среднюю приземную температуру воздуха на высоте 2 м, осреднённую
 * за 2019–2025 гг. по болотным пикселям, для каждого тёплого месяца (5–10).
 *
 * Цель — заменить/подтвердить цифру «18,9 °C» в разделе «Превышение
 * концентрации CH₄» статьи.
 *
 * Результат — в консоли. Export не нужен.
 */

// ============================================================
// Imports + setup
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');

var FULL_AOI = c.FULL_AOI.simplify(1000);
var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var wetlandMask = cgls.eq(90).clip(FULL_AOI);

// ============================================================
// ERA5-Land daily → monthly mean temperature (warm season)
// ============================================================

var years = ee.List.sequence(2019, 2025);
var months = [5, 6, 7, 8, 9, 10];

var monthNames = {5: 'May', 6: 'June', 7: 'July',
                  8: 'August', 9: 'September', 10: 'October'};

print('═══ ERA5-Land mean T_air over WSP wetlands (2019–2025) ═══');

months.forEach(function(m) {
  // Для каждого года берём средний день июля → потом среднее по годам
  var monthlyMeans = ee.ImageCollection(years.map(function(y) {
    y = ee.Number(y);
    return ee.ImageCollection(c.ERA5_COLLECTION)
      .filterDate(ee.Date.fromYMD(y, m, 1),
                  ee.Date.fromYMD(y, m, 1).advance(1, 'month'))
      .select('temperature_2m')
      .mean()
      .subtract(273.15)
      .rename('t_air');
  }));

  var grandMean = monthlyMeans.mean();

  var tAir = grandMean.updateMask(wetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI,
    scale: 11000,  // ERA5-Land native resolution ~9km
    maxPixels: 1e10,
    tileScale: 8
  }).get('t_air');

  print('  ' + monthNames[m] + ':', tAir, '°C');
});

print('');
print('Также проверим — daily maximum (tmax) за тёплый сезон:');

// Максимум дневной температуры (tmax), средний за все дни месяца и по всем годам
months.forEach(function(m) {
  var tmaxMonthly = ee.ImageCollection(years.map(function(y) {
    y = ee.Number(y);
    return ee.ImageCollection(c.ERA5_COLLECTION)
      .filterDate(ee.Date.fromYMD(y, m, 1),
                  ee.Date.fromYMD(y, m, 1).advance(1, 'month'))
      .select('temperature_2m_max')
      .mean()
      .subtract(273.15)
      .rename('t_air_max');
  }));

  var grandMean = tmaxMonthly.mean();

  var tMax = grandMean.updateMask(wetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI,
    scale: 11000,
    maxPixels: 1e10,
    tileScale: 8
  }).get('t_air_max');

  print('  ' + monthNames[m] + ' (daily max):', tMax, '°C');
});

// ============================================================
print('');
print('Ожидаемо: июль = максимум тёплого сезона.');
print('Сравнить с цифрой 18,9 °C в статье — выбрать метрику,');
print('которая ближе (mean или daily max).');
