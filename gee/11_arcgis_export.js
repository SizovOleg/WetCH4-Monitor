/**
 * @fileoverview Экспорт GeoTIFF и векторов для Рис. 2 в ArcGIS.
 *
 * Производит 9 файлов в Google Drive:
 *   delta_ch4_jul_wetlands.tif  — ΔCH₄ июль (готовый asset)
 *   delta_ch4_aug_wetlands.tif  — ΔCH₄ август (on-the-fly)
 *   delta_ch4_sep_wetlands.tif  — ΔCH₄ сентябрь (on-the-fly)
 *   delta_ch4_jul_full.tif      — ΔCH₄ июль без маски
 *   delta_ch4_aug_full.tif      — ΔCH₄ август без маски
 *   delta_ch4_sep_full.tif      — ΔCH₄ сентябрь без маски
 *   wetland_mask_100m.tif       — маска болот 100м (для контура)
 *   wsp_boundaries.shp          — 8 природных зон ЗСР
 *   stations.shp                — 3 станции
 *
 * Методика для августа и сентября идентична июлю (Module 06):
 *   monthly_mean = monthlyFull.filter(month=M).mean()
 *   forest_bg    = monthly_mean.updateMask(forestMask).reduceRegion(mean)
 *   delta_month  = monthly_mean - forest_bg
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

var ROOT = 'projects/nodal-thunder-481307-u1/assets/';
var FULL_AOI = c.FULL_AOI.simplify(1000);

// ============================================================
// Load assets + маски + коллекция
// ============================================================

var deltaJulyAsset = ee.Image(ROOT + 'delta_ch4_july_mean');
var landcover = ee.Image(ROOT + 'wetland_mask');
var wetlandBinary = landcover.eq(1).rename('wetland');
var WSP = c.WSP;

// CGLS forest mask (111–126) для расчёта background августа и сентября
var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var forestBinary = cgls.gte(111).and(cgls.lte(126)).clip(FULL_AOI);

// TROPOMI monthly composites
var monthlyAll = tropomiModule.buildMonthlyCollection(
  FULL_AOI, c.START_DATE, c.END_DATE
).map(function(img) { return ee.Image(img).clip(FULL_AOI); });

// ============================================================
// Helper: вычислить ΔCH₄ для произвольного месяца
// ============================================================

/**
 * delta_ch4 = monthlyMean − forest_background.
 * @param {number} month 5..10
 * @return {ee.Image} band 'delta_ch4' (float)
 */
function computeDeltaForMonth(month) {
  var monthMean = monthlyAll
    .filter(ee.Filter.eq('month', month))
    .mean()
    .clip(FULL_AOI);

  var forestBg = monthMean.updateMask(forestBinary).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI,
    scale: 7000,
    maxPixels: 1e9,
    tileScale: 8
  }).get('xch4');

  return monthMean
    .subtract(ee.Image.constant(ee.Number(forestBg)))
    .rename('delta_ch4')
    .clip(FULL_AOI)
    .toFloat();
}

// ============================================================
// ΔCH₄ для трёх месяцев: июль (asset), август, сентябрь (on-the-fly)
// ============================================================

var deltaJul = deltaJulyAsset.rename('delta_ch4').toFloat();
var deltaAug = computeDeltaForMonth(8);
var deltaSep = computeDeltaForMonth(9);

// Для июля дополнительно логируем forest_bg для сверки с Module 06
var julForestBg = monthlyAll.filter(ee.Filter.eq('month', 7)).mean()
  .updateMask(forestBinary).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI, scale: 7000,
    maxPixels: 1e9, tileScale: 8
  }).get('xch4');
print('July forest background XCH₄:', julForestBg, 'ppb (sanity check)');

// ============================================================
// Экспорт GeoTIFF — 3 месяца × 2 версии (болота / весь AOI)
// ============================================================

