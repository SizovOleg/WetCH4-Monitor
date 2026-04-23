# Article figures — R scripts

Each script reproduces one figure of the accompanying article. All scripts read
CSV tables from `../article/data/` and save PNGs (and, where noted, PDFs) to
`../article/figures/`.

## Scripts

| Script                  | Figure                                                               | Data source                                          |
|-------------------------|----------------------------------------------------------------------|------------------------------------------------------|
| `fig3_seasonal.R`       | Fig. 3: seasonal XCH4 and delta CH4 across the WSP                   | `article_t5_full_aoi_monthly.csv`                    |
| `fig4_zonal.R`          | Fig. 4: delta CH4 by 8 natural zones + delta CH4 vs air-T scatter    | `article_t1_zonal_stats.csv`                         |
| `fig5_zonal_seasonal.R` | Fig. 5: seasonal delta CH4 by zone                                   | `article_t2_zonal_seasonal.csv`                      |
| `fig6_stations.R`       | Fig. 6: seasonal XCH4 and delta CH4 at three stations                | `article_t7_stations_monthly.csv`                    |
| `fig7_validation.R`     | Fig. 7: TROPOMI delta CH4 vs ground CH4 flux (not published — n=8)   | `article_t7_*.csv` + `../calibration/all_ground_ch4.csv` |
| `run_all.R`             | Build all figures in one pass                                        | —                                                    |

## Requirements

```r
install.packages(c("ggplot2", "dplyr", "readr", "patchwork", "ggrepel"))
```

R >= 4.3 recommended.

## Run

### Single script

```bash
cd R
Rscript fig3_seasonal.R
```

### All figures at once

```bash
cd R
Rscript run_all.R
```

Each script also prints verification numbers (seasonal means, peaks, Pearson
r, etc.) that should match the values quoted in the manuscript.

## Figure style conventions

* Decimal separator — comma (Russian-language article style).
* Export DPI — 400 for raster figures.
* Panel labels — Cyrillic `а`, `б` (lowercase).
* Station labels — Mukhrino / Bakchar / Zotino (Russian spelling).
* Natural-zone palette — the same 8-colour scheme used in the GEE app
  (`gee/lib/palettes.js`).
* Base font size — 10 pt, matching IKI RAS journal requirements.

## Notes

* **Figures 1 and 2 are not built in R**:
  * Fig. 1 (WSP map with zones and stations) — QGIS, uses asset
    `projects/nodal-thunder-481307-u1/assets/zapsib`.
  * Fig. 2 (delta CH4 July map) — exported from the GEE App via the
    `delta_ch4_july_mean` asset.
* Scripts have no inter-dependencies; each one is self-contained.
