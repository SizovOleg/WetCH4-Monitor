/**
 * @fileoverview WetCH4 Monitor — GEE App v2.
 *
 * Режим 1: Западная Сибирь (предвычисленные assets → мгновенно)
 * Режим 2: Custom AOI (рисуем polygon → пайплайн on-the-fly)
 *
 * Без .getInfo() — только .evaluate() для labels.
 */

// ============================================================
// A. Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var palettes = require('users/ntcomz18_sand/wetch4_ws:gee/lib/palettes');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

// ============================================================
// B. Precomputed assets (Mode 1)
// ============================================================

var ROOT = 'projects/nodal-thunder-481307-u1/assets/';

var assetLandcover    = ee.Image(ROOT + 'wetland_mask');
var assetDeltaJuly    = ee.Image(ROOT + 'delta_ch4_july_mean');
var assetSeasonalMean = ee.FeatureCollection(ROOT + 'seasonal_mean');
var assetEnhancement  = ee.FeatureCollection(ROOT + 'enhancement_full');
var assetZonalStats   = ee.FeatureCollection(ROOT + 'zonal_stats');
var assetStations     = ee.FeatureCollection(ROOT + 'stations');
var WSP               = c.WSP;

// ============================================================
// C. CGLS masks для Custom mode (lazy, не вычисляются до use)
// ============================================================

var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');

// TROPOMI + CGLS masks для on-the-fly ΔCH₄ (W.Siberia mode)
var FULL_AOI = c.FULL_AOI.simplify(1000);
var wetlandBinary = cgls.eq(90).clip(FULL_AOI);
var forestBinary = cgls.gte(111).and(cgls.lte(126)).clip(FULL_AOI);
var monthlyAll = tropomiModule.buildMonthlyCollection(
  FULL_AOI, c.START_DATE, c.END_DATE
).map(function(img) { return ee.Image(img).clip(FULL_AOI); });

// ============================================================
// D. Visualization params
// ============================================================

var deltaVis = {min: -10, max: 25, palette: palettes.DELTA_CH4_PALETTE};
var lcVis = {min: 0, max: 3, palette: palettes.LANDCOVER_PALETTE};
var zoneVis = {min: 1, max: 8, palette: c.ZONE_PALETTE};

var MEAN_FLUX = 3.035;
var EMISSION_HOURS = 4320;

// ============================================================
// E. UI widgets
// ============================================================

// --- Title ---
var titleLabel = ui.Label('WetCH4 Monitor',
  {fontWeight: 'bold', fontSize: '20px', margin: '8px 0 0 8px'});
var subtitleLabel = ui.Label('Wetland Methane from TROPOMI',
  {fontSize: '13px', color: '#666', margin: '0 0 6px 8px'});

// --- Mode selector ---
var modeSelect = ui.Select({
  items: ['Western Siberia', 'Custom AOI'],
  value: 'Western Siberia',
  style: {stretch: 'horizontal'}
});

// ─── Mode 1: W.Siberia panel ───

// Time slice: 3 dropdown-а (Type → Year → Month)
var MONTH_NAMES = {5:'May',6:'June',7:'July',8:'August',9:'September',10:'October'};

var typeSelect = ui.Select({
  items: ['Seasonal mean', 'Annual mean', 'Individual month'],
  value: 'Seasonal mean',
  style: {stretch: 'horizontal'}
});

var yearSelect = ui.Select({
  items: ['2019','2020','2021','2022','2023','2024','2025'],
  value: '2023',
  style: {stretch: 'horizontal'}
});
var yearRow = ui.Panel([ui.Label('Year:', {margin: '4px 8px 4px 0'}), yearSelect],
  ui.Panel.Layout.flow('horizontal'));

var monthSelect = ui.Select({
  items: [
    {label: 'May', value: '5'}, {label: 'June', value: '6'},
    {label: 'July', value: '7'}, {label: 'August', value: '8'},
    {label: 'September', value: '9'}, {label: 'October', value: '10'}
  ],
  value: '7',
  style: {stretch: 'horizontal'}
});
var monthRow = ui.Panel([ui.Label('Month:', {margin: '4px 8px 4px 0'}), monthSelect],
  ui.Panel.Layout.flow('horizontal'));

