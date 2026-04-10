# WetCH4-WS — ROADMAP

**Версия:** 1.0
**Дата:** 2026-04-10
**Статус:** Старт Фазы 1A

---

## Обзор фаз

```
Фаза 1: Фундамент (3–4 недели)
  ├── 1A: Инфраструктура + TROPOMI прототип
  ├── 1B: Карта болот (прототип на Мухрино)
  └── 1C: Интеграция двух слоёв

Фаза 2: Модель (3–4 недели)
  ├── 2A: Сбор калибровочных данных
  ├── 2B: RF-модель proxy-эмиссии
  └── 2C: Валидация

Фаза 3: Продукт (3–4 недели)
  ├── 3A: Масштабирование на полный AOI
  ├── 3B: GEE App
  └── 3C: Data export pipeline

Фаза 4: Публикация (4–6 недель)
  ├── 4A: Фигуры и таблицы
  ├── 4B: Текст статьи
  └── 4C: Подача + ревизия

Фаза 5: Расширение (future)
```

---

## Фаза 1: Фундамент

**Цель:** Два базовых слоя данных работают и визуализируются совместно.

### 1A: Инфраструктура + TROPOMI прототип

| # | Задача | Вход | Выход | Критерий готовности |
|---|--------|------|-------|---------------------|
| 1 | Создать репо, структуру директорий | DNA.md, CLAUDE.md, PROJECT_CARD.md | GitHub repo wetch4-ws | `git clone` работает |
| 2 | constants.js | — | AOI, пороги, классы | Файл без ошибок в GEE |
| 3 | 02_tropomi_anomaly.js | COPERNICUS/S5P/OFFL/L3_CH4 | ee.ImageCollection delta_ch4 | Карта ΔCH₄ июль 2023, TEST_AOI |
| 4 | Smoke test TROPOMI | Модуль 2 | Скриншот + цифры mean/max | ΔCH₄ = 5–30 ppb над болотами |

**DevPrompt:** DevPrompt_01_init_tropomi.md (готов)
**Длительность:** 3–5 дней

### 1B: Карта болот (прототип)

| # | Задача | Вход | Выход | Критерий готовности |
|---|--------|------|-------|---------------------|
| 5 | Обучающая выборка для болот | VHR/полевые данные Мухрино | FeatureCollection ≥ 200 точек | ≥ 30 точек на класс |
| 6 | 01_wetland_mask.js | Sentinel-2 + выборка | ee.Image wetland_type (0–8) | Классификация TEST_AOI |
| 7 | Accuracy assessment | Модуль 1 + тест-выборка | Confusion matrix | OA ≥ 85%, Kappa ≥ 0.75 |
| 8 | Визуальная верификация | Карта на VHR-подложке | Скриншот | Типы болот пространственно осмысленны |

**DevPrompt:** DevPrompt_02 (напишу после завершения 1A)
**Длительность:** 7–10 дней
**Критический путь:** Обучающая выборка. Источники:
- Карта микроландшафтов Мухрино (Dyukarev et al. 2021, Fig. A2 — surface-type classification)
- Полевой опыт автора (типы болот ЗС)
- BAWLD как стартовый фрейм для экстраполяции
- Google Earth VHR для визуальной разметки

### 1C: Интеграция

| # | Задача | Вход | Выход | Критерий готовности |
|---|--------|------|-------|---------------------|
| 9 | Наложение ΔCH₄ на карту болот | Модули 1 + 2 | Два слоя на одной карте | Визуально пространственная связь |
| 10 | Субпиксельная декомпозиция | wetland_mask в масштабе TROPOMI | Доля каждого типа на пиксель | ee.Image с bands frac_1…frac_8 |
| 11 | Boxplot ΔCH₄ vs тип болота | Модули 1 + 2 | ui.Chart или export CSV | Мочажины > гряды > рямы |

**DevPrompt:** DevPrompt_03
**Длительность:** 3–5 дней
**Milestone 1:** Карта ΔCH₄ с типологической подложкой болот работает в GEE.

---

## Фаза 2: Модель

**Цель:** Калиброванная RF-модель связывает ΔCH₄ с предикторами поверхности.

### 2A: Сбор калибровочных данных

| # | Задача | Вход | Выход | Критерий готовности |
|---|--------|------|-------|---------------------|
| 12 | Извлечь CH₄ из Dyukarev et al. 2024 | Статья EDGCC Vol.15 No.4 | mukhrino_ch4.csv | lat, lon, type, ch4_flux, date, source |
| 13 | Извлечь CH₄ из Sabrekov et al. 2011, 2013 | Статьи | sabrekov_bc8.csv | То же + zone (тайга) |
| 14 | Извлечь CH₄ из Veretennikova & Dyukarev 2021 | Статья BER | bakchar_ch4.csv | То же |
| 15 | Подготовить метео Мухрино | Zenodo 4323024 | mukhrino_meteo.csv (subset) | T, P, RH, PAR, WTL, совпадение по датам с CH₄ |
| 16 | Объединить в calibration dataset | CSV 12–15 | calibration_all.csv | ≥ 30 точек с координатами и потоками |
| 17 | Загрузить как GEE asset | calibration_all.csv | ee.FeatureCollection | Asset доступен |

