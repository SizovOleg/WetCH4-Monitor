# WetCH4-WS — RNA (Runtime Nucleic Acid)

**Версия:** 1.0
**Дата:** 2026-04-10
**Родительский документ:** DNA.md v1.0

---

## Назначение

RNA переводит инварианты DNA в конкретные проверяемые правила для стека проекта (GEE JavaScript, Python, GitHub). Каждый раздел RNA ссылается на раздел DNA, который он enforce-ит.

---

## 1. Enforcement инвариантов

### DNA §3.1 → «Только аномалии, не абсолютные концентрации»

**Проверка в коде:**
```javascript
// 02_tropomi_anomaly.js ОБЯЗАН содержать вычитание фона.
// Выходной band называется 'delta_ch4', НЕ 'xch4' и НЕ 'ch4'.
// Если в любом модуле используется band 'CH4_column_volume_mixing_ratio_dry_air'
// напрямую для анализа (не для вычисления аномалии) — это нарушение.
```

**Тест:**
```
ASSERT: Модуль 2 выход содержит band 'delta_ch4'
ASSERT: Модуль 2 выход НЕ содержит band с raw XCH₄
ASSERT: Модуль 3 принимает 'delta_ch4', не raw XCH₄
ASSERT: Модуль 4 визуализирует 'delta_ch4' или 'emission_proxy', не raw XCH₄
```

**Чеклист при code review:**
- [ ] В 02_tropomi_anomaly.js есть строка вычисления background
- [ ] background вычисляется с маской болот (wetland_mask == 0)
- [ ] Выходной band назван 'delta_ch4'

---

### DNA §3.2 → «Карта болот первична»

**Проверка в коде:**
```javascript
// 03_emission_proxy.js ОБЯЗАН использовать wetland_mask как предиктор.
// 02_tropomi_anomaly.js ОБЯЗАН использовать wetland_mask для вычисления фона.
// Модуль 3 НЕ запускается без готового Модуля 1.
```

**Тест:**
```
ASSERT: 03_emission_proxy.js импортирует wetland_mask
ASSERT: 02_tropomi_anomaly.js импортирует wetland_mask для background calculation
ASSERT: Если wetland_mask === null → throw Error('Wetland mask required')
```

**Порядок запуска модулей:**
```
1 (wetland_mask) → 2 (tropomi_anomaly, использует маску для фона) → 3 (emission_proxy) → 4 (app)
```
Нарушение порядка = нарушение DNA.

---

### DNA §3.3 → «Калибровка только по опубликованным данным»

**Проверка:**
```
ASSERT: Каждая запись в calibration_all.csv имеет поле 'source' (DOI или ссылка)
ASSERT: calibration/README.md содержит полную библиографию источников
ASSERT: Неопубликованные данные помечены флагом 'unpublished' + имя PI + дата согласия
```

**Файловая структура:**
```
calibration/
├── README.md              # ОБЯЗАТЕЛЬНО: источники, лицензии, цитирование
├── mukhrino_ch4.csv       # source = Dyukarev et al. 2024
├── sabrekov_bc8.csv       # source = Sabrekov et al. 2011, 2013
├── bakchar_ch4.csv        # source = Veretennikova & Dyukarev 2021
└── calibration_all.csv    # объединённый, каждая строка с source
```

**Запрещено:**
- Данные без указания источника
- Данные с устного согласия без фиксации в README

---

### DNA §3.4 → «Честность относительно ограничений»

**Проверка в GEE App (Модуль 4):**
```javascript
// 04_app.js ОБЯЗАН содержать панель 'Limitations' или disclaimer.
// Текст disclaimer включает ВСЕ 4 пункта из DNA §3.4.
```

**Текст для App:**
```
DISCLAIMER:
• TROPOMI measures column-averaged CH₄, not surface flux
• Winter months (Nov–Apr) are excluded due to snow/cloud cover
• Calibration is based on a single station (Mukhrino, 60.9°N)
• TROPOMI pixel (~7 km) does not resolve individual microlandscapes
```

**Проверка в статье:**
- [ ] Раздел Discussion содержит подразделы по каждому из 4 ограничений
- [ ] Abstract НЕ содержит overclaims

---

### DNA §3.5 → «Открытость и воспроизводимость»

**Проверка:**
```
ASSERT: Репозиторий GitHub — public
ASSERT: Все GEE скрипты — в репо (не только в GEE Code Editor)
ASSERT: GEE App URL указан в статье и README
ASSERT: calibration/ данные либо в репо, либо ссылка на Zenodo/DOI
ASSERT: README.md в корне содержит инструкцию воспроизведения (< 10 шагов)
```

**Шаблон README инструкции:**
```markdown
## Reproduction
1. Clone this repository
2. Open `gee/02_tropomi_anomaly.js` in GEE Code Editor
3. Import Geometry from `assets/aoi.geojson`
4. Run → monthly ΔCH₄ maps appear on the map
5. For emission proxy: first run `gee/01_wetland_mask.js`, then `gee/03_emission_proxy.js`
6. For the App: open [URL]
```

---

### DNA §3.6 → «Никаких заявлений о верификации кадастров»

