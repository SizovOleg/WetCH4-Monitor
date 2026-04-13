/**
 * @fileoverview Экспорт предвычисленных данных в GEE Assets.
 * Запустить ОДИН РАЗ → дождаться завершения всех Tasks.
 * После этого 07_app.js загружает assets мгновенно.
 */

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

// Asset root (Cloud project)
var ROOT = 'projects/nodal-thunder-481307-u1/assets/';

var FULL_AOI = c.FULL_AOI.simplify(1000);

// ============================================================
// 1. Landcover mask (4-class, int8)
// ============================================================

var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var wetlandBinary = cgls.eq(90).rename('wetland').clip(FULL_AOI);
var forestBinary = cgls.gte(111).and(cgls.lte(126)).rename('forest').clip(FULL_AOI);
var waterBinary = cgls.eq(80).or(cgls.eq(200)).clip(FULL_AOI);

var landcover = ee.Image(0)
  .where(forestBinary, 2)
  .where(wetlandBinary, 1)
  .where(waterBinary, 3)
  .rename('landcover')
  .clip(FULL_AOI)
  .toInt8();

Export.image.toAsset({
  image: landcover,
  description: 'asset_wetland_mask',
  assetId: ROOT + 'wetland_mask',
  region: FULL_AOI,
  scale: 100,
  maxPixels: 1e11
});

// ============================================================
// 2. TROPOMI monthly → enhancement table (42 records)
// ============================================================

var monthlyAll = tropomiModule.buildMonthlyCollection(
  FULL_AOI, c.START_DATE, c.END_DATE
).map(function(img) { return ee.Image(img).clip(FULL_AOI); });

var enhancementFC = ee.FeatureCollection(monthlyAll.map(function(img) {
  img = ee.Image(img);
  var xch4Wet = img.updateMask(wetlandBinary).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: FULL_AOI,
    scale: 7000, maxPixels: 1e9, tileScale: 8
  }).get('xch4');
  var xch4For = img.updateMask(forestBinary).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: FULL_AOI,
    scale: 7000, maxPixels: 1e9, tileScale: 8
  }).get('xch4');
  return ee.Feature(ee.Geometry.Point([0,0]), {
    year: img.get('year'), month: img.get('month'),
    xch4_wetland: xch4Wet, xch4_forest: xch4For
  });
})).filter(ee.Filter.notNull(['xch4_wetland', 'xch4_forest']))
  .map(function(f) {
    var delta = ee.Number(f.get('xch4_wetland'))
      .subtract(ee.Number(f.get('xch4_forest')));
    return f.set('delta_ch4', delta);
  });

Export.table.toAsset({
  collection: enhancementFC,
  description: 'asset_enhancement_full',
  assetId: ROOT + 'enhancement_full'
});

// ============================================================
// 3. Seasonal mean (6 records)
// ============================================================

var seasonalMean = ee.FeatureCollection(
  ee.List(c.SUMMER_MONTHS).map(function(m) {
    var subset = enhancementFC.filter(ee.Filter.eq('month', m));
    return ee.Feature(ee.Geometry.Point([0,0]), {
      month: m,
      delta_ch4: subset.aggregate_mean('delta_ch4'),
      xch4_wetland: subset.aggregate_mean('xch4_wetland'),
      xch4_forest: subset.aggregate_mean('xch4_forest')
    });
  })
);

Export.table.toAsset({
  collection: seasonalMean,
  description: 'asset_seasonal_mean',
  assetId: ROOT + 'seasonal_mean'
});

// ============================================================
// 4. Delta CH4 July mean map
// ============================================================

var julyMean = monthlyAll.filter(ee.Filter.eq('month', 7)).mean().clip(FULL_AOI);
var julyForestBg = julyMean.updateMask(forestBinary).reduceRegion({
  reducer: ee.Reducer.mean(), geometry: FULL_AOI,
  scale: 7000, maxPixels: 1e9, tileScale: 8
}).get('xch4');

var deltaMap = julyMean
  .subtract(ee.Image.constant(ee.Number(julyForestBg)))
  .rename('delta_ch4')
  .clip(FULL_AOI)
  .toFloat();

Export.image.toAsset({
  image: deltaMap,
  description: 'asset_delta_ch4_july',
  assetId: ROOT + 'delta_ch4_july_mean',
  region: FULL_AOI,
  scale: 7000,
  maxPixels: 1e10
});

// ============================================================
// 5. Zonal stats (8 records)
// ============================================================

var ZONES_DICT = ee.Dictionary(c.ZONES);

// Площадь болот по зонам (reduceRegions — 1 вызов)
var zoneAreas = wetlandBinary.multiply(ee.Image.pixelArea())
  .reduceRegions({
    collection: c.WSP, reducer: ee.Reducer.sum(),
    scale: 1000, tileScale: 8
  });

// ΔCH₄ per zone — reduceRegion внутри map (надёжнее чем цепочка reduceRegions)
var zoneStats = zoneAreas.map(function(zone) {
  var geom = zone.geometry();
  var zoneId = ee.Number(zone.get('ID'));

  var wetRaw = zone.get('wetland');
  var wetArea = ee.Number(ee.Algorithms.If(wetRaw, wetRaw, 0));

  var deltaMean = deltaMap.updateMask(wetlandBinary).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: 7000, maxPixels: 1e9, tileScale: 8
  }).get('delta_ch4');

  return ee.Feature(geom, {
    zone_id: zoneId,
    zone_name: ZONES_DICT.get(zoneId.format('%d')),
    wetland_area_km2: wetArea.divide(1e6),
    delta_ch4_ppb: ee.Algorithms.If(deltaMean, deltaMean, 0)
  });
});

Export.table.toAsset({
  collection: zoneStats,
  description: 'asset_zonal_stats',
  assetId: ROOT + 'zonal_stats'
});

// ============================================================
// 6. Stations (3 points)
// ============================================================

var stations = ee.FeatureCollection([
  ee.Feature(c.MUKHRINO, {name: 'Mukhrino', color: 'yellow'}),
  ee.Feature(c.BAKCHAR, {name: 'Bakchar', color: 'red'}),
  ee.Feature(c.ZOTTO, {name: 'ZOTTO', color: 'magenta'})
]);

Export.table.toAsset({
  collection: stations,
  description: 'asset_stations',
  assetId: ROOT + 'stations'
});

// ============================================================
print('6 export tasks created. Go to Tasks tab → Run All.');
print('Wait for completion before running 07_app.js.');