**Длительность:** 5–7 дней (ручная работа — извлечение из таблиц/графиков статей)

### 2B: RF-модель proxy-эмиссии

| # | Задача | Вход | Выход | Критерий готовности |
|---|--------|------|-------|---------------------|
| 18 | Извлечь предикторы для точек калибровки | ERA5-Land, MODIS, JRC, Модуль 1 | training_features.csv | 6–8 предикторов на точку |
| 19 | 03_emission_proxy.js | Предикторы + ΔCH₄ | ee.Classifier RF | Модель обучается без ошибок |
| 20 | Feature importance | RF model | Ранжирование предикторов | T_soil и wetland_type в топ-3 |
| 21 | Применить к территории | Модель + предикторы | ee.Image emission_proxy | Карта proxy-эмиссии, TEST_AOI |

**DevPrompt:** DevPrompt_04
**Длительность:** 5–7 дней

### 2C: Валидация

| # | Задача | Вход | Выход | Критерий готовности |
|---|--------|------|-------|---------------------|
| 22 | LOOCV | Модель + данные | R², RMSE, MAE | R² ≥ 0.4 |
| 23 | Scatter plot pred vs obs | LOOCV результаты | Фигура | Точки вдоль 1:1 линии |
| 24 | Сезонная динамика | Модель за май–октябрь | Таймсерия | Пик июль–август |
| 25 | Сравнение с WetCH4 | WetCH4 dataset + наша модель | Таблица | Разница < 50% по региону |

**Длительность:** 5–7 дней
**Milestone 2:** Модель с R² ≥ 0.4, scatter plot, сравнение с WetCH4.

---

## Фаза 3: Продукт

**Цель:** Работающий GEE App + экспорт данных.

### 3A: Масштабирование

| # | Задача | Вход | Выход | Критерий готовности |
|---|--------|------|-------|---------------------|
| 26 | Карта болот на полный AOI | Модуль 1 + расширенная выборка | wetland_mask 55–68°N, 60–85°E | Классификация завершается за < 1 час |
| 27 | TROPOMI anomaly 2019–2025 | Модуль 2, полный период | ee.ImageCollection ~42 мес. | Все месяцы без пробелов |
| 28 | Emission proxy полный AOI | Модуль 3 | Годовые карты proxy | 7 карт (2019–2025) |

### 3B: GEE App

| # | Задача | Вход | Выход | Критерий готовности |
|---|--------|------|-------|---------------------|
| 29 | UI layout | Макет (набросок) | ui.Panel + ui.Map | Два панели: карта + controls |
| 30 | Слайдер времени | ee.ImageCollection | ui.DateSlider | Переключение месяцев < 3 сек |
| 31 | Слой карты болот | wetland_mask | Переключаемый слой | Вкл/выкл checkbox |
| 32 | Chart: ΔCH₄ по типам | Модули 1+2 | ui.Chart | Boxplot обновляется при смене месяца |
| 33 | Chart: таймсерия | Модуль 2 | ui.Chart | Линия mean ΔCH₄ с confidence band |
| 34 | Экспорт | Пользовательский AOI + период | CSV / GeoTIFF | Кнопка Export → Drive |
| 35 | Публикация App | 04_app.js | URL приложения | Открывается без аккаунта GEE |

**DevPrompt:** DevPrompt_05, DevPrompt_06
**Длительность:** 7–10 дней
**Milestone 3:** GEE App работает, URL доступен.

### 3C: Data export

| # | Задача | Вход | Выход | Критерий готовности |
|---|--------|------|-------|---------------------|
| 36 | Экспорт карты болот | wetland_mask | GeoTIFF на Drive | Файл < 500 MB |
| 37 | Экспорт ΔCH₄ серии | ee.ImageCollection | Multi-band GeoTIFF | Один файл на год |
| 38 | README для данных | Метаданные | calibration/README.md | Источники, лицензии, цитирование |

---

## Фаза 4: Публикация

**Цель:** Статья принята в рецензируемый журнал.

### Целевой журнал

**Приоритет 1:** Remote Sensing of Environment (IF ~13)
- Плюсы: высокий импакт, инструментальные статьи приветствуются
- Минусы: конкуренция, долгий review

**Приоритет 2:** Biogeosciences (IF ~4.9, Copernicus, OA)
- Плюсы: open access, быстрый review, аудитория — углеродный цикл
- Минусы: ниже импакт

**Приоритет 3:** Earth System Science Data (IF ~11, Copernicus, OA)
- Плюсы: data paper формат идеален для инструмента + dataset
- Минусы: нужен dataset на Zenodo

### 4A: Фигуры

