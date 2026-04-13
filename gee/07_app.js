/**
 * @fileoverview Module 7: WetCH4-WS — GEE App.
 *
 * Интерактивное приложение для визуализации эмиссии CH4
 * из болот Западной Сибири по данным TROPOMI.
 *
 * Безопасные imports: только constants, palettes, 02_tropomi_monthly.
 * Модули 01, 03–06 имеют незащищённые smoke tests — require их нельзя.
 * CGLS маски загружаются напрямую (без buildLandcoverMask/reproject).
 *
 * Все label-ы обновляются через .evaluate() — .getInfo() запрещён.
 */

// ============================================================
// B. Imports (только 3 безопасных модуля)
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var palettes = require('users/ntcomz18_sand/wetch4_ws:gee/lib/palettes');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

// ============================================================
// C. App-local constants
// ============================================================

var FULL_AOI = c.FULL_AOI.simplify(1000);

// Emission parameters (из Module 6)
var FLUX_HOLLOW = 6.03;
var FLUX_RIDGE  = 0.04;
var HOLLOW_FRACTION = 0.5;
var MEAN_FLUX = FLUX_HOLLOW * HOLLOW_FRACTION + FLUX_RIDGE * (1 - HOLLOW_FRACTION);
var EMISSION_HOURS = 180 * 24; // 4320

// Станции
var MUKHRINO = c.MUKHRINO;
var BAKCHAR  = c.BAKCHAR;
var ZOTTO    = c.ZOTTO;

// Визуализация
var deltaVis = {min: -15, max: 30, palette: palettes.DELTA_CH4_PALETTE};
var xch4Vis  = {min: 1870, max: 1920, palette: palettes.XCH4_PALETTE};
var lcVis    = {min: 0, max: 3, palette: palettes.LANDCOVER_PALETTE};

var MONTH_NAMES = {
  5: 'May', 6: 'June', 7: 'July',
  8: 'August', 9: 'September', 10: 'October'
};

// ============================================================
// D. Data initialization
// ============================================================

// CGLS binary masks (inline, без reproject)
var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var wetlandBinary = cgls.eq(90).rename('wetland').clip(FULL_AOI);
var forestBinary  = cgls.gte(111).and(cgls.lte(126)).rename('forest').clip(FULL_AOI);

// Landcover 4-class
var waterMask = cgls.eq(80).or(cgls.eq(200));
var landcover = ee.Image(0)
  .where(forestBinary, 2)
  .where(wetlandBinary, 1)
  .where(waterMask.clip(FULL_AOI), 3)
  .rename('landcover')
  .clip(FULL_AOI)
  .toInt8();

// Площадь болот (вычисляется один раз)
var wetlandAreaM2 = wetlandBinary.multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: FULL_AOI,
    scale: 1000,
    maxPixels: 1e10,
    tileScale: 8
  }).get('wetland');

// TROPOMI monthly collection (lazy, clip к AOI)
var monthlyAll = tropomiModule.buildMonthlyCollection(
  FULL_AOI, c.START_DATE, c.END_DATE
).map(function(img) {
  return ee.Image(img).clip(FULL_AOI);
});

// ============================================================
// E. UI widgets
// ============================================================

// --- Title ---
var titleLabel = ui.Label(
  'WetCH4-WS: Methane from Western Siberian Wetlands',
  {fontWeight: 'bold', fontSize: '16px', margin: '8px 0 0 8px'}
);
var subtitleLabel = ui.Label(
  'TROPOMI-based monitoring | 2019\u20132025',
  {fontSize: '12px', color: '#666', margin: '0 0 6px 8px'}
);

// --- Disclaimer (collapsible) ---
var disclaimerText = ui.Label(
  '\u26A0 Limitations:\n' +
  '\u2022 TROPOMI measures column-averaged CH\u2084, not surface flux\n' +
  '\u2022 Winter (Nov\u2013Apr) excluded\n' +
  '\u2022 \u0394CH\u2084 = XCH\u2084(wetland) \u2212 XCH\u2084(forest), relative metric\n' +
  '\u2022 Resolution ~7 km, cannot resolve microlandscapes',
  {fontSize: '11px', color: '#666', whiteSpace: 'pre'}
);
var disclaimerPanel = ui.Panel([disclaimerText],
  null, {border: '1px solid #ccc', padding: '6px', margin: '4px 0'}
);
var btnDisclaimer = ui.Button({
  label: 'Hide disclaimer',
  style: {stretch: 'horizontal', margin: '2px 0'},
  onClick: function() {
    var shown = disclaimerPanel.style().get('shown');
    disclaimerPanel.style().set('shown', !shown);
    btnDisclaimer.setLabel(shown ? 'Show disclaimer' : 'Hide disclaimer');
  }
});

