/**
 * @fileoverview Экспорт всех CSV для статьи.
 *
 * Запустить один раз → Tasks → Run All → скачать из Drive в article/data/.
 *
 * Выходные файлы (Drive, prefix article_t*):
 *   t1_zonal_stats         — 8 зон × 11 показателей (включая emission_tg)
 *   t2_zonal_seasonal      — 48 записей (8 зон × 6 мес)
 *   t3_full_aoi_seasonal   — 6 мес для всей ЗСР
 *   t4_full_aoi_annual     — 7 лет для всей ЗСР
 *   t5_full_aoi_monthly    — 42 записи год×месяц
 *   t6_stations_summary    — 3 станции × средние XCH₄/ΔCH₄
 *   t7_stations_monthly    — 3 станции × месяцы × годы
 *
 * Все reduceRegion используют tileScale:8 + FULL_AOI.simplify(1000)
 * для устойчивости на сложной WSP геометрии.
 */

// ============================================================
// Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

// ============================================================
// Constants & masks
// ============================================================

var FULL_AOI = c.FULL_AOI.simplify(1000);
var WSP = c.WSP;

var MEAN_FLUX = 3.035;     // mg CH₄/m²/h (Mukhrino 2020-2023 mean)
var EMISSION_HOURS = 4320; // 180 days × 24 h

var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var wetlandMask = cgls.eq(90).clip(FULL_AOI);
var forestMask = cgls.gte(111).and(cgls.lte(126)).clip(FULL_AOI);
var nonWetlandMask = wetlandMask.not().clip(FULL_AOI);

var monthlyAll = tropomiModule.buildMonthlyCollection(
  FULL_AOI, c.START_DATE, c.END_DATE
).map(function(img) { return ee.Image(img).clip(FULL_AOI); });

var meanXCH4 = monthlyAll.mean().rename('xch4');

// ERA5 T_air (mean warm season 2019-2025)
var yrList = ee.List.sequence(2019, 2025);
var meanTemp = ee.ImageCollection(yrList.map(function(y) {
  y = ee.Number(y);
  return ee.ImageCollection(c.ERA5_COLLECTION)
    .filterDate(ee.Date.fromYMD(y, 5, 1), ee.Date.fromYMD(y, 11, 1))
    .select('temperature_2m')
    .mean().subtract(273.15).rename('t_air');
})).mean();

// MODIS NDVI (mean warm season 2019-2025)
var meanNDVI = ee.ImageCollection(yrList.map(function(y) {
  y = ee.Number(y);
  return ee.ImageCollection('MODIS/061/MOD13A1')
    .filterDate(ee.Date.fromYMD(y, 5, 1), ee.Date.fromYMD(y, 11, 1))
    .select('NDVI')
    .mean().multiply(0.0001).rename('ndvi');
})).mean();

print('═══ ARTICLE EXPORTS ═══');
print('Monthly composites:', monthlyAll.size());

// ============================================================
// T1: Zonal stats с emission_tg (8 записей)
// ============================================================

var zoneNames = ee.Dictionary({
  '1': 'Tundra', '2': 'Forest-tundra', '3': 'Northern taiga',
  '4': 'Middle taiga', '5': 'Southern taiga', '6': 'Subtaiga',
  '7': 'Forest-steppe', '8': 'Steppe'
});

