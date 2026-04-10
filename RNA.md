# WetCH4-WS — RNA

**Версия:** 2.0
**Дата:** 2026-04-10
**Родительский документ:** DNA.md v2.1

---

## 1. Enforcement инвариантов

### DNA §3.1 → TROPOMI — центральный инструмент

**Порядок модулей строгий:**
```
02_tropomi_monthly.js → работает без Модуля 1 (первый запуск)
01_wetland_mask.js    → работает независимо
03_enhancement.js     → требует Модули 1 + 2
04_three_variables.js → требует Модуль 3 + ERA5 + MODIS
05_validation.js      → требует Модуль 4 + наземные данные
06_emission_estimate.js → требует Модуль 5
07_app.js             → потребляет всё
```

**Тест:**
```
ASSERT: 02_tropomi_monthly.js запускается без wetland_mask
ASSERT: 03_enhancement.js выбрасывает ошибку без wetland_mask
ASSERT: Ни один модуль не вызывает модуль с бо́льшим номером
```

---

### DNA §3.2 → Карта болот первична для атрибуции

**Проверка:**
```
ASSERT: 03_enhancement.js использует wetland_mask для разделения болота/леса
ASSERT: background вычисляется по пикселям wetland_type == 0
ASSERT: Агрегация XCH₄ проводится отдельно для wetland_type > 0 и wetland_type == 0
```

**Чеклист:**
- [ ] Фон = median XCH₄ по не-болотным пикселям (wetland_type == 0)
- [ ] Enhancement = XCH₄_wetland − XCH₄_forest
- [ ] Boxplot XCH₄ строится отдельно для каждого wetland_type

---

### DNA §3.3 → Наземные данные для валидации

**Проверка:**
```
ASSERT: Модули 02–04 НЕ используют наземные данные
ASSERT: Наземные данные появляются только в Модуле 05 (validation)
ASSERT: Модуль 06 использует наземные для transfer function, НЕ для обучения TROPOMI
```

**Файловая структура:**
```
calibration/
├── README.md              # ОБЯЗАТЕЛЬНО: DOI, лицензии
├── mukhrino_ch4.csv       # Dyukarev et al. 2024
├── sabrekov_bc8.csv       # Sabrekov et al. 2011, 2013
├── bakchar_ch4.csv        # Veretennikova & Dyukarev 2021
└── calibration_all.csv    # Каждая строка с полем 'source'
```

---

### DNA §3.5 → Честность

**GEE App (Модуль 7) обязан содержать disclaimer:**
```
• TROPOMI measures column-averaged CH₄, not surface flux
• Winter (Nov–Apr) excluded
• Relative contribution (wetland vs forest) is the primary product
• Absolute emission estimates require ground-truth calibration
```

**Запрещённые формулировки (grep):**
```
FORBIDDEN: "verify national inventory" / "верификация кадастра"
FORBIDDEN: "Paris Agreement compliance"
FORBIDDEN: "official emission reporting"
```

---

## 2. Контракты данных

### Модуль 2 → Модуль 3

```javascript
// ee.ImageCollection: месячные композиты XCH₄
// Band: 'xch4' (float, ppb)
// Properties: 'year' (int), 'month' (int 5–10), 'n_obs' (int)
//
// ТЕСТ:
// var img = collection.first();
// assert(img.bandNames().contains('xch4'));
// assert(img.getNumber('month').gte(5).and(img.getNumber('month').lte(10)));
// assert(img.getNumber('n_obs').gt(0));
```

### Модуль 1 → Модуль 3

```javascript
// ee.Image: wetland_type
// Band: 'wetland_type' (int8, 0–8)
//
// ТЕСТ: гистограмма значений ∈ {0,1,2,3,4,5,6,7,8}
// ТЕСТ: wetland_type == 0 покрывает > 30% AOI
```

### Модуль 3 → Модуль 4

```javascript
// ee.ImageCollection: enhancement
// Bands: 'xch4', 'delta_ch4' (float, ppb)
// Properties: year, month
// + ee.FeatureCollection: таблица year, month, xch4_wetland, xch4_forest, delta_ch4
//
// ТЕСТ: delta_ch4 = xch4_wetland - xch4_forest
// ТЕСТ: delta_ch4 > 0 для летних месяцев (если нет — kill signal)
```

### Модуль 4 → Модуль 5

```javascript
// ee.ImageCollection с bands: 'xch4', 'delta_ch4', 't_air', 'ndvi'
// Properties: year, month
//
// ТЕСТ: все 4 bands присутствуют
// ТЕСТ: t_air в диапазоне -5…+30 °C для мая–октября
// ТЕСТ: ndvi в диапазоне 0…0.9
```

---

## 3. Чеклисты

### Перед коммитом

- [ ] Smoke test на TEST_AOI (Мухрино 100×100 км), один месяц, без ошибок
- [ ] Bands соответствуют контракту
- [ ] Нет `.getInfo()` в App-коде
- [ ] Нет magic numbers
- [ ] JSDoc на функциях

### Kill signal (Фаза 1C)

Если после интеграции Модулей 1+2:
- [ ] XCH₄_wetland − XCH₄_forest ≤ 0 ppb для июля → **метод не работает, остановить проект**
- [ ] Разница < 5 ppb → метод на грани, нужен анализ причин
- [ ] Разница > 10 ppb → метод работает, продолжать

### Перед подачей статьи

- [ ] GitHub repo public
- [ ] GEE App URL в Data Availability
- [ ] calibration/README.md с DOI
- [ ] Все ограничения в Discussion
- [ ] Нет overclaims

---

## 4. Ручной CI-протокол

### После изменения модуля:
1. Открыть .js в GEE Code Editor
2. Run на TEST_AOI
3. Консоль: нет ошибок, цифры в диапазоне
4. Карта: визуально осмысленная
5. Контракт данных не изменился

### Интеграционный тест:
1. Модули 1 → 2 → 3 последовательно, TEST_AOI, июль 2023
2. Результат: таблица с xch4_wetland, xch4_forest, delta_ch4
3. delta_ch4 > 0 → OK

---

## 5. Иерархия документов

```
DNA.md           — инварианты (для человека)
RNA.md           — enforcement (для агента и разработчика) ← ВЫ ЗДЕСЬ
CLAUDE.md        — правила кодирования (для Claude Code)
PROJECT_CARD.md  — состояние проекта
ROADMAP.md       — план и хронология
DevPrompt_NN.md  — задачи для Claude Code
gee/*.js         — код
```

---

## Версионирование

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-04-10 | Первичная формализация |
| 2.0 | 2026-04-10 | Перестройка под 7-модульную архитектуру. Kill signal. Упрощение контрактов. |
