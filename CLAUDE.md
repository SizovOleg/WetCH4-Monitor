# CLAUDE.md — WetCH4-WS

## Проект

Мониторинг эмиссии CH₄ из болот Западной Сибири по данным TROPOMI.
Три ключевых показателя: XCH₄, температура, NDVI.
Платформа: Google Earth Engine JavaScript API.

## Прочитай перед работой

1. `DNA.md` v2.1 — инварианты
2. `RNA.md` — enforcement, контракты, чеклисты
3. `PROJECT_CARD.md` — текущее состояние
4. Этот файл — правила кодирования

## Пайплайн (последовательность разработки)

```
1. TROPOMI XCH₄ → фильтрация → месячные композиты → агрегация по AOI
2. Карта болот (Sentinel-2 + RF) → маска + типология
3. Интеграция: XCH₄ по болотам vs по лесам → enhancement
4. Три показателя вместе: XCH₄ + T_air + NDVI → пространственно-временной паттерн
5. Валидация по наземным (Мухрино, Sabrekov, ZOTTO)
6. Оценка абсолютной эмиссии (transfer function)
7. GEE App
```

Каждый этап — отдельный модуль. Не забегать вперёд.

## Структура проекта

```
wetch4-ws/
├── DNA.md
├── RNA.md
├── CLAUDE.md
├── PROJECT_CARD.md
├── ROADMAP.md
├── gee/
│   ├── 01_wetland_mask.js        # Карта болот
│   ├── 02_tropomi_monthly.js     # TROPOMI → месячные композиты
│   ├── 03_enhancement.js         # XCH₄ болота vs леса
│   ├── 04_three_variables.js     # CH₄ + T_air + NDVI
│   ├── 05_validation.js          # Сопоставление с наземными
│   ├── 06_emission_estimate.js   # Transfer function → flux
│   ├── 07_app.js                 # GEE App
│   └── lib/
│       ├── constants.js
│       ├── palettes.js
│       └── utils.js
├── calibration/
│   ├── mukhrino_ch4.csv
│   ├── sabrekov_bc8.csv
│   ├── bakchar_ch4.csv
│   └── README.md
├── paper/
│   ├── figures/
│   └── outline.md
└── screenshots/
```

## Контракты данных

```
Модуль 1 (wetland_mask) → ee.Image
  Bands: ['wetland_type'], int8, 0–8
  0=не болото, 1=palsas, 2=ryams, 3=ridges,
  4=olig_hollows, 5=meso_hollows, 6=eutr_hollows,
  7=peat_mats, 8=ponds

Модуль 2 (tropomi_monthly) → ee.ImageCollection
  Bands: ['xch4'], float, ppb
  Properties: 'year' (int), 'month' (int), 'n_obs' (int)
  Покрытие: май–октябрь, 2019–present

Модуль 3 (enhancement) → ee.FeatureCollection (таблица) + ee.ImageCollection
  Таблица: year, month, xch4_wetland, xch4_forest, delta_ch4
  Карта: band 'delta_ch4' = xch4 − background (по не-болотным пикселям)

Модуль 4 (three_variables) → ee.ImageCollection
  Bands: ['xch4', 'delta_ch4', 't_air', 'ndvi']
  Properties: year, month

Модуль 5 (validation) → ee.FeatureCollection
  station, date, tropomi_xch4, ground_flux, t_air, ndvi

Модуль 6 (emission_estimate) → ee.Image + числа
  band 'flux_estimate', единицы мг CH₄·м⁻²·ч⁻¹
  + суммарная эмиссия Тг/год

Модуль 7 (app) — визуализация модулей 1–6
```

## Правила кодирования

1. Один .js = один модуль. Общие функции в `lib/`.
2. Константы только в `constants.js`.
3. JSDoc на каждой функции.
4. camelCase переменные, UPPER_SNAKE константы.
5. TROPOMI: фильтр `CH4_column_volume_mixing_ratio_dry_air_validity > 50`.
6. Sentinel-2: `CLOUDY_PIXEL_PERCENTAGE < 20`.
7. Не использовать `.getInfo()` в App-коде.
8. Не использовать `.reproject()` без необходимости.
9. Smoke test каждого модуля: TEST_AOI (Мухрино), один месяц, < 60 сек.

## Ключевые решения

1. **Месячные композиты — медиана**, не среднее (устойчивость к выбросам).
2. **Фон = XCH₄ по не-болотным пикселям** в окне ~200 км. Маска из Модуля 1.
3. **Относительный вклад** (болота − леса) — первый и самый надёжный результат.
4. **Абсолютный вклад** — через transfer function по наземным данным, второй этап.
5. **Зима исключена** (ноябрь–апрель). Основная эмиссия летняя.

## Чего НЕ делать

- Не интерпретировать XCH₄ как surface flux напрямую
- Не забегать к моделированию до работающего TROPOMI пайплайна
- Не вносить изменения в DNA.md
- Не коммитить без smoke test
- Не использовать Sentinel-2 для «детекции метана»

## Источники данных

```
TROPOMI:    COPERNICUS/S5P/OFFL/L3_CH4           2019-02 — present
Sentinel-2: COPERNICUS/S2_SR_HARMONIZED           2019 — present
ERA5:       ECMWF/ERA5_LAND/DAILY_AGGR            2019 — present
MODIS NDVI: MODIS/061/MOD13A2                     2019 — present
JRC Water:  JRC/GSW1_4/GlobalSurfaceWater          static
Мухрино:    Zenodo doi:10.5281/zenodo.4323024      2010–2019
Мухрино CH₄: Dyukarev et al. 2024, EDGCC 15(4)   2023
Камеры ЗС:  Sabrekov et al. 2011, 2013            2007–2010
ZOTTO:      Winderlich et al. 2014, BG 11          2009–2011
```