var t1_zonal = WSP.map(function(zone) {
  var geom = zone.geometry();
  var zoneId = ee.Number(zone.get('ID')).int();

  var totalArea = ee.Number(ee.Image.pixelArea().reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geom, scale: 1000, maxPixels: 1e11, tileScale: 8
  }).values().get(0));

  var wetAreaRaw = wetlandMask.multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geom, scale: 1000, maxPixels: 1e11, tileScale: 8
  }).values().get(0);
  var wetArea = ee.Number(ee.Algorithms.If(wetAreaRaw, wetAreaRaw, 0));

  var wetFraction = wetArea.divide(totalArea).multiply(100);

  var tAirWet = meanTemp.updateMask(wetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom, scale: 11000, maxPixels: 1e10, tileScale: 8
  }).get('t_air');

  var ndviWet = meanNDVI.updateMask(wetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom, scale: 500, maxPixels: 1e10, tileScale: 8
  }).get('ndvi');

  var xch4Wet = meanXCH4.updateMask(wetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom, scale: 7000, maxPixels: 1e10, tileScale: 8
  }).get('xch4');

  var xch4NonWet = meanXCH4.updateMask(nonWetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom, scale: 7000, maxPixels: 1e10, tileScale: 8
  }).get('xch4');

  var deltaCH4 = ee.Algorithms.If(
    ee.Algorithms.IsEqual(xch4Wet, null), 0,
    ee.Algorithms.If(ee.Algorithms.IsEqual(xch4NonWet, null), 0,
      ee.Number(xch4Wet).subtract(ee.Number(xch4NonWet))
    )
  );

  // Эмиссия зоны: MEAN_FLUX × area × hours / 1e15 = Tg CH₄/yr
  var emissionTg = ee.Number(MEAN_FLUX).multiply(wetArea)
    .multiply(EMISSION_HOURS).divide(1e15);

  return ee.Feature(ee.Geometry.Point([0, 0]), {
    zone_id: zoneId,
    zone_name: zoneNames.get(zoneId.format('%d')),
    total_area_km2: totalArea.divide(1e6),
    wetland_area_km2: wetArea.divide(1e6),
    wetland_fraction_pct: wetFraction,
    t_air_wetland_c: ee.Algorithms.If(tAirWet, tAirWet, 0),
    ndvi_wetland: ee.Algorithms.If(ndviWet, ndviWet, 0),
    xch4_wetland_ppb: ee.Algorithms.If(xch4Wet, xch4Wet, 0),
    xch4_nonwetland_ppb: ee.Algorithms.If(xch4NonWet, xch4NonWet, 0),
    delta_ch4_ppb: deltaCH4,
    emission_tg: emissionTg
  });
}).sort('zone_id');

Export.table.toDrive({
  collection: t1_zonal,
  description: 'article_t1_zonal_stats',
  fileFormat: 'CSV',
  selectors: ['zone_id', 'zone_name', 'total_area_km2', 'wetland_area_km2',
              'wetland_fraction_pct', 't_air_wetland_c', 'ndvi_wetland',
              'xch4_wetland_ppb', 'xch4_nonwetland_ppb', 'delta_ch4_ppb',
              'emission_tg']
});

// ============================================================
// T2: Zonal seasonal (48 записей)
// ============================================================

var t2_seasonal = WSP.map(function(zone) {
  var geom = zone.geometry();
  var zoneId = ee.Number(zone.get('ID')).int();
  var zoneName = zoneNames.get(zoneId.format('%d'));

  var data = ee.List(c.SUMMER_MONTHS).map(function(m) {
    var monthMean = monthlyAll.filter(ee.Filter.eq('month', m)).mean();

    var xWet = monthMean.updateMask(wetlandMask).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom, scale: 7000, maxPixels: 1e10, tileScale: 8
    }).get('xch4');

    var xNon = monthMean.updateMask(nonWetlandMask).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: geom, scale: 7000, maxPixels: 1e10, tileScale: 8
    }).get('xch4');

    var delta = ee.Algorithms.If(
      ee.Algorithms.IsEqual(xWet, null), 0,
      ee.Algorithms.If(ee.Algorithms.IsEqual(xNon, null), 0,
        ee.Number(xWet).subtract(ee.Number(xNon))
      )
    );

    return ee.Feature(ee.Geometry.Point([0, 0]), {
      zone_id: zoneId, zone_name: zoneName, month: m,
      xch4_wetland: ee.Algorithms.If(xWet, xWet, 0),
      xch4_nonwetland: ee.Algorithms.If(xNon, xNon, 0),
      delta_ch4: delta
    });
  });

  return ee.FeatureCollection(data);
}).flatten();

Export.table.toDrive({
  collection: t2_seasonal,
  description: 'article_t2_zonal_seasonal',
  fileFormat: 'CSV',
  selectors: ['zone_id', 'zone_name', 'month',
              'xch4_wetland', 'xch4_nonwetland', 'delta_ch4']
});

// ============================================================
// T3: Full AOI seasonal (6 записей)
// ============================================================

