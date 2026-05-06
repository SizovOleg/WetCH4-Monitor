# -*- coding: utf-8 -*-
"""Вторая попытка скачивания — для тех, что вернули 403/HTML.

Использует расширенные браузерные заголовки и альтернативные URL.
"""
from __future__ import annotations

import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

PROJECT_ROOT = Path(r"D:\test\wetland_zapsib")
REFS_DIR = PROJECT_ROOT / "references"

# Полный набор браузерных заголовков
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "application/pdf,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1",
}

# (номер, имя_файла, url, referer)
RETRY_TASKS = [
    # MDPI — нужен Referer на сам сайт
    (4, "04_Buchhorn_2020_rs12061044.pdf",
     "https://www.mdpi.com/2072-4292/12/6/1044/pdf?version=1583492396",
     "https://www.mdpi.com/2072-4292/12/6/1044"),
    (15, "15_Lindqvist_2024_rs16162979.pdf",
     "https://www.mdpi.com/2072-4292/16/16/2979/pdf?version=1723624890",
     "https://www.mdpi.com/2072-4292/16/16/2979"),

    # IOP — иногда другая структура URL
    (9, "09_Glagolev_2011_erl-6-4-045214.pdf",
     "https://iopscience.iop.org/article/10.1088/1748-9326/6/4/045214/pdf",
     "https://iopscience.iop.org/article/10.1088/1748-9326/6/4/045214"),
    (12, "12_Kim_2011_erl-6-3-035201.pdf",
     "https://iopscience.iop.org/article/10.1088/1748-9326/6/3/035201/pdf",
     "https://iopscience.iop.org/article/10.1088/1748-9326/6/3/035201"),

    # AGU/Wiley — pdfdirect
    (13, "13_Knox_2021_gcb-15661.pdf",
     "https://onlinelibrary.wiley.com/doi/epdf/10.1111/gcb.15661",
     "https://onlinelibrary.wiley.com/doi/10.1111/gcb.15661"),
    (18, "18_McNicol_2023_AGU-Adv-2023AV000956.pdf",
     "https://agupubs.onlinelibrary.wiley.com/doi/epdf/10.1029/2023AV000956",
     "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2023AV000956"),
    (20, "20_Panikov_Dedysh_2000_GBC.pdf",
     "https://agupubs.onlinelibrary.wiley.com/doi/epdf/10.1029/1999GB900097",
     "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/1999GB900097"),
    (21, "21_Rinne_2018_2017GB005747.pdf",
     "https://agupubs.onlinelibrary.wiley.com/doi/epdf/10.1029/2017GB005747",
     "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2017GB005747"),
    (22, "22_Romanovsky_2010_ppp689.pdf",
     "https://onlinelibrary.wiley.com/doi/epdf/10.1002/ppp.689",
     "https://onlinelibrary.wiley.com/doi/10.1002/ppp.689"),
    (27, "27_Sheng_2004_2003GB002190.pdf",
     "https://agupubs.onlinelibrary.wiley.com/doi/epdf/10.1029/2003GB002190",
     "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2003GB002190"),

    # Nature — попробуем через /content
    (17, "17_Mastepanov_2008_nature07464.pdf",
     "https://www.nature.com/articles/nature07464.pdf",
     "https://www.nature.com/articles/nature07464"),
    (35, "35_YvonDurocher_2014_nature13164.pdf",
     "https://www.nature.com/articles/nature13164.pdf",
     "https://www.nature.com/articles/nature13164"),

    # Springer — Segers
    (26, "26_Segers_1998_Biogeochemistry.pdf",
     "https://link.springer.com/content/pdf/10.1023%2FA%3A1005929032764.pdf",
     "https://link.springer.com/article/10.1023/A:1005929032764"),

    # Elsevier — Gorelick (Earth Engine paper)
    (10, "10_Gorelick_2017_RSE-202.pdf",
     "https://www.sciencedirect.com/science/article/pii/S0034425717302900",
     "https://www.sciencedirect.com/"),
    # Xu PEATMAP
    (32, "32_Xu_2018_CATENA-160.pdf",
     "https://www.sciencedirect.com/science/article/pii/S0341816217303004",
     "https://www.sciencedirect.com/"),

    # Tellus B (Stockholm University Press)
    (29, "29_Tsuruta_2019_tellusb-71-1-1565030.pdf",
     "https://b.tellusjournals.se/articles/10.1080/16000889.2018.1565030/galley/2103/download/",
     "https://b.tellusjournals.se/article/10.1080/16000889.2018.1565030/"),

    # IPCC AR6 WG1 — full report
    (11, "11_IPCC_AR6_WG1_2021_full.pdf",
     "https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_FullReport.pdf",
     "https://www.ipcc.ch/report/ar6/wg1/"),
]


def download(num: int, filename: str, url: str, referer: str) -> tuple[bool, str]:
    """Скачать с расширенными заголовками."""
    dest = REFS_DIR / filename
    if dest.exists() and dest.stat().st_size > 100_000:
        return True, f"уже существует ({dest.stat().st_size // 1024} КБ)"

    headers = dict(BROWSER_HEADERS)
    headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            ct = resp.headers.get("Content-Type", "")
            # gzip может остаться неразжатым
            if data[:3] == b"\x1f\x8b\x08":
                import gzip
                data = gzip.decompress(data)
            elif resp.headers.get("Content-Encoding") == "br":
                try:
                    import brotli
                    data = brotli.decompress(data)
                except ImportError:
                    return False, "получен br, нет brotli модуля"

            if not data.startswith(b"%PDF"):
                size = len(data) // 1024
                if b"<html" in data[:1000].lower():
                    return False, f"HTML ({size} КБ, ct={ct[:30]})"
                return False, f"не PDF ({size} КБ, ct={ct[:30]})"

            dest.write_bytes(data)
            mb = len(data) / 1024 / 1024
            return True, f"OK ({mb:.1f} МБ)"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return False, f"URL: {e.reason}"
    except Exception as e:  # noqa: BLE001
        return False, f"err: {e}"


def main() -> None:
    """Повторная попытка."""
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"Retry для {len(RETRY_TASKS)} файлов...\n")

    ok, fail = 0, 0
    fails = []
    for num, fn, url, ref in RETRY_TASKS:
        print(f"[{num:2d}] {fn[:50]}: {url[:70]}...")
        success, msg = download(num, fn, url, ref)
        if success:
            print(f"     ✓ {msg}")
            ok += 1
        else:
            print(f"     ❌ {msg}")
            fail += 1
            fails.append((num, fn, msg))
        time.sleep(1.5)

    print(f"\n=== Retry: успешно {ok}, ошибок {fail} ===")
    if fails:
        print("\nНе удалось:")
        for num, fn, msg in fails:
            print(f"  [{num:2d}] {fn}: {msg}")


if __name__ == "__main__":
    main()