function exportDelta(img, name) {
  // С маской болот — основной растр для рисунка
  Export.image.toDrive({
    image: img.updateMask(wetlandBinary),
    description: 'delta_ch4_' + name + '_wetlands',
    fileNamePrefix: 'delta_ch4_' + name + '_wetlands',
    region: FULL_AOI,
    scale: 7000,
    crs: 'EPSG:4326',
    maxPixels: 1e10,
    fileFormat: 'GeoTIFF',
    formatOptions: {cloudOptimized: true}
  });
  // Без маски — контекст
  Export.image.toDrive({
    image: img,
    description: 'delta_ch4_' + name + '_full',
    fileNamePrefix: 'delta_ch4_' + name + '_full',
    region: FULL_AOI,
    scale: 7000,
    crs: 'EPSG:4326',
    maxPixels: 1e10,
    fileFormat: 'GeoTIFF',
    formatOptions: {cloudOptimized: true}
  });
}

exportDelta(deltaJul, 'jul');
exportDelta(deltaAug, 'aug');
exportDelta(deltaSep, 'sep');

// ============================================================
// Маска болот 100м — для контура при большом масштабе
// ============================================================

Export.image.toDrive({
  image: wetlandBinary.toByte(),
  description: 'wetland_mask_100m',
  fileNamePrefix: 'wetland_mask_100m',
  region: FULL_AOI,
  scale: 100,
  crs: 'EPSG:4326',
  maxPixels: 1e11,
  fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}
});

// ============================================================
// Векторы: WSP зоны + станции
// ============================================================

Export.table.toDrive({
  collection: WSP,
  description: 'wsp_boundaries',
  fileNamePrefix: 'wsp_boundaries',
  fileFormat: 'SHP'
});

var stations = ee.FeatureCollection([
  ee.Feature(c.MUKHRINO, {name: 'Mukhrino', name_ru: 'Мухрино',
    lat: 60.892, lon: 68.682, zone: 'Middle taiga'}),
  ee.Feature(c.BAKCHAR,  {name: 'Bakchar',  name_ru: 'Бакчар',
    lat: 56.93,  lon: 82.67,  zone: 'Southern taiga'}),
  ee.Feature(c.ZOTTO,    {name: 'ZOTTO',    name_ru: 'ZOTTO',
    lat: 60.80,  lon: 89.35,  zone: 'Middle taiga'})
]);

Export.table.toDrive({
  collection: stations,
  description: 'stations',
  fileNamePrefix: 'stations',
  fileFormat: 'SHP'
});

// ============================================================
// Preview на карте
// ============================================================

Map.layers().reset();
Map.centerObject(FULL_AOI, 5);
Map.setOptions('HYBRID');

var deltaVis = {
  min: -10, max: 25,
  palette: ['#2166ac','#67a9cf','#d1e5f0','#f7f7f7','#fddbc7','#ef8a62','#b2182b']
};

Map.addLayer(deltaJul.updateMask(wetlandBinary), deltaVis, 'ΔCH₄ July (wetlands)');
Map.addLayer(deltaAug.updateMask(wetlandBinary), deltaVis, 'ΔCH₄ August (wetlands)', false);
Map.addLayer(deltaSep.updateMask(wetlandBinary), deltaVis, 'ΔCH₄ September (wetlands)', false);

Map.addLayer(WSP.style({color: 'white', fillColor: '00000000', width: 1.5}),
  {}, 'WSP zones');
Map.addLayer(stations.style({color: 'yellow', pointSize: 6, width: 2}),
  {}, 'Stations');

// ============================================================
print('═══ ARCGIS EXPORT — 3 months (Jul/Aug/Sep) ═══');
print('9 tasks queued. Go to Tasks → Run All.');
print('После завершения скачать из Google Drive в article/gis/');
print('');
print('Ожидаемые пики ΔCH₄ по Module 06:');
print('  July     ~7.4 ppb (full AOI mean)');
print('  August  ~10.5 ppb');
print('  September ~11.8 ppb');
print('');
print('Для рисунка оптимально взять августовский или сентябрьский слой');
print('— именно там ΔCH₄ максимален.');
