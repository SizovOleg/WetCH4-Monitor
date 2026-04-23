/**
 * @fileoverview Выгрузка ΔCH₄ сентябрь (full AOI) для Рис. 2 в ArcGIS.
 * Плюс координаты станций в консоль для ручного ввода в ArcGIS.
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

var FULL_AOI = c.FULL_AOI.simplify(1000);

// ============================================================
// Станции — координаты в консоль
// ============================================================

print('═══ STATION COORDINATES (для ArcGIS) ═══');
print('Мухрино:  60.892° с.ш., 68.682° в.д.  (Middle taiga)');
print('Бакчар:   56.93°  с.ш., 82.67°  в.д.  (Southern taiga)');
print('ZOTTO:    60.80°  с.ш., 89.35°  в.д.  (Middle taiga)');
print('');
print('CSV-вариант для импорта в ArcGIS:');
print('name,name_ru,lat,lon,zone');
print('Mukhrino,Мухрино,60.892,68.682,Middle taiga');
print('Bakchar,Бакчар,56.93,82.67,Southern taiga');
print('ZOTTO,ZOTTO,60.80,89.35,Middle taiga');

// ============================================================
// ΔCH₄ сентябрь (full AOI, без маски)
// ============================================================

var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var forestBinary = cgls.gte(111).and(cgls.lte(126)).clip(FULL_AOI);

var monthlyAll = tropomiModule.buildMonthlyCollection(
  FULL_AOI, c.START_DATE, c.END_DATE
).map(function(img) { return ee.Image(img).clip(FULL_AOI); });

var sepMean = monthlyAll
  .filter(ee.Filter.eq('month', 9))
  .mean()
  .clip(FULL_AOI);

var sepForestBg = sepMean.updateMask(forestBinary).reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: FULL_AOI,
  scale: 7000,
  maxPixels: 1e9,
  tileScale: 8
}).get('xch4');

print('');
print('═══ September ΔCH₄ ═══');
print('Forest background XCH₄:', sepForestBg, 'ppb');

var deltaSep = sepMean
  .subtract(ee.Image.constant(ee.Number(sepForestBg)))
  .rename('delta_ch4')
  .clip(FULL_AOI)
  .toFloat();

// ============================================================
// Preview
// ============================================================

Map.layers().reset();
Map.centerObject(FULL_AOI, 5);
Map.setOptions('HYBRID');

Map.addLayer(deltaSep, {
  min: -10, max: 25,
  palette: ['#2166ac','#67a9cf','#d1e5f0','#f7f7f7','#fddbc7','#ef8a62','#b2182b']
}, 'ΔCH₄ September (full)');

Map.addLayer(c.WSP.style({color: 'white', fillColor: '00000000', width: 1.5}),
  {}, 'WSP zones');

// ============================================================
// Export GeoTIFF
// ============================================================

Export.image.toDrive({
  image: deltaSep,
  description: 'delta_ch4_sep_full',
  fileNamePrefix: 'delta_ch4_sep_full',
  region: FULL_AOI,
  scale: 7000,
  crs: 'EPSG:4326',
  maxPixels: 1e10,
  fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}
});

print('');
print('═══ EXPORT ═══');
print('1 task: delta_ch4_sep_full.tif → Google Drive');
print('После завершения скачать в D:\\test\\wetland_zapsib\\article\\gis\\');
print('');
print('В ArcGIS: Stretched Renderer, diverging palette, min=-10, max=25');
