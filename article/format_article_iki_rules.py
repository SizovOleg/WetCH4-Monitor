# -*- coding: utf-8 -*-
"""Форматирование статьи по правилам ИКИ РАН (правила-оформления-2023.docx).

Источник: WetCH4_Sizov_template.docx
Результат: WetCH4_Sizov_FINAL.docx

Применяемые правила (из правила-оформления-2023.docx):
- Основной текст: Times New Roman 12, полуторный интервал, по ширине, абзац 1,25 см.
- Без переносов в словах.
- Названия разделов: TNR 12 жирный, по центру, две пустых строки до и одна после.
- Подзаголовки: TNR 12 курсив, одинарный, по центру.
- Названия таблиц: TNR 12 обычный, одинарный, по центру.
- Подписи рисунков: TNR 12 курсив, одинарный, без точки в конце.
- Нумерация строк сплошная.

Запуск: python format_article_iki_rules.py
"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.shared import Cm, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


SRC = Path(r"D:\test\wetland_zapsib\article\WetCH4_Sizov_template.docx")
DST = Path(r"D:\test\wetland_zapsib\article\WetCH4_Sizov_FINAL.docx")


# Названия разделов (Heading 2 в исходнике)
SECTIONS = {
    "Введение",
    "Территория, данные и методы исследования",
    "Результаты исследования",
    "Обсуждение результатов",
    "Заключение",
    "Финансирование и благодарности",
    "Литература",
    "References",
}


def set_normal_style(doc: Document) -> None:
    """Установить стиль Normal: TNR 12, полуторный интервал, абзац 1,25 см."""
    style = doc.styles["Normal"]
    font = style.font
    font.name = "Times New Roman"
    font.size = Pt(12)
    # Кириллический шрифт (rFonts)
    rPr = style.element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:ascii"), "Times New Roman")
    rFonts.set(qn("w:hAnsi"), "Times New Roman")
    rFonts.set(qn("w:cs"), "Times New Roman")

    pf = style.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    pf.first_line_indent = Cm(1.25)
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)


def enable_line_numbering(doc: Document) -> None:
    """Включить сплошную нумерацию строк (для удобства рецензирования)."""
    for section in doc.sections:
        sectPr = section._sectPr
        # Удалить старый lnNumType, если есть
        old = sectPr.find(qn("w:lnNumType"))
        if old is not None:
            sectPr.remove(old)
        # Добавить новый
        ln = OxmlElement("w:lnNumType")
        ln.set(qn("w:countBy"), "1")
        ln.set(qn("w:start"), "1")
        ln.set(qn("w:restart"), "continuous")
        sectPr.append(ln)


def set_no_hyphenation(doc: Document) -> None:
    """Запретить переносы в словах для всего документа."""
    settings = doc.settings.element
    auto_hyph = settings.find(qn("w:autoHyphenation"))
    if auto_hyph is not None:
        settings.remove(auto_hyph)
    # Добавить doNotHyphenate в каждый абзац? Проще — глобально через autoHyphenation = false
    elem = OxmlElement("w:autoHyphenation")
    elem.set(qn("w:val"), "false")
    settings.append(elem)


def style_section_heading(p) -> None:
    """Заголовок раздела: TNR 12 жирный, по центру, без отступа."""
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf = p.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    pf.space_before = Pt(24)
    pf.space_after = Pt(12)
    for run in p.runs:
        run.bold = True
        run.italic = False
        run.font.name = "Times New Roman"
        run.font.size = Pt(12)


def style_subheading(p) -> None:
    """Подзаголовок: TNR 12 курсив, по центру, одинарный."""
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf = p.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    pf.space_before = Pt(12)
    pf.space_after = Pt(6)
    for run in p.runs:
        run.italic = True
        run.bold = False
        run.font.name = "Times New Roman"
        run.font.size = Pt(12)


def style_figure_caption(p) -> None:
    """Подпись рисунка: TNR 12 курсив, одинарный, без точки в конце."""
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf = p.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    for run in p.runs:
        run.italic = True
        run.font.name = "Times New Roman"
        run.font.size = Pt(12)


def style_table_title(p) -> None:
    """Название таблицы: TNR 12 обычный, одинарный, по центру."""
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pf = p.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    pf.space_before = Pt(12)
    pf.space_after = Pt(6)
    for run in p.runs:
        run.italic = False
        run.bold = False
        run.font.name = "Times New Roman"
        run.font.size = Pt(12)


def style_body(p) -> None:
    """Основной текст: TNR 12, полуторный, по ширине, абзац 1,25 см."""
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf = p.paragraph_format
    pf.first_line_indent = Cm(1.25)
    pf.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
    for run in p.runs:
        run.font.name = "Times New Roman"
        if run.font.size is None or run.font.size > Pt(13):
            run.font.size = Pt(12)


def style_abstract(p) -> None:
    """Аннотация / abstract: TNR 10 обычный, одинарный интервал, по ширине,
    без абзацного отступа.
    """
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf = p.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    pf.space_before = Pt(0)
    pf.space_after = Pt(6)
    for run in p.runs:
        run.font.name = "Times New Roman"
        run.font.size = Pt(10)
        run.bold = False
        run.italic = False


def style_keywords(p) -> None:
    """Ключевые слова / Keywords: TNR 10, одинарный, без абзацного отступа.
    Метка «Ключевые слова:» / «Keywords:» — обычный шрифт, как в Морозова-образце.
    """
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf = p.paragraph_format
    pf.first_line_indent = Cm(0)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    pf.space_before = Pt(0)
    pf.space_after = Pt(6)
    for run in p.runs:
        run.font.name = "Times New Roman"
        run.font.size = Pt(10)


def style_reference_entry(p, num: int) -> None:
    """Запись в Литература/References: TNR 12 (или 11), одинарный, висячий отступ."""
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    pf = p.paragraph_format
    pf.first_line_indent = Cm(-0.75)
    pf.left_indent = Cm(0.75)
    pf.line_spacing_rule = WD_LINE_SPACING.SINGLE
    pf.space_after = Pt(3)
    for run in p.runs:
        run.font.name = "Times New Roman"
        if run.font.size is None or run.font.size > Pt(13):
            run.font.size = Pt(12)


def is_figure_caption(text: str) -> bool:
    """True, если это подпись рисунка (начинается с 'Рис.' или 'Fig.')."""
    t = text.strip()
    return bool(re.match(r"^(Рис\.|Fig\.|Рисунок\s)\s*\d+", t))


def is_table_title(text: str) -> bool:
    """True, если это название таблицы (начинается с 'Таблица')."""
    t = text.strip()
    return bool(re.match(r"^(Таблица|Table)\s*\d+", t))


def is_subheading(text: str, prev_style: str) -> bool:
    """Эвристика: подзаголовок — короткая строка без точки и не подпись/название.

    Используется внутри Heading 2 секций для распознавания подразделов вроде
    «Маска болот и площади», «Превышение концентрации CH4 над болотами» и т.п.
    """
    t = text.strip()
    if not t or len(t) > 70:
        return False
    if is_figure_caption(t) or is_table_title(t):
        return False
    if t.endswith(".") or t.endswith(":") or t.endswith("…"):
        return False
    if t in SECTIONS:
        return False
    # Должен начинаться с заглавной буквы и быть похож на заголовок
    if not t[0].isupper():
        return False
    # Эвристические признаки подзаголовка из текста статьи
    subheading_markers = [
        "Маска болот",
        "Превышение концентрации",
        "Зональная дифференциация",
        "Сезонная динамика",
        "Межгодовая динамика",
        "Валидация по наземным",
        "Оценка суммарной",
        "TROPOMI",
        "Sentinel",
        "ERA5",
        "MODIS",
        "CGLS",
        "Карта болот",
        "Природные зоны",
        "Расчёт ΔCH",
        "Расчёт превышения",
        "Наземные данные",
        "Передаточная функция",
        "Эмиссия",
    ]
    for marker in subheading_markers:
        if marker in t:
            return True
    return False


def main() -> None:
    """Применить форматирование ИКИ РАН и сохранить как FINAL.docx."""
    sys.stdout.reconfigure(encoding="utf-8")

    if not SRC.exists():
        raise FileNotFoundError(f"Не найден исходный файл: {SRC}")

    print(f"Источник:  {SRC}")
    print(f"Результат: {DST}")
    print()

    # Скопировать исходник, чтобы python-docx работал поверх
    if DST.exists():
        try:
            DST.unlink()
        except PermissionError:
            print("⚠️  Файл занят (открыт в Word). Сохраняю с суффиксом _v2.")
            new_dst = DST.with_name(DST.stem + "_v2" + DST.suffix)
            DST_actual = new_dst
        else:
            DST_actual = DST
    else:
        DST_actual = DST

    shutil.copy2(SRC, DST_actual)
    doc = Document(DST_actual)

    # 1. Глобальные настройки
    set_normal_style(doc)
    enable_line_numbering(doc)
    set_no_hyphenation(doc)

    # 2. Поабзацная разметка
    # state: 'normal' | 'lit_refs' | 'eng_block' | 'en_refs'
    state = "normal"
    counters = {
        "section": 0,
        "subheading": 0,
        "figure": 0,
        "table": 0,
        "body": 0,
        "ref": 0,
        "eng_block": 0,
    }

    def looks_like_reference(t: str) -> bool:
        """Эвристика: похоже ли на запись в библиографии."""
        # Русские книжные записи без DOI (Лапшина, Лисс, Нац.атлас)
        # начинаются с кириллицы и содержат «с.» в конце
        if re.match(r"^[А-ЯЁ]", t) and re.search(r"\d{4}\.\s*\d+\s*с\.", t):
            return True
        # Стандартные признаки журнальной записи
        if "DOI:" in t or "//" in t or "https://doi.org/" in t:
            return True
        if re.search(r"\b(V\.|Vol\.|No\.|P\. \d|pp\. \d)\s*\d", t):
            return True
        # CGLS-LC100 или подобный data-product без DOI/нумерации, но с URL:
        if re.search(r"URL:\s*https?://", t):
            return True
        return False

    for i, p in enumerate(doc.paragraphs):
        text = p.text.strip()
        if not text:
            continue

        style_name = p.style.name

        # ВЕРХНЕУРОВНЕВЫЕ ЗАГОЛОВКИ
        if text in SECTIONS:
            style_section_heading(p)
            counters["section"] += 1
            if text == "Литература":
                state = "lit_refs"
            elif text == "References":
                state = "en_refs"
            else:
                state = "normal"
            continue

        if i == 0:
            # Заголовок статьи
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for run in p.runs:
                run.bold = True
                run.font.name = "Times New Roman"
                run.font.size = Pt(14)
            continue

        # === СОСТОЯНИЯ ===
        if state == "lit_refs":
            # В Литература — но между ней и References есть английский title block
            if not looks_like_reference(text):
                # Переход в английский блок
                state = "eng_block"
                # Английский заголовок статьи — по центру, жирный
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                pf = p.paragraph_format
                pf.first_line_indent = Cm(0)
                pf.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
                for run in p.runs:
                    run.bold = True
                    run.font.name = "Times New Roman"
                    run.font.size = Pt(13)
                counters["eng_block"] += 1
                continue
            else:
                style_reference_entry(p, 0)
                counters["ref"] += 1
                continue

        if state == "en_refs":
            style_reference_entry(p, 0)
            counters["ref"] += 1
            continue

        if state == "eng_block":
            # Authors / affiliation / email / abstract / keywords
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            pf = p.paragraph_format
            pf.first_line_indent = Cm(0)
            pf.line_spacing_rule = WD_LINE_SPACING.ONE_POINT_FIVE
            for run in p.runs:
                run.font.name = "Times New Roman"
                if run.font.size is None or run.font.size > Pt(13):
                    run.font.size = Pt(12)
            counters["eng_block"] += 1
            continue

        # ПОДПИСИ РИСУНКОВ
        if is_figure_caption(text):
            style_figure_caption(p)
            counters["figure"] += 1
            continue

        # НАЗВАНИЯ ТАБЛИЦ
        if is_table_title(text):
            style_table_title(p)
            counters["table"] += 1
            continue

        # ПОДЗАГОЛОВКИ
        if is_subheading(text, style_name):
            style_subheading(p)
            counters["subheading"] += 1
            continue

        # ОСНОВНОЙ ТЕКСТ
        style_body(p)
        counters["body"] += 1

    # 3. Сохранить
    try:
        doc.save(DST_actual)
    except PermissionError:
        new_dst = DST_actual.with_name(DST_actual.stem + "_v2" + DST_actual.suffix)
        doc.save(new_dst)
        DST_actual = new_dst
        print(f"⚠️  Сохранён как {DST_actual.name} (исходный был занят).")

    print(f"✓ Сохранено: {DST_actual}")
    print()
    print("Статистика разметки:")
    for k, v in counters.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
