# -*- coding: utf-8 -*-
"""Третья попытка скачивания: brotli decoder + альтернативные URL.

Исправляет:
- Wiley (получали br) → теперь декомпрессируем brotli.
- MDPI 403 → пробуем без `?version=` параметра.
- Nature/Springer/Elsevier — оставляем платными (PDF недоступен).
"""
from __future__ import annotations

import gzip
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

import brotli

PROJECT_ROOT = Path(r"D:\test\wetland_zapsib")
REFS_DIR = PROJECT_ROOT / "references"

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
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1",
}

# (номер, имя_файла, [список альтернативных url], referer)
RETRY_TASKS = [
    (4, "04_Buchhorn_2020_rs12061044.pdf",
     [
         "https://www.mdpi.com/2072-4292/12/6/1044/pdf",
         "https://res.mdpi.com/d_attachment/remotesensing/remotesensing-12-01044/article_deploy/remotesensing-12-01044.pdf",
     ],
     "https://www.mdpi.com/2072-4292/12/6/1044"),
    (15, "15_Lindqvist_2024_rs16162979.pdf",
     [
         "https://www.mdpi.com/2072-4292/16/16/2979/pdf",
         "https://res.mdpi.com/d_attachment/remotesensing/remotesensing-16-02979/article_deploy/remotesensing-16-02979.pdf",
     ],
     "https://www.mdpi.com/2072-4292/16/16/2979"),

    # Wiley — теперь с brotli
    (13, "13_Knox_2021_gcb-15661.pdf",
     ["https://onlinelibrary.wiley.com/doi/epdf/10.1111/gcb.15661"],
     "https://onlinelibrary.wiley.com/doi/10.1111/gcb.15661"),
    (18, "18_McNicol_2023_AGU-Adv-2023AV000956.pdf",
     ["https://agupubs.onlinelibrary.wiley.com/doi/epdf/10.1029/2023AV000956"],
     "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2023AV000956"),
    (20, "20_Panikov_Dedysh_2000_GBC.pdf",
     ["https://agupubs.onlinelibrary.wiley.com/doi/epdf/10.1029/1999GB900097"],
     "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/1999GB900097"),
    (21, "21_Rinne_2018_2017GB005747.pdf",
     ["https://agupubs.onlinelibrary.wiley.com/doi/epdf/10.1029/2017GB005747"],
     "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2017GB005747"),
    (22, "22_Romanovsky_2010_ppp689.pdf",
     ["https://onlinelibrary.wiley.com/doi/epdf/10.1002/ppp.689"],
     "https://onlinelibrary.wiley.com/doi/10.1002/ppp.689"),
    (27, "27_Sheng_2004_2003GB002190.pdf",
     ["https://agupubs.onlinelibrary.wiley.com/doi/epdf/10.1029/2003GB002190"],
     "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2003GB002190"),
]


def fetch_with_decompression(url: str, headers: dict) -> tuple[bool, bytes, str]:
    """HTTP GET с брауэрными заголовками и декомпрессией."""
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            enc = resp.headers.get("Content-Encoding", "").lower()
            ct = resp.headers.get("Content-Type", "")
            if enc == "gzip" or data[:3] == b"\x1f\x8b\x08":
                data = gzip.decompress(data)
            elif enc == "br":
                data = brotli.decompress(data)
            elif enc == "deflate":
                import zlib
                data = zlib.decompress(data)
            return True, data, ct
    except urllib.error.HTTPError as e:
        return False, b"", f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return False, b"", f"URL: {e.reason}"
    except Exception as e:  # noqa: BLE001
        return False, b"", f"err: {e}"


def try_download(num: int, filename: str, urls: list, referer: str) -> tuple[bool, str]:
    """Попробовать список URL последовательно."""
    dest = REFS_DIR / filename
    if dest.exists() and dest.stat().st_size > 100_000:
        return True, f"уже существует ({dest.stat().st_size // 1024} КБ)"

    headers = dict(BROWSER_HEADERS)
    headers["Referer"] = referer

    last_msg = "нет URL"
    for idx, url in enumerate(urls):
        ok, data, ct_or_err = fetch_with_decompression(url, headers)
        if not ok:
            last_msg = ct_or_err
            continue
        if data.startswith(b"%PDF"):
            dest.write_bytes(data)
            mb = len(data) / 1024 / 1024
            return True, f"OK ({mb:.1f} МБ) [url #{idx+1}]"
        # Не PDF
        size = len(data) // 1024
        if b"<html" in data[:1000].lower():
            last_msg = f"HTML ({size} КБ, ct={ct_or_err[:30]})"
        else:
            last_msg = f"не PDF ({size} КБ, ct={ct_or_err[:30]})"
    return False, last_msg


def main() -> None:
    """Запуск третьей попытки."""
    sys.stdout.reconfigure(encoding="utf-8")
    print(f"Третья попытка для {len(RETRY_TASKS)} файлов (с brotli)...\n")

    ok, fail = 0, 0
    fails = []
    for num, fn, urls, ref in RETRY_TASKS:
        print(f"[{num:2d}] {fn[:50]}")
        success, msg = try_download(num, fn, urls, ref)
        if success:
            print(f"     ✓ {msg}")
            ok += 1
        else:
            print(f"     ❌ {msg}")
            fail += 1
            fails.append((num, fn, msg))
        time.sleep(1.5)

    print(f"\n=== Третья попытка: успешно {ok}, ошибок {fail} ===")
    if fails:
        print("\nНе удалось:")
        for num, fn, msg in fails:
            print(f"  [{num:2d}] {fn}: {msg}")


if __name__ == "__main__":
    main()
