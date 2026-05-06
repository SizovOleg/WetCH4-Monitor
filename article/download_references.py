# -*- coding: utf-8 -*-
"""Скачать PDF из списка литературы в папку references/.

Стратегия:
1. Существующие PDF из papers/ копируются с правильными именами.
2. Open-access издания (Copernicus, MDPI, IOP) скачиваются по прямым URL.
3. Платные / без открытой версии — пропускаются (выводятся в отчёт).

Запуск: python download_references.py
"""
from __future__ import annotations

import shutil
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path


PROJECT_ROOT = Path(r"D:\test\wetland_zapsib")
REFS_DIR = PROJECT_ROOT / "references"
PAPERS_DIR = PROJECT_ROOT / "papers"

UA = "Mozilla/5.0 (compatible; ResearchBot/1.0; mailto:user@example.com)"


# Каждая запись: (номер, имя_файла, источник)
# источник: ('copy', src_filename) — копировать из papers/
#           ('url', url) — скачать
#           ('skip', reason) — пропустить с причиной
TASKS: list[tuple[int, str, tuple[str, str]]] = [
    # 1-3 — книги, не скачиваем
    (1, "01_Lapshina_2004_book.pdf",
     ("skip", "книга, нет PDF в открытом доступе")),
    (2, "02_Liss_et_al_2001_book.pdf",
     ("skip", "книга, нет PDF в открытом доступе")),
    (3, "03_National_Atlas_Russia_2004_v2.pdf",
     ("skip", "атлас (физический том), нет PDF в открытом доступе")),

    # 4 Buchhorn — MDPI Remote Sensing
    (4, "04_Buchhorn_2020_rs12061044.pdf",
     ("url", "https://www.mdpi.com/2072-4292/12/6/1044/pdf")),

    # 5 Chechin — есть локально
    (5, "05_Chechin_2024_forests-15-00102.pdf",
     ("copy", "Chechin forests-15-00102.pdf")),

    # 6 CGLS-LC100 — продукт, не статья
    (6, "06_CGLS-LC100_2019_data_product.pdf",
     ("skip", "data product, описание см. Buchhorn 2020")),

    # 7 Didan MODIS — data set, не статья
    (7, "07_Didan_2021_MOD13A1_dataset.pdf",
     ("skip", "data set, не статья")),

    # 8 Dyukarev — есть локально
    (8, "08_Dyukarev_2024_edgcc636456.pdf",
     ("copy", "Dyukarev 636456-5006895-2-PB.pdf")),

    # 9 Glagolev — IOP Open Access
    (9, "09_Glagolev_2011_erl-6-4-045214.pdf",
     ("url",
      "https://iopscience.iop.org/article/10.1088/1748-9326/6/4/045214/pdf")),

    # 10 Gorelick — Elsevier RSE — preprint часто доступен через autors-archive
    (10, "10_Gorelick_2017_RSE-202.pdf",
     ("url",
      "https://www.sciencedirect.com/science/article/pii/S0034425717302900/pdfft")),

    # 11 IPCC AR6 WG1 — Cambridge Open Access
    (11, "11_IPCC_AR6_WG1_2021_full.pdf",
     ("url",
      "https://www.cambridge.org/core/services/aop-cambridge-core/content/view/"
      "415F29233B8BD19FB55F65E3DC67272B/9781009157896c1_pi-1.pdf/"
      "frontmatter.pdf")),

    # 12 Kim — IOP Open Access
    (12, "12_Kim_2011_erl-6-3-035201.pdf",
     ("url",
      "https://iopscience.iop.org/article/10.1088/1748-9326/6/3/035201/pdf")),

    # 13 Knox — GCB Open Access (через Wiley)
    (13, "13_Knox_2021_gcb-15661.pdf",
     ("url",
      "https://onlinelibrary.wiley.com/doi/pdfdirect/10.1111/gcb.15661")),

    # 14 Lan NOAA — data, нет PDF
    (14, "14_Lan_2024_NOAA_data.pdf",
     ("skip", "NOAA data product, нет PDF")),

    # 15 Lindqvist — MDPI Open Access
    (15, "15_Lindqvist_2024_rs16162979.pdf",
     ("url", "https://www.mdpi.com/2072-4292/16/16/2979/pdf")),

    # 16 Lorente — Copernicus AMT Open Access
    (16, "16_Lorente_2021_amt-14-665-2021.pdf",
     ("url",
      "https://amt.copernicus.org/articles/14/665/2021/"
      "amt-14-665-2021.pdf")),

    # 17 Mastepanov — Nature, paywall, но иногда есть свободный
    (17, "17_Mastepanov_2008_nature07464.pdf",
     ("url",
      "https://www.nature.com/articles/nature07464.pdf")),

    # 18 McNicol — AGU Advances Open Access
    (18, "18_McNicol_2023_AGU-Adv-2023AV000956.pdf",
     ("url",
      "https://agupubs.onlinelibrary.wiley.com/doi/pdfdirect/"
      "10.1029/2023AV000956")),

    # 19 Muñoz Sabater — Copernicus ESSD Open Access
    (19, "19_MunozSabater_2021_essd-13-4349-2021.pdf",
     ("url",
      "https://essd.copernicus.org/articles/13/4349/2021/"
      "essd-13-4349-2021.pdf")),

    # 20 Panikov — GBC, paywall (Wiley AGU)
    (20, "20_Panikov_Dedysh_2000_GBC.pdf",
     ("url",
      "https://agupubs.onlinelibrary.wiley.com/doi/pdfdirect/"
      "10.1029/1999GB900097")),

    # 21 Rinne — GBC, may be open
    (21, "21_Rinne_2018_2017GB005747.pdf",
     ("url",
      "https://agupubs.onlinelibrary.wiley.com/doi/pdfdirect/"
      "10.1029/2017GB005747")),

    # 22 Romanovsky — Wiley PPP, paywall
    (22, "22_Romanovsky_2010_ppp689.pdf",
     ("url",
      "https://onlinelibrary.wiley.com/doi/pdfdirect/10.1002/ppp.689")),

    # 23 Sabrekov 2013 — есть локально
    (23, "23_Sabrekov_2013_eurasian-soil-sci.pdf",
     ("copy", "sabrekov2013.pdf")),

    # 24 Sabrekov 2011 — есть локально
    (24, "24_Sabrekov_2011_TSPU.pdf",
     ("copy", "Sabrekov_et_al_2011_TGPU_methane.pdf")),

    # 25 Saunois — Copernicus ESSD Open Access
    (25, "25_Saunois_2020_essd-12-1561-2020.pdf",
     ("url",
      "https://essd.copernicus.org/articles/12/1561/2020/"
      "essd-12-1561-2020.pdf")),

    # 26 Segers — Springer Biogeochemistry, paywall
    (26, "26_Segers_1998_Biogeochemistry.pdf",
     ("url",
      "https://link.springer.com/content/pdf/10.1023/A:1005929032764.pdf")),

    # 27 Sheng — Wiley GBC, paywall
    (27, "27_Sheng_2004_2003GB002190.pdf",
     ("url",
      "https://agupubs.onlinelibrary.wiley.com/doi/pdfdirect/"
      "10.1029/2003GB002190")),

    # 28 Terentieva — Copernicus BG Open Access
    (28, "28_Terentieva_2016_bg-13-4615-2016.pdf",
     ("url",
      "https://bg.copernicus.org/articles/13/4615/2016/"
      "bg-13-4615-2016.pdf")),

    # 29 Tsuruta — Tellus B Open Access
    (29, "29_Tsuruta_2019_tellusb-71-1-1565030.pdf",
     ("url",
      "https://www.tandfonline.com/doi/pdf/10.1080/16000889.2018.1565030")),

    # 30 Veretennikova — есть локально
    (30, "30_Veretennikova_Dyukarev_2021_ber26-043-059.pdf",
     ("copy", "Veretennikova_Dyukarev_2021_ber26-043-059.pdf")),

    # 31 Winderlich — есть локально
    (31, "31_Winderlich_2014_bg-11-2055-2014.pdf",
     ("copy", "Winderlich_et_al_2014_bg-11-2055-2014.pdf")),

    # 32 Xu — Elsevier CATENA, paywall
    (32, "32_Xu_2018_CATENA-160.pdf",
     ("url",
      "https://www.sciencedirect.com/science/article/pii/S0341816217303004/pdfft")),

    # 33 Ying — Copernicus ESSD Open Access
    (33, "33_Ying_2025_essd-17-2507-2025.pdf",
     ("url",
      "https://essd.copernicus.org/articles/17/2507/2025/"
      "essd-17-2507-2025.pdf")),

    # 34 Yuan — Nature Climate Change, paywall
    (34, "34_Yuan_2024_NCC-s41558-024-01933-3.pdf",
     ("url",
      "https://www.nature.com/articles/s41558-024-01933-3.pdf")),

    # 35 Yvon-Durocher — Nature, paywall
    (35, "35_YvonDurocher_2014_nature13164.pdf",
     ("url",
      "https://www.nature.com/articles/nature13164.pdf")),
]