**Запрещённые формулировки** (grep по всем .js, .md, .py):
```
FORBIDDEN: "verify national inventory"
FORBIDDEN: "validate UNFCCC"
FORBIDDEN: "Paris Agreement compliance"
FORBIDDEN: "official emission reporting"
FORBIDDEN: "верификация кадастра"
FORBIDDEN: "проверка отчётности"
```

**Допустимые формулировки:**
```
OK: "research tool for regional CH₄ monitoring"
OK: "independent estimate for model benchmarking"
OK: "complements existing bottom-up inventories"
```

---

## 2. Контракты данных (enforcement)

### Модуль 1 → Модуль 2, 3, 4

```javascript
// wetland_mask: ee.Image
// Bands: ['wetland_type']
// Type: int8
// Values: 0–8 (see CLAUDE.md WETLAND_CLASSES)
// CRS: EPSG:4326
// Scale: 10 m (Sentinel-2 native)

// ТЕСТ: var types = wetland_mask.reduceRegion({
//   reducer: ee.Reducer.frequencyHistogram(),
//   geometry: TEST_AOI, scale: 10, maxPixels: 1e9
// });
// ASSERT: все ключи гистограммы ∈ {0,1,2,3,4,5,6,7,8}
// ASSERT: ключ 0 (non-wetland) > 30% территории
```

### Модуль 2 → Модуль 3, 4

```javascript
// delta_ch4: ee.ImageCollection
// Bands per image: ['delta_ch4']
// Type: float
// Units: ppb
// Properties: 'year' (int), 'month' (int), 'n_observations' (int)
// CRS: EPSG:4326
// Temporal: monthly composites, May–October only

// ТЕСТ: var img = delta_ch4.first();
// ASSERT: img.bandNames().getInfo() содержит 'delta_ch4'
// ASSERT: img.get('year').getInfo() >= 2019
// ASSERT: img.get('month').getInfo() >= 5 && <= 10
// ASSERT: img.get('n_observations').getInfo() > 0
```

### Модуль 3 → Модуль 4

```javascript
// emission_proxy: ee.Image
// Bands: ['emission_proxy', 'uncertainty']
// Type: float
// Units: mgC·m⁻²·h⁻¹
// CRS: EPSG:4326

// ТЕСТ: var stats = emission_proxy.reduceRegion({
//   reducer: ee.Reducer.minMax(), geometry: TEST_AOI, scale: 5000
// });
// ASSERT: emission_proxy_min >= -1 (небольшой отрицательный — допустим)
// ASSERT: emission_proxy_max <= 50 (если больше — выброс)
```

---

## 3. Чеклисты

### Перед коммитом

- [ ] Smoke test на TEST_AOI пройден (без ошибок GEE)
- [ ] Выходные bands соответствуют контракту (имя, тип, единицы)
- [ ] Нет `.getInfo()` в коде App (блокирует UI)
- [ ] Нет magic numbers (все пороги в constants.js)
- [ ] JSDoc на каждой функции
- [ ] Нет нарушений запрещённых формулировок (§3.6)

### Перед публикацией GEE App

- [ ] Disclaimer panel присутствует (§3.4)
- [ ] Все слои загружаются < 10 сек
- [ ] Экспорт работает (CSV и GeoTIFF)
- [ ] URL работает без аккаунта GEE (public app)
- [ ] Версия и дата указаны в App

### Перед подачей статьи

- [ ] Все фигуры воспроизводимы из скриптов в репо
- [ ] calibration/README.md содержит все DOI
- [ ] GitHub repo — public
- [ ] GEE App URL — в Data Availability Statement
- [ ] Ни одна формулировка не нарушает §3.6
- [ ] Все 4 ограничения из §3.4 упомянуты в Discussion
- [ ] Code Availability Statement содержит URL репо

---

## 4. CI-подобные проверки (ручные, до автоматизации)

GEE не имеет CI в классическом смысле. Заменяем ручным протоколом:

### После каждого изменения модуля:

```
1. Открыть изменённый .js в GEE Code Editor
2. Run на TEST_AOI
3. Проверить консоль: нет ошибок, цифры в ожидаемом диапазоне
4. Проверить карту: визуально осмысленная
5. Если модуль 2 или 3 — проверить, что контракт данных не изменился
6. Записать результат в ROADMAP (задача → ✅)
```

### Интеграционный тест (после изменения любого модуля):

```
1. Запустить модули последовательно: 1 → 2 → 3 → 4
2. На TEST_AOI, один месяц (июль 2023)
3. App должен показать:
   - Карту болот (9 цветов)
   - Карту ΔCH₄ (синий-белый-красный)
   - Boxplot ΔCH₄ по типам
4. Время полной загрузки < 30 сек
```

---

## 5. Связь документов

```
DNA.md (инварианты, для человека)
  ↓
RNA.md (enforcement, для агента и разработчика) ← ВЫ ЗДЕСЬ
  ├── CLAUDE.md (контракт с Claude Code)
  ├── Чеклисты (ручные CI)
  └── Контракты данных (схемы между модулями)
  ↓
PROJECT_CARD.md (состояние проекта)
ROADMAP.md (план)
DevPrompt_NN.md (задачи для Claude Code)
  ↓
gee/*.js (код)
```

---

## Версионирование

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-04-10 | Первичная формализация |