var t3_seasonal_full = ee.FeatureCollection(
  ee.List(c.SUMMER_MONTHS).map(function(m) {
    var monthMean = monthlyAll.filter(ee.Filter.eq('month', m)).mean();

    var xWet = monthMean.updateMask(wetlandMask).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: FULL_AOI, scale: 7000, maxPixels: 1e10, tileScale: 8
    }).get('xch4');

    var xFor = monthMean.updateMask(forestMask).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: FULL_AOI, scale: 7000, maxPixels: 1e10, tileScale: 8
    }).get('xch4');

    var xNon = monthMean.updateMask(nonWetlandMask).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: FULL_AOI, scale: 7000, maxPixels: 1e10, tileScale: 8
    }).get('xch4');

    var deltaFor = ee.Number(xWet).subtract(ee.Number(xFor));
    var deltaNon = ee.Number(xWet).subtract(ee.Number(xNon));

    return ee.Feature(ee.Geometry.Point([0, 0]), {
      month: m,
      xch4_wetland: xWet,
      xch4_forest: xFor,
      xch4_nonwetland: xNon,
      delta_ch4_vs_forest: deltaFor,
      delta_ch4_vs_nonwetland: deltaNon
    });
  })
);

Export.table.toDrive({
  collection: t3_seasonal_full,
  description: 'article_t3_full_aoi_seasonal',
  fileFormat: 'CSV',
  selectors: ['month', 'xch4_wetland', 'xch4_forest', 'xch4_nonwetland',
              'delta_ch4_vs_forest', 'delta_ch4_vs_nonwetland']
});

// ============================================================
// T4: Full AOI annual (7 записей)
// ============================================================

var t4_annual_full = ee.FeatureCollection(
  ee.List.sequence(2019, 2025).map(function(y) {
    var yearMean = monthlyAll.filter(ee.Filter.eq('year', y)).mean();

    var xWet = yearMean.updateMask(wetlandMask).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: FULL_AOI, scale: 7000, maxPixels: 1e10, tileScale: 8
    }).get('xch4');

    var xFor = yearMean.updateMask(forestMask).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: FULL_AOI, scale: 7000, maxPixels: 1e10, tileScale: 8
    }).get('xch4');

    var xNon = yearMean.updateMask(nonWetlandMask).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: FULL_AOI, scale: 7000, maxPixels: 1e10, tileScale: 8
    }).get('xch4');

    var delta = ee.Number(xWet).subtract(ee.Number(xFor));
    var nMonths = monthlyAll.filter(ee.Filter.eq('year', y)).size();

    return ee.Feature(ee.Geometry.Point([0, 0]), {
      year: y,
      n_months: nMonths,
      xch4_wetland: xWet,
      xch4_forest: xFor,
      xch4_nonwetland: xNon,
      delta_ch4_vs_forest: delta,
      delta_ch4_vs_nonwetland: ee.Number(xWet).subtract(ee.Number(xNon))
    });
  })
);

Export.table.toDrive({
  collection: t4_annual_full,
  description: 'article_t4_full_aoi_annual',
  fileFormat: 'CSV',
  selectors: ['year', 'n_months', 'xch4_wetland', 'xch4_forest',
              'xch4_nonwetland', 'delta_ch4_vs_forest', 'delta_ch4_vs_nonwetland']
});

// ============================================================
// T5: Full AOI monthly (42 записи)
// ============================================================

var t5_monthly_full = ee.FeatureCollection(monthlyAll.map(function(img) {
  img = ee.Image(img);
  var xWet = img.updateMask(wetlandMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI, scale: 7000, maxPixels: 1e10, tileScale: 8
  }).get('xch4');

  var xFor = img.updateMask(forestMask).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI, scale: 7000, maxPixels: 1e10, tileScale: 8
  }).get('xch4');

  return ee.Feature(ee.Geometry.Point([0, 0]), {
    year: img.get('year'),
    month: img.get('month'),
    xch4_wetland: xWet,
    xch4_forest: xFor,
    delta_ch4: ee.Algorithms.If(
      ee.Algorithms.IsEqual(xWet, null), null,
      ee.Algorithms.If(ee.Algorithms.IsEqual(xFor, null), null,
        ee.Number(xWet).subtract(ee.Number(xFor))
      )
    )
  });
})).filter(ee.Filter.notNull(['xch4_wetland', 'xch4_forest']));