| # | Фигура | Что показывает |
|---|--------|---------------|
| F1 | Study area map | AOI, зоны тайги, калибровочные станции |
| F2 | Workflow diagram | Модули 1–4, потоки данных |
| F3 | Wetland map | Фрагмент карты болот на VHR-подложке |
| F4 | ΔCH₄ spatial pattern | Карта аномалий июль, full AOI |
| F5 | ΔCH₄ by wetland type | Boxplot по 8 типам микроландшафтов |
| F6 | Seasonal dynamics | Таймсерия ΔCH₄ по месяцам, 2019–2025 |
| F7 | Model validation | Scatter plot pred vs obs + 1:1 line |
| F8 | Feature importance | Bar chart предикторов |
| F9 | Comparison with WetCH4 | Карта наша vs WetCH4, разница |
| F10 | GEE App screenshot | Интерфейс приложения |

### 4B: Структура статьи

```
1. Introduction
   - Wetlands as CH₄ source, global uncertainty
   - Western Siberia: largest pristine peatland, underrepresented in models
   - Gap: no regional monitoring tool, WetCH4 calls for WSL expansion
   - Objective: build and validate GEE-based tool

2. Study area
   - WSL geography, climate, zonality
   - Peatland typology (Bc8 model)
   - Calibration sites: Mukhrino, Bakchar, ZOTTO

3. Data and methods
   3.1 TROPOMI XCH₄ preprocessing
   3.2 Background removal and anomaly calculation
   3.3 Wetland classification (Sentinel-2 + RF)
   3.4 Predictor variables (ERA5-Land, MODIS, JRC)
   3.5 Random Forest emission proxy model
   3.6 Calibration data from published studies
   3.7 Validation approach (LOOCV)

4. Results
   4.1 Wetland map accuracy
   4.2 Spatial patterns of ΔCH₄
   4.3 ΔCH₄ by wetland type
   4.4 Seasonal dynamics
   4.5 Emission proxy model performance
   4.6 Comparison with WetCH4 and bottom-up estimates

5. Discussion
   5.1 What the typological map adds
   5.2 Limitations of TROPOMI for wetland CH₄
   5.3 Single-station calibration bias
   5.4 Implications for WSL methane budget
   5.5 Comparison with Glagolev et al. (2011) Bc8 estimate

6. The GEE tool
   6.1 App description and access
   6.2 Reproducibility

7. Conclusions

Data availability statement
Code availability statement
```

### 4C: Подача

| Задача | Длительность |
|--------|-------------|
| Драфт | 2 недели |
| Внутреннее ревью (Claude peer-review) | 3 дня |
| Оформление по требованиям журнала | 3 дня |
| Cover letter | 1 день |
| Подача | 1 день |
| Ревизия после рецензии | 2–4 недели |

---

## Фаза 5: Расширение (future, не планируется детально)

| Направление | Что даёт | Зависимость |
|-------------|----------|-------------|
| EC CH₄ Мухрино (запрос PI) | Прямая калибровка column → flux | Согласие Дюкарева/Лапшиной |
| ZOTTO-bog EC | Вторая точка калибровки на 60°N | Согласие MPI-BGC Jena |
| GOSAT XCH₄ | Независимая валидация TROPOMI | Данные в GEE (есть) |
| MethaneSAT | Высокое разрешение для валидации | Данные появятся 2026–2027 |
| Расширение AOI на ЯНАО | Северная тайга + лесотундра | Обучающая выборка для северных болот |
| Interannual trend analysis | Тренд эмиссии 2019–2030 | Накопление данных |

---

## Риски

| Риск | Вероятность | Последствие | Митигация |
|------|------------|-------------|-----------|
| TROPOMI ΔCH₄ не показывает связь с болотами | Средняя | Модель не работает | Проверить на Фазе 1C через boxplot; если нет связи — проект останавливается |
| Обучающая выборка для болот недостаточна | Средняя | OA < 85% | Использовать BAWLD + VHR visual interpretation |
| R² модели < 0.3 | Средняя | Статья слабая | Честно указать; сместить фокус на карту болот + anomaly mapping |
| GEE compute limits | Низкая | Не масштабируется | tileScale, уменьшение AOI, chunking |
| Данные Мухрино EC не получены | Низкая | Нет прямой калибровки EC | Работаем с камерными данными из публикаций (достаточно для MVP) |

---

## Хронология (оптимистичная)

```
Апрель 2026
  Неделя 2: Фаза 1A (репо + TROPOMI)
  Неделя 3–4: Фаза 1B (карта болот)

Май 2026
  Неделя 1: Фаза 1C (интеграция)
  Неделя 2–3: Фаза 2A–2B (данные + модель)
  Неделя 4: Фаза 2C (валидация)

Июнь 2026
  Неделя 1–2: Фаза 3A–3B (масштабирование + App)
  Неделя 3–4: Фаза 4A (фигуры)

Июль 2026
  Неделя 1–3: Фаза 4B (текст)
  Неделя 4: Фаза 4C (подача)
```

**Общий срок до подачи: ~3.5 месяца.**

---

## Версионирование

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-04-10 | Первичная формализация |
