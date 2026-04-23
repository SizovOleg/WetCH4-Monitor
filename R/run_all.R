# =============================================================================
# Запуск всех скриптов рисунков. Запускать из папки R/:
#   cd R && Rscript run_all.R
# =============================================================================

scripts <- c("fig3_seasonal.R",
             "fig4_zonal.R",
             "fig5_zonal_seasonal.R",
             "fig6_stations.R",
             "fig7_validation.R")

for (s in scripts) {
  cat("\n===", s, "===\n")
  source(s, echo = FALSE)
}

cat("\n\nВсе рисунки сохранены в article/figures/\n")
