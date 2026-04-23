# =============================================================================
# Run all figure scripts. Execute from the project root:
#   Rscript R/run_all.R
# Each script reads from article/data/ and writes to article/figures/.
# =============================================================================

scripts <- c("R/fig2_seasonal.R",
             "R/fig3_zonal.R",
             "R/fig4_zonal_seasonal.R",
             "R/fig5_stations.R")

for (s in scripts) {
  cat("\n===", s, "===\n")
  source(s, echo = FALSE)
}

cat("\n\nAll figures saved to article/figures/\n")
