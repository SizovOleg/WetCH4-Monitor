/**
 * @fileoverview WetCH4 Monitor — GEE App v3.
 *
 * Режим 1: Западная Сибирь (предвычисленные assets → мгновенно)
 * Режим 2: Custom AOI (рисуем polygon → пайплайн on-the-fly)
 *
 * Архитектура v3:
 *  • ассеты в папке WetLandCH4/ (подпроект nodal-thunder)
 *  • слот-менеджмент: каждый чекбокс переключает свой фикс. слой (setShown)
 *    без полного reset карты → зоны и пр. переключаются мгновенно
 *  • цветовая легенда ΔCH₄ снизу карты
 *  • graceful fallback: ошибки asset показываются понятным сообщением
 *  • 4 чарта: сезон/XCH₄/зоны (bar)/зоны × месяцы (line)
 */

// ============================================================
// A. Imports
// ============================================================

var c = require('users/ntcomz18_sand/wetch4_ws:gee/lib/constants');
var palettes = require('users/ntcomz18_sand/wetch4_ws:gee/lib/palettes');
var tropomiModule = require('users/ntcomz18_sand/wetch4_ws:gee/02_tropomi_monthly');

// ============================================================
// B. Precomputed assets (Mode 1) — папка WetLandCH4/
// ============================================================

var ROOT = 'projects/nodal-thunder-481307-u1/assets/WetLandCH4/';

var assetLandcover       = ee.Image(ROOT + 'wetland_mask');
var assetDeltaJuly       = ee.Image(ROOT + 'delta_ch4_july_mean');
var assetSeasonalMean    = ee.FeatureCollection(ROOT + 'seasonal_mean');
var assetEnhancement     = ee.FeatureCollection(ROOT + 'enhancement_full');
var assetZonalStats      = ee.FeatureCollection(ROOT + 'zonal_stats');
var assetZonalSeasonal   = ee.FeatureCollection(ROOT + 'zonal_seasonal');
var assetStations        = ee.FeatureCollection(ROOT + 'stations');
var WSP                  = c.WSP;

// ============================================================
// C. CGLS masks + TROPOMI monthly (для on-the-fly ΔCH₄)
// ============================================================

var cgls = ee.Image(c.CGLS_COLLECTION).select('discrete_classification');
var FULL_AOI = c.FULL_AOI.simplify(1000);
var wetlandBinary = cgls.eq(90).clip(FULL_AOI);
var forestBinary = cgls.gte(111).and(cgls.lte(126)).clip(FULL_AOI);
var monthlyAll = tropomiModule.buildMonthlyCollection(
  FULL_AOI, c.START_DATE, c.END_DATE
).map(function(img) { return ee.Image(img).clip(FULL_AOI); });

// ============================================================
// D. Visualization params
// ============================================================

var DELTA_MIN = -5;
var DELTA_MAX = 15;
var deltaVis = {min: DELTA_MIN, max: DELTA_MAX, palette: palettes.DELTA_CH4_PALETTE};
var lcVis = {min: 0, max: 3, palette: palettes.LANDCOVER_PALETTE};

var MEAN_FLUX = 3.035;
var EMISSION_HOURS = 4320;

var MONTH_NAMES = {5:'May',6:'June',7:'July',8:'August',9:'September',10:'October'};

// ============================================================
// E. Theme helpers
// ============================================================

var TH = {
  accent:  '#1f6feb',
  border:  '#e1e4e8',
  bgCard:  '#fafbfc',
  textMuted: '#6a737d',
  textDark:  '#24292e',
  danger:    '#c8321e',
  success:   '#2c974b'
};

function sectionLabel(text) {
  return ui.Label(text.toUpperCase(), {
    fontWeight: 'bold', fontSize: '11px',
    margin: '12px 0 6px 0', color: TH.accent
  });
}

function card(widgets, extra) {
  var style = {
    padding: '8px 10px',
    backgroundColor: TH.bgCard,
    border: '1px solid ' + TH.border,
    margin: '4px 0 8px 0'
  };
  if (extra) { for (var k in extra) style[k] = extra[k]; }
  return ui.Panel(widgets, null, style);
}

// ============================================================
// F. UI widgets
// ============================================================