// --- Year / Month selectors ---
var yearSelect = ui.Select({
  items: ['2019','2020','2021','2022','2023','2024','2025'],
  value: '2023',
  style: {stretch: 'horizontal'}
});

var monthSelect = ui.Select({
  items: [
    {label: 'May', value: '5'},
    {label: 'June', value: '6'},
    {label: 'July', value: '7'},
    {label: 'August', value: '8'},
    {label: 'September', value: '9'},
    {label: 'October', value: '10'}
  ],
  value: '7',
  style: {stretch: 'horizontal'}
});

// --- Layer checkboxes ---
var cbDeltaCH4  = ui.Checkbox('\u0394CH\u2084 map', true);
var cbXCH4      = ui.Checkbox('XCH\u2084 absolute', false);
var cbWetland   = ui.Checkbox('Wetland mask', true);
var cbLandcover = ui.Checkbox('Land cover', false);
var cbZones     = ui.Checkbox('Natural zones', false);
var cbStations  = ui.Checkbox('Stations', true);

// --- Summary labels ---
var labelStatus      = ui.Label('', {fontSize: '12px', color: '#888'});
var labelMeanXCH4    = ui.Label('XCH\u2084 (wetlands): computing...', {fontSize: '13px'});
var labelDeltaCH4    = ui.Label('\u0394CH\u2084: computing...', {fontSize: '13px'});
var labelWetlandArea = ui.Label('Wetland area: computing...', {fontSize: '13px'});
var labelEmission    = ui.Label('Emission: computing...', {fontSize: '13px'});

// --- Chart containers ---
var chartPanel1 = ui.Panel();
var chartPanel2 = ui.Panel();

// --- Export buttons ---
var btnExportDelta = ui.Button({
  label: 'Export \u0394CH\u2084 GeoTIFF',
  style: {stretch: 'horizontal', margin: '2px 0'}
});
var btnExportCSV = ui.Button({
  label: 'Export enhancement CSV',
  style: {stretch: 'horizontal', margin: '2px 0'}
});

// --- About ---
var aboutLabel = ui.Label(
  'Data: TROPOMI L3 CH\u2084, CGLS-LC100, ERA5-Land\n' +
  'Method: \u0394CH\u2084 = XCH\u2084(wetland) \u2212 XCH\u2084(forest background)\n' +
  'Emission: transfer function (Sabrekov et al.)\n' +
  'Contact: [author]',
  {fontSize: '11px', color: '#555', whiteSpace: 'pre', margin: '4px 0'}
);

// ============================================================
// F. Core functions
// ============================================================

/**
 * Получить TROPOMI композит для выбранного года/месяца.
 * @return {ee.Image} band 'xch4' (ppb)
 */
function getSelectedImage() {
  var year  = parseInt(yearSelect.getValue(), 10);
  var month = parseInt(monthSelect.getValue(), 10);
  return ee.Image(monthlyAll
    .filter(ee.Filter.eq('year', year))
    .filter(ee.Filter.eq('month', month))
    .first());
}

/**
 * Вычислить карту ΔCH₄ для одного месячного композита.
 * @param {ee.Image} xch4Image band 'xch4'
 * @return {ee.Image} band 'delta_ch4' (ppb)
 */
function computeDeltaMap(xch4Image) {
  var forestBg = xch4Image.updateMask(forestBinary).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: FULL_AOI,
    scale: 7000,
    maxPixels: 1e9,
    tileScale: 8
  }).get('xch4');

  return xch4Image
    .subtract(ee.Image.constant(ee.Number(forestBg)))
    .rename('delta_ch4')
    .clip(FULL_AOI);
}

/**
 * Обновить summary labels через .evaluate() (без .getInfo()).
 * @param {ee.Image} xch4Image band 'xch4'
 */
function updateSummaryLabels(xch4Image) {
  var year  = yearSelect.getValue();
  var month = MONTH_NAMES[parseInt(monthSelect.getValue(), 10)];
  labelStatus.setValue('Computing ' + month + ' ' + year + '...');
  labelMeanXCH4.setValue('XCH\u2084 (wetlands): ...');
  labelDeltaCH4.setValue('\u0394CH\u2084: ...');

  ee.Dictionary({
    wetland: xch4Image.updateMask(wetlandBinary).reduceRegion({
      reducer: ee.Reducer.mean(), geometry: FULL_AOI,
      scale: 7000, maxPixels: 1e9, tileScale: 8
    }).get('xch4'),
    forest: xch4Image.updateMask(forestBinary).reduceRegion({
      reducer: ee.Reducer.mean(), geometry: FULL_AOI,
      scale: 7000, maxPixels: 1e9, tileScale: 8
    }).get('xch4')
  }).evaluate(function(d) {
    if (d && d.wetland !== null && d.forest !== null) {
      var delta = d.wetland - d.forest;
      labelMeanXCH4.setValue('XCH\u2084 (wetlands): ' + d.wetland.toFixed(1) + ' ppb');
      labelDeltaCH4.setValue('\u0394CH\u2084: ' + delta.toFixed(1) + ' ppb');
      labelStatus.setValue(month + ' ' + year + ' \u2714');
    } else {
      labelMeanXCH4.setValue('XCH\u2084: no data');
      labelDeltaCH4.setValue('\u0394CH\u2084: no data');
      labelStatus.setValue(month + ' ' + year + ' \u2014 no data');
    }
  });
}

