# CLAUDE.md — WetCH4-WS

## Проект

Региональный инструмент мониторинга эмиссии метана из болот Западной Сибири.
Платформа: Google Earth Engine (JavaScript API). Выход: GEE App + data paper.

## Прочитай перед работой

1. `DNA.md` — инварианты проекта. Не нарушай.
2. `PROJECT_CARD.md` — текущее состояние, архитектура, план.
3. Этот файл — правила для тебя.

## Стек

- **Основной:** Google Earth Engine JavaScript API
- **Классификация:** GEE встроенный ee.Classifier.smileRandomForest
- **Данные:** COPERNICUS/S5P/OFFL/L3_CH4, COPERNICUS/S2_SR_HARMONIZED, ECMWF/ERA5_LAND, JRC/GSW1_4/GlobalSurfaceWater
- **Визуализация:** GEE App (ui.Map, ui.Panel, ui.Chart)
- **Экспорт:** ee.Export.image.toDrive, ee.Export.table.toDrive
- **Локальная обработка (при необходимости):** Python 3.11+, geemap, pandas

## Структура проекта

```
wetch4-ws/
├── DNA.md                    # Инварианты (не трогать)
├── CLAUDE.md                 # Этот файл
├── PROJECT_CARD.md           # Проектная карта
├── gee/
│   ├── 01_wetland_mask.js    # Модуль 1: Карта болот с типологией
│   ├── 02_tropomi_anomaly.js # Модуль 2: TROPOMI CH₄ аномалии
│   ├── 03_emission_proxy.js  # Модуль 3: Модель proxy-эмиссии
│   ├── 04_app.js             # Модуль 4: GEE App
│   └── lib/
│       ├── constants.js      # Константы: AOI, даты, пороги qa
│       ├── palettes.js       # Цветовые палитры
│       └── utils.js          # Утилитарные функции
├── calibration/
│   ├── mukhrino_ch4.csv      # Данные CH₄ Мухрино (из публикаций)
│   ├── mukhrino_meteo.csv    # Метеоданные (Zenodo subset)
│   ├── sabrekov_bc8.csv      # Камерные данные Sabrekov et al.
│   ├── bakchar_ch4.csv       # Данные Бакчар (Veretennikova & Dyukarev 2021)
│   ├── zotto_ch4.csv         # Данные ZOTTO (если получены)
│   ├── calibration_all.csv   # Объединённый набор (каждая строка с source)
│   └── README.md             # Источники, лицензии, цитирование
├── validation/
│   └── accuracy_assessment.js # Оценка точности карты болот
├── paper/
│   ├── figures/              # Рисунки для статьи
│   └── outline.md            # Структура статьи
└── screenshots/              # Визуальная галерея
```

## Правила кодирования

### GEE JavaScript

1. **Модульность.** Каждый .js файл — один модуль с чёткими входами/выходами. Общие функции — в `lib/`.
2. **Константы.** AOI, временные диапазоны, пороги — только в `constants.js`. Никаких magic numbers.
3. **Комментарии.** Каждая функция — JSDoc с описанием, @param, @return. На английском.
4. **Naming.** camelCase для переменных и функций. UPPER_SNAKE для констант. Осмысленные имена: `monthlyComposite`, не `mc`.
5. **Фильтрация.** TROPOMI: `qa_value > 0.5` всегда. Sentinel-2: `CLOUDY_PIXEL_PERCENTAGE < 20`.
6. **Масштаб вычислений.** Использовать `.reproject()` осознанно — только когда необходимо для корректности, не для красоты. GEE сам оптимизирует масштаб.

### Контракты данных между модулями

```
Модуль 1 (wetland_mask) → ee.Image, bands: ['wetland_type'], int8, значения 0-8
  0 = не болото
  1 = palsas, 2 = ryams, 3 = ridges
  4 = oligotrophic hollows, 5 = mesotrophic hollows
  6 = eutrophic hollows, 7 = peat mats, 8 = ponds

Модуль 2 (tropomi_anomaly) → ee.ImageCollection, band: ['delta_ch4'], float
  Единицы: ppb (parts per billion)
  Временное разрешение: месяц
  Система свойств: 'year', 'month', 'n_observations'

Модуль 3 (emission_proxy) → ee.Image, band: ['emission_proxy'], float
  Единицы: mgC·m⁻²·h⁻¹ (для совместимости с камерными данными)
  + band 'uncertainty' (float, ±1σ)

Модуль 4 (app) — потребляет выходы модулей 1, 2, 3.
  Не модифицирует данные, только визуализирует.
```

### Тестирование

- **Smoke test для каждого модуля:** запуск на малом AOI (100×100 км вокруг Мухрино), один месяц (июль 2023). Должен отработать без ошибок за < 60 секунд.
- **Валидация карты болот:** confusion matrix по 200+ точкам (VHR или полевые).
- **Валидация модели:** scatter plot predicted vs observed CH₄ по станциям.
- **Интеграционный тест:** все 4 модуля последовательно на полном AOI, один год. Результат — непустая карта с осмысленными значениями.

## Ключевые решения (из DNA)

1. **Аномалии, не абсолютные значения.** ΔCH₄ = XCH₄_obs − XCH₄_background. Фон = медиана по окну 200×200 км с исключением болотных пикселей.
2. **Субпиксельная декомпозиция.** Для каждого пикселя TROPOMI вычисляем долю каждого типа микроландшафта из карты болот Модуля 1.
3. **Калибровка из публикаций.** Табличные данные из Dyukarev et al. 2024, Sabrekov et al. 2011/2013.
4. **Месячные композиты.** Медиана XCH₄ за месяц, не среднее (устойчивость к выбросам).
5. **Никаких зимних данных.** Ноябрь–апрель исключены. Это не ограничение — основная эмиссия летняя.

## Чего НЕ делать

- Не интерпретировать XCH₄ как поверхностный поток напрямую
- Не использовать Sentinel-2 MSI для детекции метана (это псевдонаука)
- Не заявлять точность лучше, чем есть
- Не вносить изменения в DNA.md
- Не коммитить без smoke test
- Не использовать `.getInfo()` в GEE-коде для App (блокирует UI)

## Источники данных: как цитировать

```
TROPOMI: Copernicus Sentinel-5P (processed by ESA), 2019–present
Sentinel-2: Copernicus Sentinel-2 (processed by ESA), 2019–present
ERA5-Land: Muñoz Sabater, J., (2019): ERA5-Land, Copernicus Climate Data Store
Мухрино метео: Dyukarev et al. (2020), Zenodo, doi:10.5281/zenodo.4323024
Мухрино CH₄: Dyukarev et al. (2024), EDGCC, Vol.15 No.4
Камерные данные ЗС: Sabrekov et al. (2011, 2013), Glagolev et al. (2011)
ZOTTO: Winderlich et al. (2014), Biogeosciences, 11, 2055–2068
```