// --- Title ---
var titleLabel = ui.Label('WetCH₄ Monitor',
  {fontWeight: 'bold', fontSize: '20px', margin: '4px 0 0 4px', color: TH.textDark});
var subtitleLabel = ui.Label('Wetland methane enhancement from TROPOMI',
  {fontSize: '12px', color: TH.textMuted, margin: '0 0 4px 4px'});

// --- Mode selector ---
var modeSelect = ui.Select({
  items: ['Western Siberia', 'Custom AOI'],
  value: 'Western Siberia',
  style: {stretch: 'horizontal'}
});

// --- Time slice controls ---
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
var yearRow = ui.Panel([ui.Label('Year:', {margin: '4px 8px 4px 0', color: TH.textMuted}), yearSelect],
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
var monthRow = ui.Panel([ui.Label('Month:', {margin: '4px 8px 4px 0', color: TH.textMuted}), monthSelect],
  ui.Panel.Layout.flow('horizontal'));

// Условная видимость
function updateTimeVisibility() {
  var type = typeSelect.getValue();
  yearRow.style().set('shown', type !== 'Seasonal mean');
  monthRow.style().set('shown', type !== 'Annual mean');
}

// --- Layer checkboxes ---
var cbDelta    = ui.Checkbox('\u0394CH\u2084 map', true);
var cbWetland  = ui.Checkbox('Wetland mask', false);
var cbZones    = ui.Checkbox('Natural zones', false);
var cbStations = ui.Checkbox('Stations', true);
var cbBoundary = ui.Checkbox('WSP boundary', true);

// --- Summary labels ---
var wsAreaLabel    = ui.Label('Wetland area: \u2026', {fontSize: '12px', color: TH.textDark});
var wsDeltaLabel   = ui.Label('Mean \u0394CH\u2084: \u2026', {fontSize: '12px', color: TH.textDark});
var wsEmissionLabel = ui.Label('Emission: \u2026', {fontSize: '12px', color: TH.textDark,
  fontWeight: 'bold'});

// --- Chart panels ---
var wsChartPanel1 = ui.Panel([], null, {margin: '4px 0'});
var wsChartPanel2 = ui.Panel([], null, {margin: '4px 0'});
var wsChartPanel3 = ui.Panel([], null, {margin: '4px 0'});
var wsChartPanel4 = ui.Panel([], null, {margin: '4px 0'});

// --- Mode 1 panel (W.Siberia) ---
var wsSibPanel = ui.Panel([
  sectionLabel('Time period'),
  card([typeSelect, yearRow, monthRow]),

  sectionLabel('Map layers'),
  card([cbDelta, cbWetland, cbZones, cbStations, cbBoundary]),

  sectionLabel('Summary'),
  card([wsAreaLabel, wsDeltaLabel, wsEmissionLabel]),

  sectionLabel('Charts'),
  wsChartPanel1, wsChartPanel2, wsChartPanel3, wsChartPanel4
]);

// --- Mode 2 panel (Custom) ---
var customStatus = ui.Label('Draw a polygon on the map, then press Run.',
  {fontSize: '11px', color: TH.textMuted});

var btnRun = ui.Button({
  label: '\u25B6 Run analysis',
  style: {stretch: 'horizontal', margin: '4px 0'}
});
var btnClear = ui.Button({
  label: 'Clear polygon',
  style: {stretch: 'horizontal', margin: '2px 0'}
});
var customResultsPanel = ui.Panel();

var customPanel = ui.Panel([
  customStatus, btnRun, btnClear, customResultsPanel
], null, {shown: false});

// --- Disclaimer (компактный) ---
var disclaimer = ui.Panel([
  ui.Label('\u26A0 Limitations', {fontWeight: 'bold', fontSize: '11px',
    color: TH.textDark, margin: '0 0 2px 0'}),
  ui.Label(
    '\u2022 TROPOMI = column-averaged XCH\u2084, not surface flux\n' +
    '\u2022 Winter (Nov\u2013Apr) excluded — low SNR\n' +
    '\u2022 \u0394CH\u2084 = XCH\u2084(wetland) \u2212 XCH\u2084(forest)\n' +
    '\u2022 Native resolution ~7 km\n' +
    '\u2022 Emission uses single transfer function',
    {fontSize: '10px', color: TH.textMuted, whiteSpace: 'pre', margin: '0'}
  )
], null, {border: '1px solid ' + TH.border, padding: '6px 8px',
  margin: '10px 0 4px 0', backgroundColor: TH.bgCard});

// --- About ---
var aboutPanel = ui.Panel([
  ui.Label('About', {fontWeight: 'bold', fontSize: '11px',
    color: TH.textDark, margin: '0 0 2px 0'}),
  ui.Label(
    'WetCH\u2084 Monitor v3.0\n' +
    'Data: TROPOMI L3, CGLS-LC100, ERA5-Land\n' +
    'Boundary: West Siberian Plain (8 natural zones)\n' +
    '\n' +
    'Developer: Oleg Sizov\n' +
    'Contact: kabanin1983@google.com',
    {fontSize: '10px', color: TH.textMuted, whiteSpace: 'pre', margin: '0'}
  )
], null, {padding: '6px 8px', margin: '4px 0'});

// ============================================================
// G. Map panel + ΔCH₄ color legend
// ============================================================

var mapPanel = ui.Map();
mapPanel.setOptions('HYBRID');
mapPanel.style().set('cursor', 'crosshair');
var drawingTools = mapPanel.drawingTools();
drawingTools.setShown(false);
drawingTools.setDrawModes(['polygon']);

// Color legend для ΔCH₄ (bottom-right) — плавный градиент через Thumbnail
function buildDeltaLegend() {
  // Канонический паттерн GEE: pixelLonLat + bbox в params
  var colorBar = ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0),
    params: {
      bbox: [0, 0, 1, 0.1],
      dimensions: '240x14',
      format: 'png',
      min: 0, max: 1,
      palette: palettes.DELTA_CH4_PALETTE
    },
    style: {stretch: 'horizontal', margin: '0', maxHeight: '14px'}
  });

  var ticks = ui.Panel([
    ui.Label(DELTA_MIN.toString() + ' ppb',
      {fontSize: '10px', margin: '3px 0 0 0', color: TH.textDark}),
    ui.Label('', {stretch: 'horizontal', margin: '0'}),
    ui.Label('+' + DELTA_MAX + ' ppb',
      {fontSize: '10px', margin: '3px 0 0 0', color: TH.textDark})
  ], ui.Panel.Layout.flow('horizontal'));

  var note = ui.Label(
    'blue \u2014 background \u00B7 red \u2014 emission',
    {fontSize: '9px', color: TH.textMuted, margin: '2px 0 0 0'});

  return ui.Panel([
    ui.Label('\u0394CH\u2084 enhancement',
      {fontWeight: 'bold', fontSize: '11px', margin: '0 0 4px 0',
       color: TH.textDark}),
    colorBar,
    ticks,
    note
  ], null, {
    position: 'bottom-right',
    padding: '8px 10px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    border: '1px solid ' + TH.border,
    width: '260px'
  });
}
var deltaLegend = buildDeltaLegend();
mapPanel.add(deltaLegend);

