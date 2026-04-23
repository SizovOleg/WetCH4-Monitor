# Article figures — R scripts

Each script reproduces one figure of the accompanying article. All scripts read
CSV tables from `article/data/` and save PNGs to `article/figures/`.

Figure 1 (WSP map with zones + stations) is a manual composite and is not
built here.

## Scripts

| Script                     | Figure                                                               | Data source                              |
|----------------------------|----------------------------------------------------------------------|------------------------------------------|
| `fig2_seasonal.R`          | Fig. 2: seasonal XCH4 and delta CH4 across the WSP                   | `article_t5_full_aoi_monthly.csv`        |
| `fig3_zonal.R`             | Fig. 3: delta CH4 by 8 natural zones + delta CH4 vs air-T scatter    | `article_t1_zonal_stats.csv`             |
| `fig4_zonal_seasonal.R`    | Fig. 4: seasonal delta CH4 by zone                                   | `article_t2_zonal_seasonal.csv`          |
| `fig5_stations.R`          | Fig. 5: seasonal XCH4 and delta CH4 at three stations                | `article_t7_stations_monthly.csv`        |
| `run_all.R`                | Build all figures in one pass                                        | —                                        |

## Requirements

```r
install.packages(c("ggplot2", "dplyr", "readr", "patchwork", "ggrepel"))
```

R >= 4.3 recommended.

## Run

### Single script (from project root)

```bash
Rscript R/fig2_seasonal.R
```

### All figures at once

```bash
Rscript R/run_all.R
```

Each script also prints verification numbers (seasonal means, peaks, regression
coefficients, etc.) that should match the values quoted in the manuscript.

## Figure style conventions

* Decimal separator — comma (Russian-language article style).
* Export DPI — 400 for raster figures.
* Panel labels — Cyrillic `а`, `б` (lowercase).
* Station labels — Mukhrino / Bakchar / Zotino (Russian spelling).
* Natural-zone palette — the same 8-colour scheme used in the GEE app
  (`gee/lib/palettes.js`).
* Base font size — 10 pt, matching IKI RAS journal requirements.

## Notes

* **Figure 1** (WSP map with zones and stations) is built in QGIS from the
  asset `projects/nodal-thunder-481307-u1/assets/zapsib` and the three station
  points. It is a composite of the original map and the July delta CH4 raster
  (`delta_ch4_july_mean` asset).
* Scripts have no inter-dependencies; each one is self-contained.