Export.table.toDrive({
  collection: t5_monthly_full,
  description: 'article_t5_full_aoi_monthly',
  fileFormat: 'CSV',
  selectors: ['year', 'month', 'xch4_wetland', 'xch4_forest', 'delta_ch4']
});

// ============================================================
// T6-T7: Stations (Mukhrino, Bakchar, ZOTTO)
// ============================================================

var STATION_BUFFER = 10000;  // 10 km for station point
var FOREST_BUFFER = 100000;  // 100 km for forest background

var stations = [
  {name: 'Mukhrino', geom: c.MUKHRINO, lat: 60.892, lon: 68.682},
  {name: 'Bakchar',  geom: c.BAKCHAR,  lat: 56.93,  lon: 82.67},
  {name: 'ZOTTO',    geom: c.ZOTTO,    lat: 60.80,  lon: 89.35}
];

// T7: Stations monthly (3 × 42 = ~126 записей)
var t7_monthly = ee.FeatureCollection([]);
stations.forEach(function(s) {
  var stationBuf = s.geom.buffer(STATION_BUFFER);
  var forestBuf = s.geom.buffer(FOREST_BUFFER);

  var monthly = monthlyAll.map(function(img) {
    img = ee.Image(img);
    var xch4Stat = img.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: stationBuf, scale: 7000, maxPixels: 1e9, tileScale: 4
    }).get('xch4');

    var xch4For = img.updateMask(forestMask).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: forestBuf, scale: 7000, maxPixels: 1e9, tileScale: 4
    }).get('xch4');

    return ee.Feature(s.geom, {
      station: s.name,
      lat: s.lat,
      lon: s.lon,
      year: img.get('year'),
      month: img.get('month'),
      xch4_station: xch4Stat,
      xch4_forest: xch4For,
      delta_ch4: ee.Algorithms.If(
        ee.Algorithms.IsEqual(xch4Stat, null), null,
        ee.Algorithms.If(ee.Algorithms.IsEqual(xch4For, null), null,
          ee.Number(xch4Stat).subtract(ee.Number(xch4For))
        )
      )
    });
  });

  t7_monthly = t7_monthly.merge(ee.FeatureCollection(monthly));
});

t7_monthly = t7_monthly.filter(ee.Filter.notNull(['xch4_station', 'xch4_forest']));

Export.table.toDrive({
  collection: t7_monthly,
  description: 'article_t7_stations_monthly',
  fileFormat: 'CSV',
  selectors: ['station', 'lat', 'lon', 'year', 'month',
              'xch4_station', 'xch4_forest', 'delta_ch4']
});

// T6: Stations summary (агрегация из T7)
var t6_summary = ee.FeatureCollection(stations.map(function(s) {
  var subset = t7_monthly.filter(ee.Filter.eq('station', s.name));
  return ee.Feature(s.geom, {
    station: s.name,
    lat: s.lat,
    lon: s.lon,
    n_records: subset.size(),
    xch4_station_mean: subset.aggregate_mean('xch4_station'),
    xch4_forest_mean: subset.aggregate_mean('xch4_forest'),
    delta_ch4_mean: subset.aggregate_mean('delta_ch4'),
    delta_ch4_std: subset.aggregate_total_sd('delta_ch4')
  });
}));

Export.table.toDrive({
  collection: t6_summary,
  description: 'article_t6_stations_summary',
  fileFormat: 'CSV',
  selectors: ['station', 'lat', 'lon', 'n_records',
              'xch4_station_mean', 'xch4_forest_mean',
              'delta_ch4_mean', 'delta_ch4_std']
});

// ============================================================
// Console summary
// ============================================================

print('Tables queued for Drive export:');
print('  t1 zonal_stats (8 records with emission_tg)');
print('  t2 zonal_seasonal (48 records)');
print('  t3 full_aoi_seasonal (6 records)');
print('  t4 full_aoi_annual (7 records)');
print('  t5 full_aoi_monthly (~42 records)');
print('  t6 stations_summary (3 records)');
print('  t7 stations_monthly (~126 records)');
print('Run all in Tasks tab, then download to article/data/');