// Мини-легенда станций (top-right)
function stationRow(color, name) {
  return ui.Panel([
    ui.Label('\u25CF', {color: color, fontSize: '14px',
      margin: '0 6px 0 0', padding: '0'}),
    ui.Label(name, {fontSize: '11px', margin: '0', color: TH.textDark})
  ], ui.Panel.Layout.flow('horizontal'), {margin: '0', padding: '0'});
}

var stationsLegend = ui.Panel([
  ui.Label('Stations', {fontWeight: 'bold', fontSize: '11px',
    margin: '0 0 4px 0', color: TH.textDark}),
  stationRow('#F59E0B', 'Mukhrino'),
  stationRow('#DC2626', 'Bakchar'),
  stationRow('#7C3AED', 'ZOTTO')
], null, {
  position: 'top-right',
  padding: '8px 10px',
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  border: '1px solid ' + TH.border,
  width: '140px'
});
mapPanel.add(stationsLegend);

// ============================================================
// H. Layer slots — каждый чекбокс переключает свой слой
// ============================================================
//
// Слоты:
//   0: Delta CH4   (cbDelta)
//   1: Wetland     (cbWetland)
//   2: Zones       (cbZones)
//   3: Mukhrino    (cbStations)
//   4: Bakchar     (cbStations)
//   5: Zotto       (cbStations)
//   6: WSP boundary (cbBoundary)

