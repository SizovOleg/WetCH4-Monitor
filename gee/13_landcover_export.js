/**
 * @fileoverview Упрощённая ландшафтная карта ЗСР (6 классов) → Asset + GeoTIFF.
 *
 * Исходные данные: CGLS-LC100 Collection 3, epoch 2019 (22 класса).
 * После слияния остаётся 6 укрупнённых классов для визуального сравнения
 * с картой ΔCH₄ (вторая панель на Рис. 2 в ArcGIS).
 *
 * Выход:
 *   Asset: WetLandCH4/landcover_6class     (byte, 100 м, 6 классов + 0=other)
 *   GeoTIFF: landcover_6class.tif → Google Drive
 *
 * Легенда печатается в консоль при Run.
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');

var FOLDER = 'projects/nodal-thunder-481307-u1/assets/WetLandCH4/';
var FULL_AOI = c.FULL_AOI.simplify(1000);

// ============================================================
// CGLS → 6 укрупнённых классов
// ============================================================

var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification').clip(FULL_AOI);

// Коды CGLS:
//   90                — Herbaceous wetland
//   111–116           — Closed forest (evergreen/deciduous/mixed)
//   121–126           — Open forest (evergreen/deciduous/mixed)
//   80, 200           — Permanent water, Open sea
//   40                — Cropland
//   20, 30, 100       — Shrubs, Herbaceous veg, Moss/lichen
//   50, 60, 70        — Urban, Bare, Snow
//   0                 — Unknown
//
// Наш упрощённый классификатор:
//   0 — Other/unclassified (fallback)
//   1 — Wetlands
//   2 — Forest (closed + open)
//   3 — Water
//   4 — Cropland
//   5 — Grassland / shrubs / moss
//   6 — Bare / urban / snow

var wetlands  = cgls.eq(90);
var forest    = cgls.gte(111).and(cgls.lte(126));
var water     = cgls.eq(80).or(cgls.eq(200));
var cropland  = cgls.eq(40);
var grassland = cgls.eq(20).or(cgls.eq(30)).or(cgls.eq(100));
var bareUrban = cgls.eq(50).or(cgls.eq(60)).or(cgls.eq(70));

var lc6 = ee.Image(0)
  .where(forest,    2)
  .where(wetlands,  1)   // болота поверх леса (приоритет)
  .where(water,     3)
  .where(cropland,  4)
  .where(grassland, 5)
  .where(bareUrban, 6)
  .rename('landcover')
  .clip(FULL_AOI)
  .toByte();

// ============================================================
// Легенда
// ============================================================

var LEGEND = [
  {code: 0, label: 'Other/unclassified', color: '#e0e0e0'},
  {code: 1, label: 'Wetlands',           color: '#00bcd4'},
  {code: 2, label: 'Forest',             color: '#2e7d32'},
  {code: 3, label: 'Water',              color: '#1565c0'},
  {code: 4, label: 'Cropland',           color: '#fdd835'},
  {code: 5, label: 'Grassland/shrubs',   color: '#a5d6a7'},
  {code: 6, label: 'Bare/urban/snow',    color: '#bdbdbd'}
];

print('═══ LANDCOVER LEGEND (6 classes) ═══');
LEGEND.forEach(function(e) {
  print('  ' + e.code + ' = ' + e.label + '  (' + e.color + ')');
});

// ============================================================
// Статистика покрытия по классам
// ============================================================

var areaByClass = lc6.eq(ee.Image([0, 1, 2, 3, 4, 5, 6]))
  .rename(['c0','c1','c2','c3','c4','c5','c6'])
  .multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: FULL_AOI,
    scale: 1000,
    maxPixels: 1e11,
    tileScale: 8
  });

print('═══ COVERAGE (km²) ═══');
print(areaByClass);

// ============================================================
// Preview на карте
// ============================================================

var palette = LEGEND.map(function(e) { return e.color; });

Map.layers().reset();
Map.centerObject(FULL_AOI, 5);
Map.setOptions('HYBRID');
Map.addLayer(lc6, {min: 0, max: 6, palette: palette}, 'Landcover (6 classes)');
Map.addLayer(c.WSP.style({color: 'white', fillColor: '00000000', width: 1.5}),
  {}, 'WSP zones');

// ============================================================
// Export
// ============================================================

// 1. Asset (для переиспользования в App / других скриптах)
Export.image.toAsset({
  image: lc6,
  description: 'asset_landcover_6class',
  assetId: FOLDER + 'landcover_6class',
  region: FULL_AOI,
  scale: 100,
  maxPixels: 1e11
});

// 2. GeoTIFF → Drive → скачать в article/gis/
Export.image.toDrive({
  image: lc6,
  description: 'landcover_6class',
  fileNamePrefix: 'landcover_6class',
  region: FULL_AOI,
  scale: 100,
  crs: 'EPSG:4326',
  maxPixels: 1e11,
  fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}
});

print('═══ EXPORT ═══');
print('2 tasks queued → Run All.');
print('  1. asset_landcover_6class → assets/WetLandCH4/landcover_6class');
print('  2. landcover_6class.tif   → Google Drive → article/gis/');
print('');
print('Для ArcGIS: Symbology → Unique Values → Field: Value,');
print('импортировать палитру из легенды выше.');