// Условная видимость: Seasonal → скрыть Year, Annual → скрыть Month
function updateTimeVisibility() {
  var type = typeSelect.getValue();
  yearRow.style().set('shown', type !== 'Seasonal mean');
  monthRow.style().set('shown', type !== 'Annual mean');
}
typeSelect.onChange(function() { updateTimeVisibility(); updateDeltaLayer(); });
yearSelect.onChange(updateDeltaLayer);
monthSelect.onChange(updateDeltaLayer);
updateTimeVisibility();

var cbDelta    = ui.Checkbox('\u0394CH\u2084 map', true);
var cbWetland  = ui.Checkbox('Wetland mask', false);
var cbZones    = ui.Checkbox('Natural zones', false);
var cbStations = ui.Checkbox('Stations', true);
var cbBoundary = ui.Checkbox('WSP boundary', true);

var wsChartPanel1 = ui.Panel();
var wsChartPanel2 = ui.Panel();
var wsChartPanel3 = ui.Panel();

var wsAreaLabel    = ui.Label('Wetland area: loading...', {fontSize: '13px'});
var wsDeltaLabel   = ui.Label('\u0394CH\u2084: loading...', {fontSize: '13px'});
var wsEmissionLabel = ui.Label('Emission: loading...', {fontSize: '13px'});

var wsSibPanel = ui.Panel([
  ui.Label('Time period', {fontWeight: 'bold', margin: '8px 0 4px 0'}),
  typeSelect, yearRow, monthRow,
  ui.Label('Map layers', {fontWeight: 'bold', margin: '8px 0 4px 0'}),
  cbDelta, cbWetland, cbZones, cbStations, cbBoundary,
  ui.Label('Summary', {fontWeight: 'bold', margin: '10px 0 4px 0'}),
  wsAreaLabel, wsDeltaLabel, wsEmissionLabel,
  ui.Label('Charts', {fontWeight: 'bold', margin: '10px 0 4px 0'}),
  wsChartPanel1, wsChartPanel2, wsChartPanel3
]);

// ─── Mode 2: Custom panel ───

var customStatus = ui.Label('Draw a polygon on the map, then press Run.',
  {fontSize: '12px', color: '#888'});

var btnRun = ui.Button({
  label: '\u25B6 Run analysis',
  style: {stretch: 'horizontal', fontWeight: 'bold', margin: '4px 0'}
});

var btnClear = ui.Button({
  label: 'Clear polygon',
  style: {stretch: 'horizontal', margin: '2px 0'}
});

var customResultsPanel = ui.Panel();

var customPanel = ui.Panel([
  customStatus, btnRun, btnClear, customResultsPanel
], null, {shown: false});

// ─── Disclaimer ───

var disclaimer = ui.Panel([
  ui.Label('\u26A0 Limitations', {fontWeight: 'bold', fontSize: '12px'}),
  ui.Label(
    '\u2022 TROPOMI = column-averaged CH\u2084, not surface flux\n' +
    '\u2022 Winter (Nov\u2013Apr) excluded\n' +
    '\u2022 \u0394CH\u2084 = XCH\u2084(wetland) \u2212 XCH\u2084(forest)\n' +
    '\u2022 Resolution ~7 km\n' +
    '\u2022 Emission uses single transfer function',
    {fontSize: '10px', color: '#666', whiteSpace: 'pre'}
  )
], null, {border: '1px solid #ddd', padding: '6px', margin: '8px 0'});

// ─── About ───

var aboutPanel = ui.Panel([
  ui.Label('About', {fontWeight: 'bold', margin: '8px 0 4px 0'}),
  ui.Label(
    'WetCH4 Monitor v2.0\n' +
    'Data: TROPOMI L3, CGLS-LC100, ERA5-Land\n' +
    'Boundary: West Siberian Plain (8 natural zones)\n' +
    'Contact: [author]',
    {fontSize: '10px', color: '#555', whiteSpace: 'pre'}
  )
]);

// ============================================================
// F. Map panel
// ============================================================

var mapPanel = ui.Map();
mapPanel.setOptions('HYBRID');
var drawingTools = mapPanel.drawingTools();
drawingTools.setShown(false);
drawingTools.setDrawModes(['polygon']);

// ============================================================
// G. Mode 1: Western Siberia (из assets)
// ============================================================

/**
 * Обновить ΔCH₄ слой по 3 dropdown-ам (type + year + month).
 */