var L = {};  // хранилище ui.Map.Layer объектов

function initLayers() {
  mapPanel.layers().reset();

  // Wetland mask (из asset)
  L.wetland = ui.Map.Layer(
    assetLandcover.eq(1).selfMask(),
    {palette: ['#00BCD4'], opacity: 0.45},
    'Wetland mask', cbWetland.getValue());

  // Natural zones (из FC → image)
  var zonesImg = WSP.reduceToImage({
    properties: ['ID'], reducer: ee.Reducer.first()
  });
  L.zones = ui.Map.Layer(zonesImg,
    {min: 1, max: 8, palette: c.ZONE_PALETTE, opacity: 0.55},
    'Natural zones', cbZones.getValue());

  // Stations
  L.muk   = ui.Map.Layer(c.MUKHRINO, {color: '#F59E0B'}, 'Mukhrino', cbStations.getValue());
  L.bak   = ui.Map.Layer(c.BAKCHAR,  {color: '#DC2626'}, 'Bakchar',  cbStations.getValue());
  L.zotto = ui.Map.Layer(c.ZOTTO,    {color: '#7C3AED'}, 'ZOTTO',    cbStations.getValue());

  // Boundary
  L.boundary = ui.Map.Layer(
    WSP.style({color: 'white', fillColor: '00000000', width: 1.5}),
    {}, 'WSP boundary', cbBoundary.getValue());

  // Delta CH4 — placeholder, заполнит updateDeltaLayer
  L.delta = ui.Map.Layer(ee.Image(), deltaVis, '\u0394CH\u2084', cbDelta.getValue());

  // Заливаем слоты фиксировано (0 — delta внизу; 6 — boundary сверху)
  mapPanel.layers().set(0, L.delta);
  mapPanel.layers().set(1, L.wetland);
  mapPanel.layers().set(2, L.zones);
  mapPanel.layers().set(3, L.muk);
  mapPanel.layers().set(4, L.bak);
  mapPanel.layers().set(5, L.zotto);
  mapPanel.layers().set(6, L.boundary);
}

/**
 * Пересчитать и обновить ТОЛЬКО ΔCH₄-слой (TROPOMI вычисление on-the-fly).
 */
function updateDeltaLayer() {
  if (!L.delta) return;
  if (!cbDelta.getValue()) {
    L.delta.setShown(false);
    return;
  }

  var type = typeSelect.getValue();
  var filtered, label;

  if (type === 'Seasonal mean') {
    var m = parseInt(monthSelect.getValue(), 10);
    filtered = monthlyAll.filter(ee.Filter.eq('month', m));
    label = MONTH_NAMES[m] + ' mean';
  } else if (type === 'Annual mean') {
    var y = parseInt(yearSelect.getValue(), 10);
    filtered = monthlyAll.filter(ee.Filter.eq('year', y));
    label = y + ' (May\u2013Oct)';
  } else {
    var y2 = parseInt(yearSelect.getValue(), 10);
    var m2 = parseInt(monthSelect.getValue(), 10);
    filtered = monthlyAll
      .filter(ee.Filter.eq('year', y2))
      .filter(ee.Filter.eq('month', m2));
    label = MONTH_NAMES[m2] + ' ' + y2;
  }

  var composite = filtered.mean().clip(FULL_AOI);

  var bg = composite.updateMask(forestBinary).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: FULL_AOI,
    scale: 7000, maxPixels: 1e9, tileScale: 8
  }).get('xch4');

  var deltaImg = composite
    .subtract(ee.Image.constant(ee.Number(bg)))
    .rename('delta_ch4').clip(FULL_AOI)
    .updateMask(wetlandBinary);

  L.delta.setEeObject(deltaImg);
  L.delta.setName('\u0394CH\u2084 \u2014 ' + label);
  L.delta.setShown(true);
}

// ============================================================
// I. Summary + Charts (с graceful fallback)
// ============================================================

