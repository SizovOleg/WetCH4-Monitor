/**
 * @fileoverview Финальная выгрузка для ArcGIS — использует готовый asset.
 *
 * Выход:
 *   delta_ch4_sep_full.tif — карта ΔCH₄ сентябрь, вся ЗСР (главный слой Рис. 2)
 *
 * Плюс координаты 3 станций в консоль для ручного ввода в ArcGIS.
 * (landcover_6class.tif уже выгружен отдельно.)
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');

var FOLDER = 'projects/nodal-thunder-481307-u1/assets/WetLandCH4/';
var FULL_AOI = c.FULL_AOI.simplify(1000);

// ============================================================
// Координаты станций в консоль
// ============================================================

print('═══ STATION COORDINATES (для ArcGIS) ═══');
print('Мухрино:  60.892° с.ш., 68.682° в.д.  (Middle taiga)');
print('Бакчар:   56.93°  с.ш., 82.67°  в.д.  (Southern taiga)');
print('ZOTTO:    60.80°  с.ш., 89.35°  в.д.  (Middle taiga)');
print('');
print('CSV для импорта в ArcGIS (Copy → save as stations.csv):');
print('name,name_ru,lat,lon,zone');
print('Mukhrino,Мухрино,60.892,68.682,Middle taiga');
print('Bakchar,Бакчар,56.93,82.67,Southern taiga');
print('ZOTTO,ZOTTO,60.80,89.35,Middle taiga');
print('');

// ============================================================
// Load asset
// ============================================================

var deltaSep = ee.Image(FOLDER + 'delta_ch4_sep_full');

// ============================================================
// Preview
// ============================================================

Map.layers().reset();
Map.centerObject(FULL_AOI, 5);
Map.setOptions('HYBRID');

var deltaVis = {
  min: -10, max: 25,
  palette: ['#2166ac','#67a9cf','#d1e5f0','#f7f7f7','#fddbc7','#ef8a62','#b2182b']
};

Map.addLayer(deltaSep, deltaVis, 'ΔCH₄ September (full)');
Map.addLayer(c.WSP.style({color: 'white', fillColor: '00000000', width: 1.5}),
  {}, 'WSP zones');

// ============================================================
// Export — 1 задача
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

print('═══ EXPORT ═══');
print('1 task queued: delta_ch4_sep_full.tif (7km, несколько секунд)');
print('После завершения скачать в D:\\test\\wetland_zapsib\\article\\gis\\');