def download_pdf(url: str, dest: Path, timeout: int = 30) -> tuple[bool, str]:
    """Скачать PDF по URL. Возвращает (успех, сообщение)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                "Accept": "application/pdf,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            content_type = resp.headers.get("Content-Type", "")
            # Проверка: PDF должен начинаться с %PDF
            if not data.startswith(b"%PDF"):
                # Возможно, редирект на HTML (paywall)
                size_kb = len(data) // 1024
                if b"<html" in data[:1000].lower() or b"<!doctype" in data[:1000].lower():
                    return False, (f"получен HTML вместо PDF "
                                   f"({size_kb} КБ, content-type={content_type})")
                return False, f"не PDF ({size_kb} КБ, content-type={content_type})"
            dest.write_bytes(data)
            size_mb = len(data) / 1024 / 1024
            return True, f"OK ({size_mb:.1f} МБ)"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        return False, f"URL error: {e.reason}"
    except Exception as e:  # noqa: BLE001
        return False, f"ошибка: {e}"


def copy_local(src_filename: str, dest: Path) -> tuple[bool, str]:
    """Скопировать существующий PDF из papers/."""
    src = PAPERS_DIR / src_filename
    if not src.exists():
        return False, f"исходный файл не найден: {src}"
    shutil.copy2(src, dest)
    size_mb = src.stat().st_size / 1024 / 1024
    return True, f"скопировано из papers/ ({size_mb:.1f} МБ)"


def main() -> None:
    """Загрузка / копирование всех источников."""
    REFS_DIR.mkdir(exist_ok=True)

    stats = {"ok": 0, "fail": 0, "skip": 0}
    fails: list[tuple[int, str, str]] = []  # (num, filename, reason)
    skipped: list[tuple[int, str, str]] = []

    for num, filename, (kind, arg) in TASKS:
        dest = REFS_DIR / filename
        if dest.exists():
            print(f"[{num:2d}] {filename}: уже существует, пропуск.")
            stats["ok"] += 1
            continue

        if kind == "copy":
            ok, msg = copy_local(arg, dest)
        elif kind == "url":
            print(f"[{num:2d}] {filename}: скачиваю {arg[:80]}...")
            ok, msg = download_pdf(arg, dest)
            time.sleep(1.0)  # вежливость к серверам
        elif kind == "skip":
            print(f"[{num:2d}] {filename}: SKIP — {arg}")
            stats["skip"] += 1
            skipped.append((num, filename, arg))
            continue
        else:
            ok, msg = False, f"неизвестный тип задачи: {kind}"

        if ok:
            print(f"[{num:2d}] {filename}: {msg}")
            stats["ok"] += 1
        else:
            print(f"[{num:2d}] {filename}: ❌ {msg}")
            stats["fail"] += 1
            fails.append((num, filename, msg))

    # === Финальный отчёт ===
    print()
    print("=" * 70)
    print(f"Итого: успешно {stats['ok']}, ошибок {stats['fail']}, "
          f"пропущено {stats['skip']}")
    print("=" * 70)

    if fails:
        print("\n❌ Не удалось скачать:")
        for num, fn, reason in fails:
            print(f"  [{num:2d}] {fn}: {reason}")

    if skipped:
        print("\n⏭️  Пропущены (намеренно):")
        for num, fn, reason in skipped:
            print(f"  [{num:2d}] {fn}: {reason}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