function loadWSiberiaSummary() {
  // Площадь болот
  var wspSimple = WSP.geometry().simplify(1000);
  cgls.eq(90).rename('wetland').clip(wspSimple)
    .multiply(ee.Image.pixelArea())
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: wspSimple,
      scale: 1000,
      maxPixels: 1e10,
      tileScale: 8
    }).get('wetland').evaluate(function(val, err) {
      if (err || val === null || val === undefined) {
        wsAreaLabel.setValue('Wetland area: — (err)');
        wsEmissionLabel.setValue('Emission: —');
        return;
      }
      var areaKm2 = Math.round(val / 1e6);
      var fmt = areaKm2.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      wsAreaLabel.setValue('Wetland area: ' + fmt + ' km\u00B2');
      var emTg = (MEAN_FLUX * val * EMISSION_HOURS / 1e15).toFixed(2);
      wsEmissionLabel.setValue('Emission: ~' + emTg + ' Tg CH\u2084/yr');
    });

  // Mean ΔCH₄ — graceful fallback
  assetSeasonalMean.aggregate_mean('delta_ch4').evaluate(function(val, err) {
    if (err) {
      wsDeltaLabel.setValue('Mean \u0394CH\u2084: asset missing \u2014 run 09_export_assets.js');
      wsDeltaLabel.style().set('color', TH.danger);
      return;
    }
    if (val !== null) {
      wsDeltaLabel.setValue('Mean \u0394CH\u2084: ' + val.toFixed(1) + ' ppb');
    }
  });
}

function loadWSiberiaCharts() {
  // Диагностика — выведем ожидаемые пути в консоль
  print('Expected asset paths:');
  print('  ' + ROOT + 'seasonal_mean');
  print('  ' + ROOT + 'zonal_stats');
  print('  ' + ROOT + 'zonal_seasonal');

  // Чекнем доступность asset через size() перед построением
  assetSeasonalMean.size().evaluate(function(size, err) {
    if (err || size === null || size === 0) {
      var msg = err
        ? 'Asset missing at: ' + ROOT + 'seasonal_mean\n(err: ' + err + ')'
        : 'Asset "seasonal_mean" is empty.';
      wsChartPanel1.clear();
      wsChartPanel1.add(ui.Label('\u26A0 ' + msg,
        {color: TH.danger, fontSize: '11px', padding: '8px', whiteSpace: 'pre'}));
      return;
    }

    // Chart 1: Seasonal ΔCH₄ (bar)
    var chart1 = ui.Chart.feature.byFeature(assetSeasonalMean, 'month', 'delta_ch4')
      .setChartType('ColumnChart')
      .setOptions({
        title: 'Seasonal \u0394CH\u2084 (2019\u20132025)',
        hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
        vAxis: {title: '\u0394CH\u2084 (ppb)'},
        colors: ['#1f6feb'], legend: 'none',
        chartArea: {left: 48, top: 30, right: 16, bottom: 40}
      });
    wsChartPanel1.clear();
    wsChartPanel1.add(chart1);

    // Chart 2: XCH₄ wet vs forest
    var chart2 = ui.Chart.feature.byFeature(assetSeasonalMean, 'month',
        ['xch4_wetland', 'xch4_forest'])
      .setChartType('LineChart')
      .setOptions({
        title: 'XCH\u2084: wetlands vs forests',
        hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
        vAxis: {title: 'XCH\u2084 (ppb)'},
        series: {
          0: {color: '#0891b2', lineWidth: 2, pointSize: 5, labelInLegend: 'Wetlands'},
          1: {color: '#16a34a', lineWidth: 2, pointSize: 5, labelInLegend: 'Forests'}
        },
        chartArea: {left: 48, top: 30, right: 16, bottom: 40}
      });
    wsChartPanel2.clear();
    wsChartPanel2.add(chart2);
  });

  // Chart 3: Zonal ΔCH₄ (bar)
  assetZonalStats.size().evaluate(function(size, err) {
    if (err || size === null || size === 0) {
      wsChartPanel3.clear();
      wsChartPanel3.add(ui.Label('\u26A0 "zonal_stats" missing',
        {color: TH.danger, fontSize: '11px', padding: '8px'}));
      return;
    }
    var chart3 = ui.Chart.feature.byFeature(
        assetZonalStats.sort('zone_id'), 'zone_name', 'delta_ch4_ppb')
      .setChartType('ColumnChart')
      .setOptions({
        title: '\u0394CH\u2084 by natural zone',
        hAxis: {slantedText: true, slantedTextAngle: 35},
        vAxis: {title: '\u0394CH\u2084 (ppb)', baseline: 0},
        colors: ['#c8321e'], legend: 'none',
        chartArea: {left: 48, top: 30, right: 16, bottom: 70}
      });
    wsChartPanel3.clear();
    wsChartPanel3.add(chart3);
  });

  // Chart 4 (NEW): Seasonal ΔCH₄ by zone
  assetZonalSeasonal.size().evaluate(function(size, err) {
    if (err || size === null || size === 0) {
      wsChartPanel4.clear();
      wsChartPanel4.add(ui.Label('\u26A0 "zonal_seasonal" missing',
        {color: TH.danger, fontSize: '11px', padding: '8px'}));
      return;
    }
    var chart4 = ui.Chart.feature.groups(
        assetZonalSeasonal, 'month', 'delta_ch4', 'zone_name')
      .setChartType('LineChart')
      .setOptions({
        title: 'Seasonal \u0394CH\u2084 by zone',
        hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
        vAxis: {title: '\u0394CH\u2084 (ppb)', baseline: 0},
        interpolateNulls: true,
        chartArea: {left: 48, top: 30, right: 16, bottom: 40}
      });
    wsChartPanel4.clear();
    wsChartPanel4.add(chart4);
  });
}