function updateDeltaLayer() {
  // Если слой выключен — пустой placeholder
  if (!cbDelta.getValue()) {
    mapPanel.layers().set(0, ui.Map.Layer(ee.Image(), {}, '\u0394CH\u2084 (off)'));
    return;
  }

  var type = typeSelect.getValue();
  var filtered, label;

  if (type === 'Seasonal mean') {
    var month = parseInt(monthSelect.getValue(), 10);
    filtered = monthlyAll.filter(ee.Filter.eq('month', month));
    label = MONTH_NAMES[month] + ' mean';
  } else if (type === 'Annual mean') {
    var year = parseInt(yearSelect.getValue(), 10);
    filtered = monthlyAll.filter(ee.Filter.eq('year', year));
    label = year + ' (May\u2013Oct)';
  } else {
    var year = parseInt(yearSelect.getValue(), 10);
    var month = parseInt(monthSelect.getValue(), 10);
    filtered = monthlyAll
      .filter(ee.Filter.eq('year', year))
      .filter(ee.Filter.eq('month', month));
    label = MONTH_NAMES[month] + ' ' + year;
  }

  var composite = filtered.mean().clip(FULL_AOI);

  var bg = composite.updateMask(forestBinary).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: FULL_AOI,
    scale: 7000, maxPixels: 1e9, tileScale: 8
  }).get('xch4');

  var deltaImg = composite
    .subtract(ee.Image.constant(ee.Number(bg)))
    .rename('delta_ch4').clip(FULL_AOI);

  mapPanel.layers().set(0,
    ui.Map.Layer(deltaImg.updateMask(wetlandBinary), deltaVis,
      '\u0394CH\u2084 ' + label));
}

function loadWSiberia() {
  mapPanel.layers().reset();
  mapPanel.setCenter(73, 62, 4); // Центр ЗСР (явные координаты, не зависят от загрузки WSP)

  // Slot 0: ΔCH₄ (placeholder, заполняется updateDeltaLayer)
  mapPanel.addLayer(ee.Image(), {}, '\u0394CH\u2084 loading...');
  updateDeltaLayer();

  // Wetland mask
  if (cbWetland.getValue()) {
    mapPanel.addLayer(assetLandcover.eq(1).selfMask(),
      {palette: ['cyan'], opacity: 0.4}, 'Wetland mask');
  }
  // Natural zones
  if (cbZones.getValue()) {
    var zonesImg = WSP.reduceToImage({
      properties: ['ID'], reducer: ee.Reducer.first()
    });
    mapPanel.addLayer(zonesImg, {min: 1, max: 8, palette: c.ZONE_PALETTE, opacity: 0.5},
      'Natural zones');
  }
  // Stations
  if (cbStations.getValue()) {
    mapPanel.addLayer(c.MUKHRINO, {color: 'yellow'}, 'Mukhrino');
    mapPanel.addLayer(c.BAKCHAR, {color: 'red'}, 'Bakchar');
    mapPanel.addLayer(c.ZOTTO, {color: 'magenta'}, 'ZOTTO');
  }
  // Boundary
  if (cbBoundary.getValue()) {
    mapPanel.addLayer(WSP.style({color: 'white', fillColor: '00000000', width: 1.5}),
      {}, 'WSP boundary');
  }
}

function loadWSiberiaCharts() {
  // Chart 1: Seasonal ΔCH₄
  var chart1 = ui.Chart.feature.byFeature(assetSeasonalMean, 'month', 'delta_ch4')
    .setChartType('ColumnChart')
    .setOptions({
      title: 'Western Siberia: Seasonal \u0394CH\u2084 (2019\u20132025)',
      hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
      vAxis: {title: '\u0394CH\u2084 (ppb)'},
      colors: ['#1f77b4'], legend: 'none'
    });
  wsChartPanel1.clear();
  wsChartPanel1.add(chart1);

  // Chart 2: XCH₄ wet vs forest
  var chart2 = ui.Chart.feature.byFeature(assetSeasonalMean, 'month',
      ['xch4_wetland', 'xch4_forest'])
    .setChartType('LineChart')
    .setOptions({
      title: 'XCH\u2084: Wetlands vs Forests',
      hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
      vAxis: {title: 'XCH\u2084 (ppb)'},
      series: {
        0: {color: 'cyan', lineWidth: 2, pointSize: 5, labelInLegend: 'Wetlands'},
        1: {color: 'darkgreen', lineWidth: 2, pointSize: 5, labelInLegend: 'Forests'}
      }
    });
  wsChartPanel2.clear();
  wsChartPanel2.add(chart2);

  // Chart 3: Zonal ΔCH₄
  var chart3 = ui.Chart.feature.byFeature(
      assetZonalStats.sort('zone_id'), 'zone_name', 'delta_ch4_ppb')
    .setChartType('ColumnChart')
    .setOptions({
      title: '\u0394CH\u2084 by natural zone',
      hAxis: {slantedText: true},
      vAxis: {title: '\u0394CH\u2084 (ppb)', baseline: 0},
      colors: ['#d62728'], legend: 'none'
    });
  wsChartPanel3.clear();
  wsChartPanel3.add(chart3);
}

