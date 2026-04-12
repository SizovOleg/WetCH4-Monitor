# Ground truth CH₄ data for WetCH4-WS validation

## Sources

| File | Source | DOI / Reference | Data type | Period |
|------|--------|-----------------|-----------|--------|
| mukhrino_ch4.csv | Dyukarev et al. (2024) | edgccjournal.org/EDGCC/article/view/636456 | Auto-chamber CH₄, Mukhrino | Jun 2023 |
| mukhrino_ch4.csv | Chechin/Alekseychik et al. (2024) | doi:10.3390/f15010102 | Static chamber + EC CH₄, Mukhrino | Jun 2022 |
| mukhrino_meteo.csv | Dyukarev et al. (2020) | doi:10.5281/zenodo.4323024 | Meteo, Mukhrino | 2010-2019 |
| sabrekov_bc8.csv | Sabrekov et al. (2011, 2013) | doi:10.1134/S0016852113020076 | Chamber CH₄ by Bc8 type | 2007-2010 |
| bakchar_ch4.csv | Veretennikova & Dyukarev (2021) | doi:10.5281/zenodo.4718848 | Chamber CH₄, Bakchar | 2016-2018 |
| zotto_ch4.csv | Winderlich et al. (2014) | doi:10.5194/bg-11-2055-2014 | Profile CH₄, ZOTTO | 2009, 2011 |
| zotto_ch4.csv | Tran/Panov et al. (2025) | doi:10.5194/acp-25-16553-2025 | Tower CH₄ trends, ZOTTO | 2010-2021 |
| all_ground_ch4.csv | Merged from above | — | Combined, 12 records | 2009-2023 |

## Sites

| Site | Lat | Lon | Zone | Key references |
|------|-----|-----|------|----------------|
| Mukhrino | 60.892 | 68.682 | Middle taiga, HMAO | Dyukarev 2024, Chechin 2024, Sabrekov 2011 |
| Bakchar | 56.93 | 82.67 | Southern taiga, Tomsk | Veretennikova & Dyukarev 2021 |
| ZOTTO | 60.80 | 89.35 | Middle taiga, Krasnoyarsk | Winderlich 2014, Tran/Panov 2025 |

## Units

All values converted to **mg CH₄ m⁻² h⁻¹** in column `ch4_flux_mgCH4_m2_h`.
Original units preserved in column `ch4_unit`.

## Conversion factors

| From | To mg CH₄ m⁻² h⁻¹ | Factor |
|------|---------------------|--------|
| mg C-CH₄ m⁻² h⁻¹ | mg CH₄ m⁻² h⁻¹ | × 1.333 (16/12) |
| nmol m⁻² s⁻¹ | mg CH₄ m⁻² h⁻¹ | × 0.0576 (16e-6 × 3600) |
| µmol m⁻² s⁻¹ | mg CH₄ m⁻² h⁻¹ | × 57.6 (16e-3 × 3600) |
| g CH₄ m⁻² d⁻¹ | mg CH₄ m⁻² h⁻¹ | × 41.67 (1000/24) |

## CSV format

```
site,lat,lon,type,month,year,ch4_flux,ch4_unit,ch4_flux_mgCH4_m2_h,method,source_doi,table_or_figure,notes
```

## License

Data extracted from published peer-reviewed articles (tables, figures, text).
Cite original sources when using.
