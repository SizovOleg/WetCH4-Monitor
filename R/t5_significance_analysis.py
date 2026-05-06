# -*- coding: utf-8 -*-
"""Статистическая значимость ΔCH₄ из таблицы T5.

Читает article_t5_full_aoi_monthly_full.csv (42 месячных композита TROPOMI
с пиксельными mean/SD/n для wetland и forest масок) и считает для каждого
композита:

    - Welch's t-критерий: t = (m_w − m_f) / √(s_w²/n_w + s_f²/n_f)
    - Welch–Satterthwaite df
    - двухсторонний p-value
    - Cohen's d с pooled SD (объединённое стандартное отклонение)

Выходной CSV: article_t5_full_aoi_monthly_with_stats.csv
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats


SRC = Path(r"D:\test\wetland_zapsib\article\data\article_t5_full_aoi_monthly_full.csv")
DST = Path(r"D:\test\wetland_zapsib\article\data\article_t5_full_aoi_monthly_with_stats.csv")


def welch_t_test(m1: float, s1: float, n1: int,
                 m2: float, s2: float, n2: int) -> tuple[float, float, float]:
    """Двухвыборочный t-критерий Уэлча.

    Возвращает (t-статистика, df, двухсторонний p-value).
    """
    if n1 < 2 or n2 < 2 or s1 <= 0 or s2 <= 0:
        return np.nan, np.nan, np.nan

    se1_sq = s1 ** 2 / n1
    se2_sq = s2 ** 2 / n2
    se = np.sqrt(se1_sq + se2_sq)
    t = (m1 - m2) / se

    # Welch–Satterthwaite df
    df_num = (se1_sq + se2_sq) ** 2
    df_den = (se1_sq ** 2) / (n1 - 1) + (se2_sq ** 2) / (n2 - 1)
    df = df_num / df_den

    # Двухсторонний p-value (через survival function — корректно для очень малых p)
    p = 2.0 * stats.t.sf(abs(t), df)
    return t, df, p


def cohens_d(m1: float, s1: float, n1: int,
             m2: float, s2: float, n2: int) -> float:
    """Cohen's d с pooled SD (несмещённая оценка)."""
    if n1 < 2 or n2 < 2 or (s1 <= 0 and s2 <= 0):
        return np.nan
    pooled_var = ((n1 - 1) * s1 ** 2 + (n2 - 1) * s2 ** 2) / (n1 + n2 - 2)
    s_pooled = np.sqrt(pooled_var)
    if s_pooled == 0:
        return np.nan
    return (m1 - m2) / s_pooled


def classify_d(d: float) -> str:
    """Классификация эффекта по Cohen (1988)."""
    if pd.isna(d):
        return "n/a"
    a = abs(d)
    if a < 0.2:
        return "negligible"
    if a < 0.5:
        return "small"
    if a < 0.8:
        return "medium"
    return "large"


def classify_p(p: float) -> str:
    """Уровень значимости в звёздочках (стандартный)."""
    if pd.isna(p):
        return "n/a"
    if p < 0.001:
        return "***"
    if p < 0.01:
        return "**"
    if p < 0.05:
        return "*"
    return "ns"


def main() -> None:
    """Прочитать T5, добавить колонки значимости, сохранить."""
    df = pd.read_csv(SRC)
    print(f"Загружено строк: {len(df)}")
    print(f"Колонки: {list(df.columns)}")
    print()

    # Нормализуем int
    df["year"] = df["year"].astype(int)
    df["month"] = df["month"].astype(int)
    df["n_wetland_pixels"] = df["n_wetland_pixels"].astype(int)
    df["n_forest_pixels"] = df["n_forest_pixels"].astype(int)

    # Применяем тесты строка-за-строкой
    results = []
    for _, row in df.iterrows():
        t, ddof, p = welch_t_test(
            row["xch4_wetland"], row["xch4_wetland_sd"], row["n_wetland_pixels"],
            row["xch4_forest"],  row["xch4_forest_sd"],  row["n_forest_pixels"],
        )
        d = cohens_d(
            row["xch4_wetland"], row["xch4_wetland_sd"], row["n_wetland_pixels"],
            row["xch4_forest"],  row["xch4_forest_sd"],  row["n_forest_pixels"],
        )
        results.append({
            "welch_t":  t,
            "welch_df": ddof,
            "p_value":  p,
            "p_signif": classify_p(p),
            "cohens_d": d,
            "d_class":  classify_d(d),
        })

    stats_df = pd.DataFrame(results)
    out = pd.concat([df.reset_index(drop=True), stats_df], axis=1)

    out.to_csv(DST, index=False, float_format="%.6f")
    print(f"Сохранено: {DST}")
    print(f"Строк: {len(out)}")
    print()

    # Сводная статистика
    print("=== Сводная статистика по 42 композитам ===")
    print()
    print(f"ΔCH₄ диапазон:        {out['delta_ch4'].min():.2f} — "
          f"{out['delta_ch4'].max():.2f} ppb")
    print(f"ΔCH₄ среднее ± SD:    {out['delta_ch4'].mean():.2f} ± "
          f"{out['delta_ch4'].std():.2f} ppb")
    print(f"ΔCH₄ медиана:         {out['delta_ch4'].median():.2f} ppb")
    print()

    # Сколько композитов значимы при p < 0.05
    sig_count = (out["p_value"] < 0.05).sum()
    sig_001 = (out["p_value"] < 0.001).sum()
    print(f"Значимых при p < 0.05:    {sig_count} / {len(out)} "
          f"({100 * sig_count / len(out):.1f}%)")
    print(f"Значимых при p < 0.001:   {sig_001} / {len(out)} "
          f"({100 * sig_001 / len(out):.1f}%)")
    print()

    # Распределение по силе эффекта
    print("Распределение Cohen's d:")
    for cls in ["negligible", "small", "medium", "large"]:
        n = (out["d_class"] == cls).sum()
        print(f"  {cls:11}: {n:2d} композитов")
    print(f"  Mean |d|:   {out['cohens_d'].abs().mean():.3f}")
    print(f"  Median |d|: {out['cohens_d'].abs().median():.3f}")
    print()

    # Примеры: топ-5 по значимости и топ-5 по абс. эффекту
    print("=== Топ-5 композитов по абсолютному эффекту (|d|) ===")
    top_d = out.reindex(out["cohens_d"].abs().sort_values(ascending=False).index)
    print(top_d[["year", "month", "delta_ch4", "p_value", "p_signif",
                 "cohens_d", "d_class"]].head(10).to_string(index=False))
    print()

    print("=== Композиты со СЛАБОЙ значимостью (p ≥ 0.05) ===")
    weak = out[out["p_value"] >= 0.05]
    if len(weak) > 0:
        print(weak[["year", "month", "delta_ch4", "n_wetland_pixels",
                    "n_forest_pixels", "p_value", "cohens_d"]].to_string(index=False))
    else:
        print("  Нет — все 42 композита значимы при p < 0.05.")
    print()

    # Сезонная сводка (по месяцам)
    print("=== Среднее ΔCH₄ и доля значимых по месяцам ===")
    seas = (
        out.groupby("month")
        .agg(
            n_composites=("year", "size"),
            mean_delta=("delta_ch4", "mean"),
            sd_delta=("delta_ch4", "std"),
            mean_d=("cohens_d", "mean"),
            n_signif_p05=("p_value", lambda x: (x < 0.05).sum()),
        )
        .round(3)
    )
    print(seas.to_string())


if __name__ == "__main__":
    main()