/**
 * Главная функция обновления карты.
 * Reset слоёв → добавить включённые → обновить labels.
 */
function updateMap() {
  mapPanel.layers().reset();

  var xch4Image = getSelectedImage();
  var year  = yearSelect.getValue();
  var month = parseInt(monthSelect.getValue(), 10);
  var label = MONTH_NAMES[month] + ' ' + year;

  // 1. Land cover (фон)
  if (cbLandcover.getValue()) {
    mapPanel.addLayer(landcover, lcVis, 'Land cover');
  }

  // 2. Wetland mask
  if (cbWetland.getValue()) {
    mapPanel.addLayer(wetlandBinary.selfMask(), {
      palette: ['#00bcd4'], opacity: 0.4
    }, 'Wetland mask');
  }

  // 3. XCH₄ absolute
  if (cbXCH4.getValue()) {
    mapPanel.addLayer(xch4Image, xch4Vis, 'XCH\u2084 ' + label);
  }

  // 4. ΔCH₄ (default ON)
  if (cbDeltaCH4.getValue()) {
    var deltaMap = computeDeltaMap(xch4Image);
    mapPanel.addLayer(deltaMap.updateMask(wetlandBinary), deltaVis,
      '\u0394CH\u2084 ' + label);
  }

  // 5. Natural zones
  if (cbZones.getValue()) {
    var zonesImg = c.WSP.reduceToImage({
      properties: ['ID'], reducer: ee.Reducer.first()
    }).rename('zone_id');
    mapPanel.addLayer(zonesImg, {
      min: 1, max: 8, palette: c.ZONE_PALETTE, opacity: 0.5
    }, 'Natural zones');
  }

  // 6. Stations
  if (cbStations.getValue()) {
    mapPanel.addLayer(MUKHRINO, {color: 'yellow'}, 'Mukhrino');
    mapPanel.addLayer(BAKCHAR, {color: 'red'}, 'Bakchar');
    mapPanel.addLayer(ZOTTO, {color: 'magenta'}, 'ZOTTO');
  }

  // Update summary
  updateSummaryLabels(xch4Image);
}

// ============================================================
// G. Charts (вычисляются один раз при старте)
// ============================================================

/**
 * Построить enhancement FeatureCollection (паттерн Module 6).
 * @return {ee.FeatureCollection}
 */
function buildEnhancementFC() {
  var enhRaw = monthlyAll.map(function(img) {
    img = ee.Image(img);
    var xch4Wet = img.updateMask(wetlandBinary).reduceRegion({
      reducer: ee.Reducer.mean(), geometry: FULL_AOI,
      scale: 7000, maxPixels: 1e9, tileScale: 8
    }).get('xch4');
    var xch4For = img.updateMask(forestBinary).reduceRegion({
      reducer: ee.Reducer.mean(), geometry: FULL_AOI,
      scale: 7000, maxPixels: 1e9, tileScale: 8
    }).get('xch4');
    return ee.Feature(null, {
      year: img.get('year'), month: img.get('month'),
      xch4_wetland: xch4Wet, xch4_forest: xch4For
    });
  });

  return ee.FeatureCollection(enhRaw)
    .filter(ee.Filter.notNull(['xch4_wetland', 'xch4_forest']))
    .map(function(f) {
      var delta = ee.Number(f.get('xch4_wetland'))
        .subtract(ee.Number(f.get('xch4_forest')));
      return f.set('delta_ch4', delta);
    });
}

/**
 * Построить сезонный столбчатый график ΔCH₄.
 */