function loadWSiberiaSummary() {
  // Площадь болот из сырого CGLS (как Module 06)
  var wspSimple = WSP.geometry().simplify(1000);
  cgls.eq(90).rename('wetland').clip(wspSimple)
    .multiply(ee.Image.pixelArea())
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: wspSimple,
      scale: 1000,
      maxPixels: 1e10,
      tileScale: 8
    }).get('wetland').evaluate(function(val) {
      if (val !== null && val !== undefined) {
        var areaKm2 = Math.round(val / 1e6);
        var fmt = areaKm2.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        wsAreaLabel.setValue('Wetland area: ' + fmt + ' km\u00B2');
        var emTg = (MEAN_FLUX * val * EMISSION_HOURS / 1e15).toFixed(2);
        wsEmissionLabel.setValue('Emission: ~' + emTg + ' Tg CH\u2084/yr');
      }
    });
  // ΔCH₄ из seasonal asset
  assetSeasonalMean.aggregate_mean('delta_ch4').evaluate(function(val) {
    if (val !== null) {
      wsDeltaLabel.setValue('Mean \u0394CH\u2084: ' + val.toFixed(1) + ' ppb');
    }
  });
}

// ============================================================
// H. Mode 2: Custom AOI (on-the-fly)
// ============================================================

function runCustomAnalysis() {
  var drawLayers = drawingTools.layers();
  if (drawLayers.length() === 0) {
    customStatus.setValue('\u26A0 Draw a polygon on the map first!');
    return;
  }
  var customAOI = drawLayers.get(0).toGeometry();
  mapPanel.centerObject(customAOI);
  customStatus.setValue('\u23F3 Computing... (30\u201360 sec)');
  customResultsPanel.clear();

  // Маски
  var wetMask = cgls.eq(90);
  var forMask = cgls.gte(111).and(cgls.lte(126));

  // Площадь болот
  var wetAreaNum = wetMask.multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: customAOI,
    scale: 100, maxPixels: 1e10, tileScale: 4
  }).values().get(0);

  // TROPOMI monthly
  var monthly = tropomiModule.buildMonthlyCollection(
    customAOI, c.START_DATE, c.END_DATE
  ).map(function(img) { return ee.Image(img).clip(customAOI); });

  // Enhancement по месяцам
  var seasonalFC = ee.FeatureCollection(
    ee.List(c.SUMMER_MONTHS).map(function(m) {
      var monthImgs = monthly.filter(ee.Filter.eq('month', m));
      var med = monthImgs.mean();

      var xWet = med.updateMask(wetMask).reduceRegion({
        reducer: ee.Reducer.mean(), geometry: customAOI,
        scale: 7000, maxPixels: 1e9, tileScale: 8
      }).get('xch4');

      var xFor = med.updateMask(forMask).reduceRegion({
        reducer: ee.Reducer.mean(), geometry: customAOI,
        scale: 7000, maxPixels: 1e9, tileScale: 8
      }).get('xch4');

      return ee.Feature(null, {
        month: m,
        xch4_wetland: xWet,
        xch4_forest: xFor,
        delta_ch4: ee.Algorithms.If(
          ee.Algorithms.IsEqual(xWet, null), 0,
          ee.Algorithms.If(ee.Algorithms.IsEqual(xFor, null), 0,
            ee.Number(xWet).subtract(ee.Number(xFor))
          )
        )
      });
    })
  );

  // Карта ΔCH₄ July
  var julyMed = monthly.filter(ee.Filter.eq('month', 7)).mean();
  var bgFor = julyMed.updateMask(forMask).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: customAOI,
    scale: 7000, maxPixels: 1e9, tileScale: 8
  }).get('xch4');
  var deltaCustom = julyMed
    .subtract(ee.Image.constant(ee.Number(bgFor)))
    .rename('delta_ch4').clip(customAOI);

  // Слои
  mapPanel.addLayer(deltaCustom, deltaVis, 'Custom \u0394CH\u2084 July');
  mapPanel.addLayer(wetMask.selfMask().clip(customAOI),
    {palette: ['cyan'], opacity: 0.3}, 'Custom wetlands');

  // Результаты через .evaluate()
  ee.Dictionary({
    wetArea: wetAreaNum,
    meanDelta: seasonalFC.aggregate_mean('delta_ch4')
  }).evaluate(function(d) {
    if (!d) { customStatus.setValue('\u274C Error'); return; }
    customStatus.setValue('\u2705 Done!');

    if (d.wetArea !== null) {
      var areaKm2 = Math.round(d.wetArea / 1e6);
      var fmt = areaKm2.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      customResultsPanel.add(ui.Label('Wetland area: ' + fmt + ' km\u00B2',
        {fontWeight: 'bold', fontSize: '13px'}));
    }
    if (d.meanDelta !== null) {
      customResultsPanel.add(ui.Label('Mean \u0394CH\u2084: ' +
        d.meanDelta.toFixed(1) + ' ppb', {fontSize: '13px'}));
    }
  });

  // Графики
  var chart1 = ui.Chart.feature.byFeature(seasonalFC, 'month',
      ['xch4_wetland', 'xch4_forest'])
    .setChartType('LineChart')
    .setOptions({
      title: 'Custom AOI: XCH\u2084 Wetlands vs Forests',
      hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
      vAxis: {title: 'XCH\u2084 (ppb)'},
      series: {
        0: {color: 'cyan', lineWidth: 2, pointSize: 5, labelInLegend: 'Wetlands'},
        1: {color: 'darkgreen', lineWidth: 2, pointSize: 5, labelInLegend: 'Forests'}
      }
    });
  customResultsPanel.add(chart1);

  var chart2 = ui.Chart.feature.byFeature(seasonalFC, 'month', 'delta_ch4')
    .setChartType('ColumnChart')
    .setOptions({
      title: 'Custom AOI: Seasonal \u0394CH\u2084',
      hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
      vAxis: {title: '\u0394CH\u2084 (ppb)', baseline: 0},
      colors: ['#1f77b4'], legend: 'none'
    });
  customResultsPanel.add(chart2);
}