// ============================================================
// J. Mode 2: Custom AOI (on-the-fly)
// ============================================================

function runCustomAnalysis() {
  var drawLayers = drawingTools.layers();
  if (drawLayers.length() === 0) {
    customStatus.setValue('\u26A0 Draw a polygon on the map first!');
    customStatus.style().set('color', TH.danger);
    return;
  }
  var customAOI = drawLayers.get(0).toGeometry();
  mapPanel.centerObject(customAOI);
  customStatus.setValue('\u23F3 Computing... (30\u201360 sec)');
  customStatus.style().set('color', TH.textMuted);
  customResultsPanel.clear();

  var wetMask = cgls.eq(90);
  var forMask = cgls.gte(111).and(cgls.lte(126));

  var wetAreaNum = wetMask.multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: customAOI,
    scale: 100, maxPixels: 1e10, tileScale: 4
  }).values().get(0);

  var monthly = tropomiModule.buildMonthlyCollection(
    customAOI, c.START_DATE, c.END_DATE
  ).map(function(img) { return ee.Image(img).clip(customAOI); });

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

  var julyMed = monthly.filter(ee.Filter.eq('month', 7)).mean();
  var bgFor = julyMed.updateMask(forMask).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: customAOI,
    scale: 7000, maxPixels: 1e9, tileScale: 8
  }).get('xch4');
  var deltaCustom = julyMed
    .subtract(ee.Image.constant(ee.Number(bgFor)))
    .rename('delta_ch4').clip(customAOI);

  mapPanel.addLayer(deltaCustom, deltaVis, 'Custom \u0394CH\u2084 July');
  mapPanel.addLayer(wetMask.selfMask().clip(customAOI),
    {palette: ['#00BCD4'], opacity: 0.35}, 'Custom wetlands');

  ee.Dictionary({
    wetArea: wetAreaNum,
    meanDelta: seasonalFC.aggregate_mean('delta_ch4')
  }).evaluate(function(d, err) {
    if (err || !d) {
      customStatus.setValue('\u274C Error computing custom AOI');
      customStatus.style().set('color', TH.danger);
      return;
    }
    customStatus.setValue('\u2705 Done!');
    customStatus.style().set('color', TH.success);

    if (d.wetArea !== null) {
      var areaKm2 = Math.round(d.wetArea / 1e6);
      var fmt = areaKm2.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      customResultsPanel.add(ui.Label('Wetland area: ' + fmt + ' km\u00B2',
        {fontWeight: 'bold', fontSize: '12px'}));
    }
    if (d.meanDelta !== null) {
      customResultsPanel.add(ui.Label('Mean \u0394CH\u2084: ' +
        d.meanDelta.toFixed(1) + ' ppb', {fontSize: '12px'}));
    }
  });

  var chart1 = ui.Chart.feature.byFeature(seasonalFC, 'month',
      ['xch4_wetland', 'xch4_forest'])
    .setChartType('LineChart')
    .setOptions({
      title: 'Custom AOI: XCH\u2084 wetlands vs forests',
      hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
      vAxis: {title: 'XCH\u2084 (ppb)'},
      series: {
        0: {color: '#0891b2', lineWidth: 2, pointSize: 5, labelInLegend: 'Wetlands'},
        1: {color: '#16a34a', lineWidth: 2, pointSize: 5, labelInLegend: 'Forests'}
      }
    });
  customResultsPanel.add(chart1);

  var chart2 = ui.Chart.feature.byFeature(seasonalFC, 'month', 'delta_ch4')
    .setChartType('ColumnChart')
    .setOptions({
      title: 'Custom AOI: Seasonal \u0394CH\u2084',
      hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
      vAxis: {title: '\u0394CH\u2084 (ppb)', baseline: 0},
      colors: ['#1f6feb'], legend: 'none'
    });
  customResultsPanel.add(chart2);
}

