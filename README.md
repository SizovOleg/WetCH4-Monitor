# WetCH4-WS

Regional methane emission monitoring tool for Western Siberian peatlands.

Links TROPOMI atmospheric CH₄ observations with a wetland type map and ground-based calibration data to produce spatially explicit emission proxy estimates. Delivered as a Google Earth Engine App with open data export.

**Status:** Phase 1A — TROPOMI anomaly prototype

## Project structure

```
gee/                  # GEE JavaScript modules
  lib/                # Shared constants, palettes, utilities
calibration/          # Ground-truth CH₄ data from publications
validation/           # Accuracy assessment scripts
paper/                # Manuscript and figures
screenshots/          # Visual gallery
```

## Key documents

- [DNA.md](DNA.md) — Project invariants (do not modify)
- [PROJECT_CARD.md](PROJECT_CARD.md) — Architecture and specification
- [ROADMAP.md](ROADMAP.md) — Development plan and timeline

## Quick start

1. Clone this repository
2. Open any `gee/*.js` file in [GEE Code Editor](https://code.earthengine.google.com)
3. Run — results appear on the map

## License

TBD

## Citation

TBD
