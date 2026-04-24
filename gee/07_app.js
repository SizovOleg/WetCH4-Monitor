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

// Typography — три уровня: section / body / caption
function sectionLabel(text) {
  return ui.Label(text.toUpperCase(), {
    fontWeight: 'bold', fontSize: '11px',
    margin: '14px 0 6px 0', color: TH.accent, padding: '0'
  });
}

function bodyLabel(text, extra) {
  var s = {fontSize: '12px', color: TH.textDark, margin: '0 0 2px 0'};
  if (extra) { for (var k in extra) s[k] = extra[k]; }
  return ui.Label(text, s);
}

function captionLabel(text, extra) {
  var s = {fontSize: '10px', color: TH.textMuted, margin: '2px 0 0 0'};
  if (extra) { for (var k in extra) s[k] = extra[k]; }
  return ui.Label(text, s);
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

// Единые форматы чисел для UI
// Area в км² без дробной части с разделителями тысяч: 673,205 km²
function fmtArea(km2) {
  var rounded = Math.round(km2);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' km\u00B2';
}
// Emission в Тг с 2 знаками: 8.83 Tg CH₄ yr⁻¹
function fmtEmission(tg) {
  return tg.toFixed(2) + ' Tg CH\u2084 yr\u207B\u00B9';
}
// Delta в ppb с 1 знаком и явным знаком: +11.8 ppb, −0.3 ppb
function fmtDelta(ppb) {
  var s = ppb.toFixed(1);
  return (ppb >= 0 ? '+' : '') + s + ' ppb';
}

// ============================================================
// F. UI widgets
// ============================================================

// --- Title ---
var titleLabel = ui.Label('WetCH₄ Monitor',
  {fontWeight: 'bold', fontSize: '20px', margin: '4px 0 0 4px', color: TH.textDark});
var subtitleLabel = ui.Label('Wetland methane enhancement from TROPOMI \u00b7 2019\u20132025',
  {fontSize: '12px', color: TH.textMuted, margin: '0 0 4px 4px'});

// --- Onboarding (виден сразу при загрузке) ---
var onboardingPanel = ui.Panel([
  ui.Label('What it shows', {fontWeight: 'bold', fontSize: '11px',
    color: TH.textDark, margin: '0 0 3px 0'}),
  ui.Label(
    'CH\u2084 excess over West-Siberian wetlands, derived from TROPOMI\n' +
    'column-averaged methane (Sentinel-5P, 2019\u20132025).',
    {fontSize: '11px', color: TH.textMuted, margin: '0 0 8px 0',
     whiteSpace: 'pre'}),

  ui.Label('How to start', {fontWeight: 'bold', fontSize: '11px',
    color: TH.textDark, margin: '0 0 3px 0'}),
  ui.Label(
    '\u2460  Western Siberia \u2014 ready maps, charts and regional stats.\n' +
    '\u2461  Custom AOI \u2014 draw a polygon, press Run, get \u0394CH\u2084 for your area.',
    {fontSize: '11px', color: TH.textMuted, margin: '0', whiteSpace: 'pre'})
], null, {
  backgroundColor: '#f0f7ff',
  border: '1px solid #c7e0ff',
  padding: '10px 12px',
  margin: '6px 0 4px 0'
});

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

// --- Coverage selector: wetlands-only vs full land ---
// Default = wetlands only (соответствует основному scientific message статьи:
// enhancement анализируется над болотами). Full land показывает всю ЗСР —
// полезно для контекста (antropogenic hotspots, сельхоз).
var coverageSelect = ui.Select({
  items: [
    {label: 'Wetlands only', value: 'wetlands'},
    {label: 'Full land',     value: 'full'}
  ],
  value: 'wetlands',
  style: {stretch: 'horizontal'}
});
var coverageRow = ui.Panel(
  [ui.Label('Coverage:', {margin: '4px 8px 4px 0', color: TH.textMuted}),
   coverageSelect],
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

// --- Export GeoTIFF button (current ΔCH₄ slice) ---
// ВНИМАНИЕ: Export.image.toDrive создаёт task в Earth Engine Tasks tab
// ТЕКУЩЕГО пользователя. Для анонимного viewer'а без GEE-аккаунта задача
// просто зарегистрируется, но её некому будет подтвердить. Для academic users
// с GEE account всё работает как обычный Export в их Drive.
var btnExportDelta = ui.Button({
  label: '\u2B73 Export slice to Drive (GeoTIFF)',
  style: {stretch: 'horizontal', margin: '8px 0 2px 0'}
});
var exportStatus = ui.Label(
  'Requires GEE account \u2014 task lands in your Tasks tab.',
  {fontSize: '10px', color: TH.textMuted, margin: '0'});

btnExportDelta.onClick(function() {
  if (!currentDelta.img) {
    exportStatus.setValue('\u26A0 No slice to export \u2014 toggle \u0394CH\u2084 on first.');
    exportStatus.style().set('color', TH.danger);
    return;
  }
  var name = 'delta_ch4_' + currentDelta.description;
  Export.image.toDrive({
    image: currentDelta.img.toFloat(),
    description: name,
    fileNamePrefix: name,
    region: FULL_AOI,
    scale: 7000,
    crs: 'EPSG:4326',
    maxPixels: 1e10,
    fileFormat: 'GeoTIFF',
    formatOptions: {cloudOptimized: true}
  });
  exportStatus.setValue('\u2713 Task queued: ' + name +
    '.tif \u2014 open Tasks tab in Code Editor to run.');
  exportStatus.style().set('color', TH.success);
});

// --- Chart panels (помещаются в Charts tab) ---
var wsChartPanel1 = ui.Panel([], null, {margin: '4px 0'});
var wsChartPanel2 = ui.Panel([], null, {margin: '4px 0'});
var wsChartPanel3 = ui.Panel([], null, {margin: '4px 0'});
var wsChartPanel4 = ui.Panel([], null, {margin: '4px 0'});

// --- Mode 1 controls (Time/Layers/Summary) ---
var wsSibControlsPanel = ui.Panel([
  sectionLabel('Time period'),
  card([typeSelect, yearRow, monthRow, coverageRow]),

  sectionLabel('Map layers'),
  card([cbDelta, cbWetland, cbZones, cbStations, cbBoundary]),

  sectionLabel('Summary'),
  card([wsAreaLabel, wsDeltaLabel, wsEmissionLabel,
        btnExportDelta, exportStatus])
]);

// --- Mode 2 (Custom) controls ---
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
// Custom results (numbers + charts) будут перенаправлены в Charts tab
var customChartsPanel = ui.Panel([], null,
  {margin: '4px 0', shown: false});

var customControlsPanel = ui.Panel([
  sectionLabel('Custom AOI'),
  card([customStatus, btnRun, btnClear, customResultsPanel])
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
// Нейтральная подложка по умолчанию — чтобы не конкурировать
// с diverging-палитрой ΔCH₄. Пользователь может переключить на HYBRID.
mapPanel.setOptions('ROADMAP');
mapPanel.style().set('cursor', 'crosshair');
var drawingTools = mapPanel.drawingTools();
drawingTools.setShown(false);
drawingTools.setDrawModes(['polygon']);

// Caption с текущим периодом — обновляется при updateDeltaLayer
var legendPeriodLabel = ui.Label('computing\u2026',
  {fontSize: '10px', color: TH.textMuted, margin: '0 0 4px 0',
   textAlign: 'right', stretch: 'horizontal'});

// Color legend для ΔCH₄ (bottom-right) — плавный градиент + 5 тиков + 0
function buildDeltaLegend() {
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

  // 5 делений: -5, 0, +5, +10, +15 (равномерно по шкале -5...15)
  // Пять подписей равной ширины, чтобы числа встали под соответствующими долями bar-а
  function tickLabel(text, bold) {
    return ui.Label(text, {
      fontSize: '10px', margin: '3px 0 0 0',
      color: bold ? TH.textDark : TH.textMuted,
      fontWeight: bold ? 'bold' : 'normal',
      textAlign: 'center', stretch: 'horizontal', padding: '0'
    });
  }
  var ticks = ui.Panel([
    tickLabel('\u22125', false),   // −5
    tickLabel('0', true),          // 0 — жирный
    tickLabel('+5', false),
    tickLabel('+10', false),
    tickLabel('+15', false)
  ], ui.Panel.Layout.flow('horizontal'));

  var note = ui.Label(
    'blue \u00b7 below background    red \u00b7 wetland emission',
    {fontSize: '9px', color: TH.textMuted, margin: '4px 0 0 0',
     textAlign: 'center', stretch: 'horizontal'});

  var titleRow = ui.Panel([
    ui.Label('\u0394CH\u2084, ppb',
      {fontWeight: 'bold', fontSize: '11px', margin: '0',
       color: TH.textDark}),
    legendPeriodLabel
  ], ui.Panel.Layout.flow('horizontal'), {margin: '0 0 4px 0'});

  return ui.Panel([
    titleRow,
    colorBar,
    ticks,
    note
  ], null, {
    position: 'bottom-right',
    padding: '8px 10px',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    border: '1px solid ' + TH.border,
    width: '280px'
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

  // Иерархия слоёв: ΔCH₄ — primary; остальные — muted context.
  // Прозрачность и линии подобраны так, чтобы не перебивать ΔCH₄.

  // Wetland mask — лёгкий контур поверх основного слоя
  L.wetland = ui.Map.Layer(
    assetLandcover.eq(1).selfMask(),
    {palette: ['#00BCD4'], opacity: 0.28},
    'Wetland mask', cbWetland.getValue());

  // Natural zones — muted fill, не конкурирует с ΔCH₄
  var zonesImg = WSP.reduceToImage({
    properties: ['ID'], reducer: ee.Reducer.first()
  });
  L.zones = ui.Map.Layer(zonesImg,
    {min: 1, max: 8, palette: c.ZONE_PALETTE, opacity: 0.38},
    'Natural zones', cbZones.getValue());

  // Stations — явные маркеры, размер 8, белая обводка для видимости на любом фоне
  L.muk   = ui.Map.Layer(
    ee.FeatureCollection([c.MUKHRINO])
      .style({color: 'white', fillColor: '#F59E0B', pointSize: 8, width: 2}),
    {}, 'Mukhrino', cbStations.getValue());
  L.bak   = ui.Map.Layer(
    ee.FeatureCollection([c.BAKCHAR])
      .style({color: 'white', fillColor: '#DC2626', pointSize: 8, width: 2}),
    {}, 'Bakchar', cbStations.getValue());
  L.zotto = ui.Map.Layer(
    ee.FeatureCollection([c.ZOTTO])
      .style({color: 'white', fillColor: '#7C3AED', pointSize: 8, width: 2}),
    {}, 'ZOTTO', cbStations.getValue());

  // Boundary — уверенная тонкая линия (primary context element)
  L.boundary = ui.Map.Layer(
    WSP.style({color: '#24292e', fillColor: '00000000', width: 2.0}),
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

// Контекст текущего slice (для legend caption и Export-кнопки).
// img заполняется ТОЛЬКО после валидации forest background.
var currentDelta = {img: null, label: null, description: null};

// Request token — защита от stale callback при быстром переключении period.
// Каждый вызов updateDeltaLayer получает новый id; результат старого evaluate
// игнорируется, если id больше не актуален.
var deltaReqId = 0;

/**
 * Пересчитать и обновить ТОЛЬКО ΔCH₄-слой (TROPOMI вычисление on-the-fly).
 */
function updateDeltaLayer() {
  if (!L.delta) return;
  if (!cbDelta.getValue()) {
    deltaReqId++;   // инвалидируем любой pending callback
    L.delta.setShown(false);
    currentDelta = {img: null, label: null, description: null};
    legendPeriodLabel.setValue('layer off');
    return;
  }

  var reqId = ++deltaReqId;
  var type = typeSelect.getValue();
  var filtered, label, description;

  if (type === 'Seasonal mean') {
    var m = parseInt(monthSelect.getValue(), 10);
    filtered = monthlyAll.filter(ee.Filter.eq('month', m));
    label = MONTH_NAMES[m] + ' \u00b7 mean 2019\u20132025';
    description = MONTH_NAMES[m] + '_mean_2019_2025';
  } else if (type === 'Annual mean') {
    var y = parseInt(yearSelect.getValue(), 10);
    filtered = monthlyAll.filter(ee.Filter.eq('year', y));
    label = y + ' \u00b7 May\u2013Oct mean';
    description = y + '_MayOct_mean';
  } else {
    var y2 = parseInt(yearSelect.getValue(), 10);
    var m2 = parseInt(monthSelect.getValue(), 10);
    filtered = monthlyAll
      .filter(ee.Filter.eq('year', y2))
      .filter(ee.Filter.eq('month', m2));
    label = MONTH_NAMES[m2] + ' ' + y2;
    description = MONTH_NAMES[m2] + '_' + y2;
  }

  // Coverage режим — user-facing суффикс к label
  var coverage = coverageSelect.getValue();  // 'wetlands' | 'full'
  label = label + ' \u00b7 ' + (coverage === 'wetlands' ? 'wetlands only' : 'full land');
  description = description + '_' + coverage;

  // Sanitize description для Export task name (без пробелов, unicode и т.п.)
  description = description.replace(/[^A-Za-z0-9_]/g, '_');

  // Loading state
  legendPeriodLabel.setValue('computing\u2026');

  var composite = filtered.mean().clip(FULL_AOI);

  var bg = composite.updateMask(forestBinary).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: FULL_AOI,
    scale: 7000, maxPixels: 1e9, tileScale: 8
  }).get('xch4');

  // Валидируем bg и обновляем слой ТОЛЬКО если reqId ещё актуален.
  // Это защищает от stale-callback (старый evaluate может вернуться
  // после того, как пользователь уже переключил period).
  ee.Number(bg).evaluate(function(bgVal, err) {
    if (reqId !== deltaReqId) return;   // пользователь уже выбрал другой period

    if (err || bgVal === null || bgVal === undefined) {
      legendPeriodLabel.setValue('no valid TROPOMI data \u00b7 ' + label);
      L.delta.setShown(false);
      currentDelta = {img: null, label: null, description: null};
      return;
    }

    var deltaBase = composite
      .subtract(ee.Image.constant(bgVal))
      .rename('delta_ch4').clip(FULL_AOI);

    var deltaImg = (coverage === 'wetlands')
      ? deltaBase.updateMask(wetlandBinary)
      : deltaBase;

    currentDelta = {img: deltaImg, label: label, description: description};

    L.delta.setEeObject(deltaImg);
    L.delta.setName('\u0394CH\u2084 \u2014 ' + label);
    L.delta.setShown(true);
    legendPeriodLabel.setValue(label);
  });
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
      wsAreaLabel.setValue('Wetland area: ' + fmtArea(val / 1e6));
      var emTg = MEAN_FLUX * val * EMISSION_HOURS / 1e15;
      wsEmissionLabel.setValue('Emission: ' + fmtEmission(emTg));
    });

  // Mean ΔCH₄ — graceful fallback
  assetSeasonalMean.aggregate_mean('delta_ch4').evaluate(function(val, err) {
    if (err) {
      wsDeltaLabel.setValue('Mean \u0394CH\u2084: asset missing \u2014 run 09_export_assets.js');
      wsDeltaLabel.style().set('color', TH.danger);
      return;
    }
    if (val !== null) {
      wsDeltaLabel.setValue('Mean \u0394CH\u2084: ' + fmtDelta(val));
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
  customStatus.setValue('\u23F3 Computing... (30\u201360 sec). Charts will appear in the Charts tab.');
  customStatus.style().set('color', TH.textMuted);
  customResultsPanel.clear();
  customChartsPanel.clear();
  customChartsPanel.style().set('shown', true);

  var wetMask = cgls.eq(90);

  var wetAreaNum = wetMask.multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: customAOI,
    scale: 100, maxPixels: 1e10, tileScale: 4
  }).values().get(0);

  var monthly = tropomiModule.buildMonthlyCollection(
    customAOI, c.START_DATE, c.END_DATE
  ).map(function(img) { return ee.Image(img).clip(customAOI); });

  // ΔCH₄ = XCH₄(болота в polygon) − XCH₄(лес всей ЗСР) для каждого месяца.
  // Фон стабилен и одинаков для любого polygon — позволяет сравнивать участки
  // в одной шкале «относительно регионального фона ЗСР».
  var seasonalFC = ee.FeatureCollection(
    ee.List(c.SUMMER_MONTHS).map(function(m) {
      var monthImgs = monthly.filter(ee.Filter.eq('month', m));
      var med = monthImgs.mean();
      var xWet = med.updateMask(wetMask).reduceRegion({
        reducer: ee.Reducer.mean(), geometry: customAOI,
        scale: 7000, maxPixels: 1e9, tileScale: 8
      }).get('xch4');
      // WSP-wide forest background для этого месяца из seasonal_mean asset
      var wspForest = ee.Number(
        assetSeasonalMean.filter(ee.Filter.eq('month', m)).first().get('xch4_forest')
      );
      return ee.Feature(null, {
        month: m,
        xch4_wetland: xWet,
        xch4_forest_wsp: wspForest,
        delta_ch4: ee.Algorithms.If(
          ee.Algorithms.IsEqual(xWet, null), 0,
          ee.Number(xWet).subtract(wspForest)
        )
      });
    })
  );

  // Карта ΔCH₄ июль — XCH₄ polygon минус WSP-wide forest для июля
  var julyMed = monthly.filter(ee.Filter.eq('month', 7)).mean();
  var julyWspForest = ee.Number(
    assetSeasonalMean.filter(ee.Filter.eq('month', 7)).first().get('xch4_forest')
  );
  var deltaCustom = julyMed
    .subtract(ee.Image.constant(julyWspForest))
    .rename('delta_ch4').clip(customAOI);

  mapPanel.addLayer(deltaCustom, deltaVis,
    'Custom \u0394CH\u2084 July (vs WSP forest)');
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

    // Числа остаются в Overview (customResultsPanel), чтобы пользователь
    // сразу видел результаты под кнопкой Run
    if (d.wetArea !== null) {
      customResultsPanel.add(ui.Label('Wetland area: ' + fmtArea(d.wetArea / 1e6),
        {fontWeight: 'bold', fontSize: '12px'}));
    }
    if (d.meanDelta !== null) {
      customResultsPanel.add(ui.Label('Mean \u0394CH\u2084: ' +
        fmtDelta(d.meanDelta), {fontSize: '12px'}));
    }
    customResultsPanel.add(ui.Label(
      '\u2192 Open the Charts tab for seasonal plots.',
      {fontSize: '10px', color: TH.textMuted, margin: '4px 0 0 0'}));
  });

  // Графики — в Charts tab (customChartsPanel)
  var chart1 = ui.Chart.feature.byFeature(seasonalFC, 'month',
      ['xch4_wetland', 'xch4_forest_wsp'])
    .setChartType('LineChart')
    .setOptions({
      title: 'Custom AOI: XCH\u2084 wetlands (polygon) vs WSP forest background',
      hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
      vAxis: {title: 'XCH\u2084 (ppb)'},
      series: {
        0: {color: '#0891b2', lineWidth: 2, pointSize: 5,
            labelInLegend: 'Wetlands (polygon)'},
        1: {color: '#16a34a', lineWidth: 2, pointSize: 5,
            labelInLegend: 'Forests (WSP-wide)'}
      }
    });
  customChartsPanel.add(chart1);

  var chart2 = ui.Chart.feature.byFeature(seasonalFC, 'month', 'delta_ch4')
    .setChartType('ColumnChart')
    .setOptions({
      title: 'Custom AOI: Seasonal \u0394CH\u2084',
      hAxis: {title: 'Month', ticks: [5,6,7,8,9,10]},
      vAxis: {title: '\u0394CH\u2084 (ppb)', baseline: 0},
      colors: ['#1f6feb'], legend: 'none'
    });
  customChartsPanel.add(chart2);
}

// ============================================================
// K. Callbacks
// ============================================================

// При смене периода — автоматически включаем слой ΔCH₄, если выключен.
// Мгновенно показываем caption "computing…" чтобы пользователь видел отклик.
function ensureDeltaAndUpdate() {
  legendPeriodLabel.setValue('computing\u2026');
  if (!cbDelta.getValue()) {
    cbDelta.setValue(true);   // триггерит cbDelta.onChange → updateDeltaLayer
  } else {
    updateDeltaLayer();
  }
}

typeSelect.onChange(function() { updateTimeVisibility(); ensureDeltaAndUpdate(); });
yearSelect.onChange(ensureDeltaAndUpdate);
monthSelect.onChange(ensureDeltaAndUpdate);
coverageSelect.onChange(ensureDeltaAndUpdate);

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
  customChartsPanel.clear();
  customChartsPanel.style().set('shown', false);
  customStatus.setValue('Draw a polygon on the map, then press Run.');
  customStatus.style().set('color', TH.textMuted);
});

modeSelect.onChange(function(mode) {
  if (mode === 'Western Siberia') {
    wsSibControlsPanel.style().set('shown', true);
    customControlsPanel.style().set('shown', false);
    customChartsPanel.style().set('shown', false);
    drawingTools.setShown(false);
    deltaLegend.style().set('shown', true);
    initLayers();
    updateDeltaLayer();
  } else {
    wsSibControlsPanel.style().set('shown', false);
    customControlsPanel.style().set('shown', true);
    // customChartsPanel показывается только после Run (в runCustomAnalysis)
    drawingTools.setShown(true);
    drawingTools.setShape('polygon');
    deltaLegend.style().set('shown', true);
    customStatus.setValue('Draw a polygon on the map, then press Run.');
    customStatus.style().set('color', TH.textMuted);
  }
});

// ============================================================
// L. Layout
// ============================================================

// ============================================================
// Tab bar — 3 таба: Overview / Charts / Info
// ============================================================

function buildTabButton(name, isActive) {
  return ui.Button({
    label: name,
    style: {
      stretch: 'horizontal', margin: '0',
      // Активный таб — accent цвет, остальные — нейтральные
      color: isActive ? 'white' : TH.textDark,
      backgroundColor: isActive ? TH.accent : TH.bgCard
    }
  });
}

var tabOverview = buildTabButton('Overview', true);
var tabCharts   = buildTabButton('Charts',   false);
var tabInfo     = buildTabButton('Info',     false);

var tabBar = ui.Panel(
  [tabOverview, tabCharts, tabInfo],
  ui.Panel.Layout.flow('horizontal'),
  {margin: '6px 0 8px 0', stretch: 'horizontal',
   border: '1px solid ' + TH.border}
);

// ============================================================
// Tab contents
// ============================================================

// --- Overview: Mode + controls (Mode 1 или Mode 2) ---
var overviewTab = ui.Panel([
  sectionLabel('Mode'),
  card([modeSelect]),
  wsSibControlsPanel,
  customControlsPanel
]);

// --- Charts: 4 asset-chart (Mode 1) + 2 custom-chart (Mode 2) ---
var chartsTab = ui.Panel([
  sectionLabel('Charts'),
  wsChartPanel1, wsChartPanel2, wsChartPanel3, wsChartPanel4,
  customChartsPanel
], null, {shown: false});

// --- Info: disclaimer + about ---
var infoTab = ui.Panel([
  sectionLabel('Limitations'),
  disclaimer,
  sectionLabel('About'),
  aboutPanel
], null, {shown: false});

// --- Tab switching ---
function setActiveTab(name) {
  // Стиль активного таба
  [[tabOverview, 'Overview'],
   [tabCharts,   'Charts'],
   [tabInfo,     'Info']].forEach(function(pair) {
    var btn = pair[0], btnName = pair[1];
    btn.style().set('color',
      (btnName === name) ? 'white' : TH.textDark);
    btn.style().set('backgroundColor',
      (btnName === name) ? TH.accent : TH.bgCard);
  });
  // Видимость контента
  overviewTab.style().set('shown', name === 'Overview');
  chartsTab.style().set('shown',   name === 'Charts');
  infoTab.style().set('shown',     name === 'Info');
}

tabOverview.onClick(function() { setActiveTab('Overview'); });
tabCharts.onClick(function()   { setActiveTab('Charts'); });
tabInfo.onClick(function()     { setActiveTab('Info'); });

// ============================================================
// Left panel
// ============================================================

var leftPanel = ui.Panel({
  widgets: [
    titleLabel, subtitleLabel,
    onboardingPanel,
    tabBar,
    overviewTab,
    chartsTab,
    infoTab
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