// ============================================================
// K. Callbacks
// ============================================================

// При смене периода — автоматически включаем слой ΔCH₄, если выключен
function ensureDeltaAndUpdate() {
  if (!cbDelta.getValue()) {
    cbDelta.setValue(true);   // триггерит cbDelta.onChange → updateDeltaLayer
  } else {
    updateDeltaLayer();
  }
}

typeSelect.onChange(function() { updateTimeVisibility(); ensureDeltaAndUpdate(); });
yearSelect.onChange(ensureDeltaAndUpdate);
monthSelect.onChange(ensureDeltaAndUpdate);

// Чекбоксы — только переключают видимость своего слоя, без reset
cbDelta.onChange(function(v) {
  if (!L.delta) return;
  if (v) { updateDeltaLayer(); } else { L.delta.setShown(false); }
});
cbWetland.onChange(function(v)  { if (L.wetland)  L.wetland.setShown(v); });
cbZones.onChange(function(v)    { if (L.zones)    L.zones.setShown(v); });
cbStations.onChange(function(v) {
  if (L.muk)   L.muk.setShown(v);
  if (L.bak)   L.bak.setShown(v);
  if (L.zotto) L.zotto.setShown(v);
});
cbBoundary.onChange(function(v) { if (L.boundary) L.boundary.setShown(v); });

btnRun.onClick(runCustomAnalysis);
btnClear.onClick(function() {
  drawingTools.layers().reset();
  customResultsPanel.clear();
  customStatus.setValue('Draw a polygon on the map, then press Run.');
  customStatus.style().set('color', TH.textMuted);
});

modeSelect.onChange(function(mode) {
  if (mode === 'Western Siberia') {
    wsSibPanel.style().set('shown', true);
    customPanel.style().set('shown', false);
    drawingTools.setShown(false);
    deltaLegend.style().set('shown', true);
    initLayers();
    updateDeltaLayer();
  } else {
    wsSibPanel.style().set('shown', false);
    customPanel.style().set('shown', true);
    drawingTools.setShown(true);
    drawingTools.setShape('polygon');
    deltaLegend.style().set('shown', false);
    customStatus.setValue('Draw a polygon on the map, then press Run.');
    customStatus.style().set('color', TH.textMuted);
  }
});

// ============================================================
// L. Layout
// ============================================================

var leftPanel = ui.Panel({
  widgets: [
    titleLabel, subtitleLabel,
    sectionLabel('Mode'),
    card([modeSelect]),
    wsSibPanel,
    customPanel,
    disclaimer,
    aboutPanel
  ],
  style: {width: '430px', padding: '8px 12px', backgroundColor: 'white'}
});

ui.root.clear();
ui.root.add(ui.SplitPanel(leftPanel, mapPanel));

// ============================================================
// M. Initial render (Mode 1)
// ============================================================

mapPanel.setCenter(73, 62, 4);
updateTimeVisibility();
initLayers();
updateDeltaLayer();
loadWSiberiaSummary();
loadWSiberiaCharts();