function buildSeasonalChart(enhancementFC) {
  var seasonalMean = ee.FeatureCollection(
    ee.List(c.SUMMER_MONTHS).map(function(m) {
      var subset = enhancementFC.filter(ee.Filter.eq('month', m));
      return ee.Feature(null, {
        month: m,
        delta_ch4: subset.aggregate_mean('delta_ch4'),
        xch4_wetland: subset.aggregate_mean('xch4_wetland'),
        xch4_forest: subset.aggregate_mean('xch4_forest')
      });
    })
  );

  var chart1 = ui.Chart.feature.byFeature(seasonalMean, 'month', 'delta_ch4')
    .setChartType('ColumnChart')
    .setOptions({
      title: 'Seasonal \u0394CH\u2084 (mean 2019\u20132025)',
      hAxis: {title: 'Month', ticks: [5, 6, 7, 8, 9, 10]},
      vAxis: {title: '\u0394CH\u2084 (ppb)'},
      colors: ['#1f77b4'],
      legend: 'none'
    });
  chartPanel1.clear();
  chartPanel1.add(chart1);

  var chart2 = ui.Chart.feature.byFeature(seasonalMean, 'month',
      ['xch4_wetland', 'xch4_forest'])
    .setChartType('LineChart')
    .setOptions({
      title: 'XCH\u2084: Wetlands vs Forests',
      hAxis: {title: 'Month', ticks: [5, 6, 7, 8, 9, 10]},
      vAxis: {title: 'XCH\u2084 (ppb)'},
      series: {
        0: {color: 'cyan', lineWidth: 2, pointSize: 5, labelInLegend: 'Wetlands'},
        1: {color: 'darkgreen', lineWidth: 2, pointSize: 5, labelInLegend: 'Forests'}
      }
    });
  chartPanel2.clear();
  chartPanel2.add(chart2);
}

// ============================================================
// H. Callbacks
// ============================================================

yearSelect.onChange(updateMap);
monthSelect.onChange(updateMap);
cbDeltaCH4.onChange(updateMap);
cbXCH4.onChange(updateMap);
cbWetland.onChange(updateMap);
cbLandcover.onChange(updateMap);
cbZones.onChange(updateMap);
cbStations.onChange(updateMap);

btnExportDelta.onClick(function() {
  var img = getSelectedImage();
  var delta = computeDeltaMap(img);
  var y = yearSelect.getValue();
  var m = monthSelect.getValue();
  Export.image.toDrive({
    image: delta,
    description: 'wetch4_delta_ch4_' + y + '_' + m,
    region: FULL_AOI,
    scale: 7000,
    maxPixels: 1e10
  });
  labelStatus.setValue('Export task created. Check Tasks tab.');
});

btnExportCSV.onClick(function() {
  var enhFC = buildEnhancementFC();
  Export.table.toDrive({
    collection: enhFC,
    description: 'wetch4_enhancement_all',
    fileFormat: 'CSV',
    selectors: ['year', 'month', 'xch4_wetland', 'xch4_forest', 'delta_ch4']
  });
  labelStatus.setValue('Export task created. Check Tasks tab.');
});

// ============================================================
// I. Layout assembly
// ============================================================

var mapPanel = ui.Map();
mapPanel.setCenter(73, 62, 5);
mapPanel.setOptions('HYBRID');

// --- Section dividers ---
function sectionLabel(text) {
  return ui.Label(text, {
    fontWeight: 'bold', fontSize: '13px',
    margin: '12px 0 4px 0', color: '#333'
  });
}

var leftPanel = ui.Panel({
  widgets: [
    titleLabel,
    subtitleLabel,
    btnDisclaimer,
    disclaimerPanel,

    sectionLabel('Period'),
    ui.Panel([ui.Label('Year:', {margin: '4px 8px 4px 0'}), yearSelect],
      ui.Panel.Layout.flow('horizontal')),
    ui.Panel([ui.Label('Month:', {margin: '4px 8px 4px 0'}), monthSelect],
      ui.Panel.Layout.flow('horizontal')),

    sectionLabel('Map Layers'),
    cbDeltaCH4, cbXCH4, cbWetland, cbLandcover, cbZones, cbStations,

    sectionLabel('Summary'),
    labelStatus,
    labelMeanXCH4, labelDeltaCH4, labelWetlandArea, labelEmission,

    sectionLabel('Seasonal Charts'),
    chartPanel1, chartPanel2,

    sectionLabel('Export'),
    btnExportDelta, btnExportCSV,

    sectionLabel('About'),
    aboutLabel
  ],
  style: {width: '360px', padding: '8px'}
});

ui.root.clear();
ui.root.add(ui.SplitPanel(leftPanel, mapPanel));

// ============================================================
// J. Initial render
// ============================================================

// Emission + area labels (один раз)
ee.Number(wetlandAreaM2).evaluate(function(area) {
  if (area !== null && area !== undefined) {
    var areaKm2 = Math.round(area / 1e6);
    var formatted = areaKm2.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var emTg = (MEAN_FLUX * area * EMISSION_HOURS / 1e15).toFixed(2);
    labelWetlandArea.setValue('Wetland area: ' + formatted + ' km\u00B2');
    labelEmission.setValue('Emission: ~' + emTg + ' Tg CH\u2084/yr');
  }
});

// Initial map (July 2023)
updateMap();

// Charts (вычисляются один раз, ~30 сек на 42 месяца)
var enhancementFC = buildEnhancementFC();
buildSeasonalChart(enhancementFC);