// ============================================================
// I. Callbacks
// ============================================================

cbDelta.onChange(updateDeltaLayer);
cbWetland.onChange(loadWSiberia);
cbZones.onChange(loadWSiberia);
cbStations.onChange(loadWSiberia);
cbBoundary.onChange(loadWSiberia);

btnRun.onClick(runCustomAnalysis);
btnClear.onClick(function() {
  drawingTools.layers().reset();
  customResultsPanel.clear();
  customStatus.setValue('Draw a polygon on the map, then press Run.');
});

modeSelect.onChange(function(mode) {
  if (mode === 'Western Siberia') {
    wsSibPanel.style().set('shown', true);
    customPanel.style().set('shown', false);
    drawingTools.setShown(false);
    loadWSiberia();
  } else {
    wsSibPanel.style().set('shown', false);
    customPanel.style().set('shown', true);
    drawingTools.setShown(true);
    drawingTools.setShape('polygon');
    customStatus.setValue('Draw a polygon on the map, then press Run.');
  }
});

// ============================================================
// J. Layout
// ============================================================

function sectionLabel(text) {
  return ui.Label(text, {fontWeight: 'bold', fontSize: '13px',
    margin: '10px 0 4px 0', color: '#333'});
}

var leftPanel = ui.Panel({
  widgets: [
    titleLabel, subtitleLabel,
    sectionLabel('Mode'),
    modeSelect,
    wsSibPanel,
    customPanel,
    disclaimer,
    aboutPanel
  ],
  style: {width: '370px', padding: '8px'}
});

ui.root.clear();
ui.root.add(ui.SplitPanel(leftPanel, mapPanel));

// ============================================================
// K. Initial render (Mode 1)
// ============================================================

loadWSiberia();
loadWSiberiaCharts();
loadWSiberiaSummary();
