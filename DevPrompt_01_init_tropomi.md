# DevPrompt 01: Инициализация проекта + TROPOMI anomaly prototype

## Контекст

Проект: WetCH4-WS — мониторинг эмиссии CH₄ из болот Западной Сибири
Репо: wetch4-ws (создать)
Платформа: Google Earth Engine (JavaScript API)
Документация: DNA.md, CLAUDE.md, PROJECT_CARD.md — уже в корне

## Задача

Создать структуру проекта и первый рабочий модуль: TROPOMI monthly CH₄ anomaly map.

## Что сделать

### Шаг 1: Структура

Создай структуру директорий как в CLAUDE.md. Положи DNA.md, CLAUDE.md, PROJECT_CARD.md в корень.

### Шаг 2: constants.js

```javascript
// gee/lib/constants.js

// Территория: Западно-Сибирская низменность
var FULL_AOI = ee.Geometry.Rectangle([60, 55, 85, 68]);
var TEST_AOI = ee.Geometry.Rectangle([68.0, 60.5, 69.5, 61.3]); // Мухрино

// Временные параметры
var START_DATE = '2019-05-01';
var END_DATE = '2025-10-31';
var SUMMER_MONTHS = [5, 6, 7, 8, 9, 10]; // май–октябрь

// TROPOMI
var QA_THRESHOLD = 0.5;
var BACKGROUND_WINDOW_KM = 200;

// Sentinel-2
var CLOUD_THRESHOLD = 20;

// Классы микроландшафтов
var WETLAND_CLASSES = {
  0: 'non-wetland',
  1: 'palsas',
  2: 'ryams',
  3: 'ridges',
  4: 'oligotrophic_hollows',
  5: 'mesotrophic_hollows',
  6: 'eutrophic_hollows',
  7: 'peat_mats',
  8: 'ponds'
};
```

### Шаг 3: 02_tropomi_anomaly.js

Алгоритм:

1. Загрузить `COPERNICUS/S5P/OFFL/L3_CH4`
2. Отфильтровать по AOI и датам
3. Выбрать band `CH4_column_volume_mixing_ratio_dry_air`
4. Маскировать по `CH4_column_volume_mixing_ratio_dry_air_validity > QA_THRESHOLD * 100`
5. Агрегировать в месячные композиты (медиана)
6. Для каждого месячного композита:
   - Вычислить фон: `focal_median` с kernel = ee.Kernel.circle(BACKGROUND_WINDOW_KM * 1000, 'meters')
   - ΔCH₄ = composite - background
7. Возвращать ee.ImageCollection с band 'delta_ch4' и properties year, month, n_observations

### Контракт выхода

```
ee.ImageCollection
  Band: 'delta_ch4' (float, ppb)
  Properties per image:
    'year': int (2019–2025)
    'month': int (5–10)
    'n_observations': int (сколько валидных пикселей в месяце)
```

### Шаг 4: Smoke test

Запустить на TEST_AOI, июль 2023. Вывести:
- `print('Mean ΔCH₄:', delta_image.reduceRegion(...))`
- `Map.addLayer(delta_image, {min: -20, max: 40, palette: ['blue','white','red']}, 'ΔCH₄ Jul 2023')`

Ожидаемый результат: положительные аномалии 5–30 ppb над болотными массивами, около нуля над лесами и реками.

## Чего НЕ делать

- Не использовать NRTI (Near Real-Time) — только OFFL
- Не фильтровать зимние месяцы здесь — это делается при анализе
- Не применять .reproject() без необходимости
- Не использовать .getInfo() — всё через серверные вычисления

## Тест успешности

1. Скрипт запускается без ошибок в GEE Code Editor
2. На карте видна осмысленная пространственная структура ΔCH₄
3. Значения ΔCH₄ в диапазоне −30…+60 ppb (если за пределами — баг)
4. Над районом Мухрино (60.9°N, 68.7°E) аномалия положительная летом
