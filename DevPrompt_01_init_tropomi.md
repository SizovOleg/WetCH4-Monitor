# DevPrompt 01: Инициализация + TROPOMI месячные композиты

## Контекст

Проект: WetCH4-WS — мониторинг эмиссии CH₄ из болот Западной Сибири
Репо: wetch4-ws (создать)
Платформа: Google Earth Engine (JavaScript API)
Документация: DNA.md, RNA.md, CLAUDE.md, PROJECT_CARD.md, ROADMAP.md — положить в корень

## Задача

Создать структуру проекта и первый модуль: месячные композиты TROPOMI XCH₄ над Западной Сибирью.

## Шаг 1: Структура

Создай директории как в CLAUDE.md. Положи все .md документы в корень.

## Шаг 2: gee/lib/constants.js

```javascript
var FULL_AOI = ee.Geometry.Rectangle([60, 55, 85, 68]);
var TEST_AOI = ee.Geometry.Rectangle([68.0, 60.5, 69.5, 61.3]); // Мухрино

var START_DATE = '2019-05-01';
var END_DATE = '2025-10-31';
var SUMMER_MONTHS = [5, 6, 7, 8, 9, 10];

// TROPOMI qa threshold (GEE хранит validity 0–100)
var QA_THRESHOLD = 50;

// Sentinel-2
var CLOUD_THRESHOLD = 20;

var WETLAND_CLASSES = {
  0: 'non_wetland', 1: 'palsas', 2: 'ryams', 3: 'ridges',
  4: 'olig_hollows', 5: 'meso_hollows', 6: 'eutr_hollows',
  7: 'peat_mats', 8: 'ponds'
};

// Мухрино station
var MUKHRINO = ee.Geometry.Point([68.682, 60.892]);
```

## Шаг 3: gee/02_tropomi_monthly.js

Алгоритм:

1. Загрузить `ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_CH4')`
2. Отфильтровать по AOI и датам (START_DATE — END_DATE)
3. Band: `CH4_column_volume_mixing_ratio_dry_air`
4. Маска: `CH4_column_volume_mixing_ratio_dry_air_validity > QA_THRESHOLD`
5. Для каждого года и месяца (май–октябрь):
   - Отфильтровать коллекцию по году и месяцу
   - Вычислить медиану → месячный композит
   - Посчитать количество валидных наблюдений (.count())
   - Записать properties: year, month, n_obs
6. Собрать в ee.ImageCollection

Функции для `lib/utils.js`:
```javascript
/**
 * Создаёт месячный композит XCH₄
 * @param {ee.ImageCollection} collection - отфильтрованная TROPOMI коллекция
 * @param {number} year
 * @param {number} month
 * @return {ee.Image} с band 'xch4' и properties year, month, n_obs
 */
function makeMonthlyComposite(collection, year, month) { ... }
```

## Шаг 4: Визуализация и smoke test

В конце скрипта:

```javascript
// Визуализация: июль 2023
var jul2023 = monthlyCollection
  .filter(ee.Filter.eq('year', 2023))
  .filter(ee.Filter.eq('month', 7))
  .first();

Map.centerObject(TEST_AOI, 9);
Map.addLayer(jul2023, {
  bands: ['xch4'],
  min: 1870, max: 1920,
  palette: ['blue', 'cyan', 'green', 'yellow', 'red']
}, 'XCH₄ July 2023');

// Статистика
print('July 2023 stats:', jul2023.reduceRegion({
  reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), '', true)
                          .combine(ee.Reducer.count(), '', true),
  geometry: TEST_AOI,
  scale: 7000,
  maxPixels: 1e9
}));

// Таймсерия: средний XCH₄ по годам
var chart = ui.Chart.image.series({
  imageCollection: monthlyCollection.select('xch4'),
  region: TEST_AOI,
  reducer: ee.Reducer.mean(),
  scale: 7000
}).setOptions({title: 'Mean XCH₄ over Mukhrino region'});
print(chart);

// Покрытие: n_obs по месяцам
print('Collection size:', monthlyCollection.size());
print('First image properties:', monthlyCollection.first().toDictionary());
```

## Контракт выхода

```
ee.ImageCollection
  Band: 'xch4' (float, ppb)
  Properties per image:
    'year': int (2019–2025)
    'month': int (5–10)
    'n_obs': int
```

## Ожидаемые результаты

- XCH₄ ~ 1870–1920 ppb над ЗС (глобальный фон ~1920 ppb в 2023)
- Сезонный ход: минимум май, максимум август–сентябрь
- Пространственный градиент: выше над болотами, ниже над лесами (пока без маски — просто визуально)
- n_obs ~ 3–15 наблюдений на пиксель за месяц (зависит от облачности)

## Тест успешности

1. Скрипт запускается без ошибок
2. Карта показывает пространственную структуру XCH₄ (не однородный цвет)
3. Таймсерия показывает сезонный ход
4. Значения в диапазоне 1850–1950 ppb
5. Collection size = ~42 (7 лет × 6 месяцев)

## Чего НЕ делать

- Не вычислять enhancement (это Модуль 3)
- Не загружать Sentinel-2 (это Модуль 1)
- Не использовать .getInfo() для вычислений
- Не фильтровать по land cover (пока без маски)
