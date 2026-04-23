# =============================================================================
# Рис. 7. Scatter: TROPOMI ΔCH₄ vs наземный поток CH₄ (месячное сопоставление)
# Источники:
#   calibration/all_ground_ch4.csv   — наземные потоки (Mukhrino, Bakchar, ZOTTO)
#   article/data/article_t7_stations_monthly.csv — TROPOMI ΔCH₄ по станциям
# Метрика: inner join по (station, year, month); только строки, где
# наземные данные привязаны к конкретному месяцу/году.
# =============================================================================

library(ggplot2)
library(dplyr)
library(readr)
library(ggrepel)

# --- настройки ---------------------------------------------------------------

data_dir   <- "article/data"
calib_path <- "calibration/all_ground_ch4.csv"
out_dir    <- "article/figures"
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

station_colors <- c("Мухрино" = "#D32F2F",
                    "Бакчар"  = "#1976D2",
                    "ZOTTO"   = "#388E3C")

month_ru <- c("Янв","Фев","Мар","Апр","Май","Июн",
              "Июл","Авг","Сен","Окт","Ноя","Дек")

theme_article <- function(base_size = 10) {
  theme_bw(base_size = base_size) +
    theme(
      panel.grid.minor = element_blank(),
      panel.grid.major = element_line(colour = "grey90", linewidth = 0.3),
      axis.title       = element_text(size = base_size),
      axis.text        = element_text(size = base_size - 1, colour = "black"),
      legend.title     = element_text(size = base_size - 1),
      legend.text      = element_text(size = base_size - 1)
    )
}

# --- наземные данные ---------------------------------------------------------

ground <- read_csv(calib_path, show_col_types = FALSE) |>
  mutate(
    station  = recode(site, "mukhrino" = "Мухрино",
                             "bakchar"  = "Бакчар",
                             "zotto"    = "ZOTTO"),
    year_num  = suppressWarnings(as.numeric(year)),
    month_num = suppressWarnings(as.numeric(month))
  ) |>
  filter(!is.na(year_num), !is.na(month_num)) |>
  transmute(
    station,
    year     = year_num,
    month    = month_num,
    ch4_flux = ch4_flux_mgCH4_m2_h,
    type
  )

# --- TROPOMI данные ---------------------------------------------------------

tropomi <- read_csv(file.path(data_dir, "article_t7_stations_monthly.csv"),
                    show_col_types = FALSE) |>
  mutate(station = recode(station, "Mukhrino" = "Мухрино",
                                    "Bakchar"  = "Бакчар",
                                    "ZOTTO"    = "ZOTTO")) |>
  transmute(station, year, month, delta_ch4)

# --- совпадающие пары --------------------------------------------------------

matched <- ground |>
  inner_join(tropomi, by = c("station", "year", "month")) |>
  mutate(label = paste0(month_ru[month], " ", year))

cat("Совпадающих пар (наземный flux / TROPOMI):", nrow(matched), "\n")
print(matched)

# --- корреляция --------------------------------------------------------------

if (nrow(matched) >= 3) {
  cor_test <- cor.test(matched$ch4_flux, matched$delta_ch4,
                        method = "pearson")
  r   <- cor_test$estimate
  pv  <- cor_test$p.value
  sub <- sprintf("Pearson r = %.2f, p = %.3f, n = %d",
                 r, pv, nrow(matched))
} else {
  sub <- sprintf("n = %d — недостаточно для статистики", nrow(matched))
}

cat("\n", sub, "\n")

# --- рисунок ----------------------------------------------------------------

fig7 <- ggplot(matched, aes(x = ch4_flux, y = delta_ch4)) +
  geom_smooth(method = "lm", se = TRUE,
              colour = "#455A64", fill = "#CFD8DC",
              linewidth = 0.6, alpha = 0.4) +
  geom_point(aes(fill = station), size = 3.5,
             shape = 21, colour = "black", stroke = 0.4) +
  geom_text_repel(aes(label = label), size = 2.8,
                  box.padding = 0.4, max.overlaps = 20) +
  scale_fill_manual("Станция", values = station_colors) +
  labs(x = "Наземный поток CH₄, мг CH₄·м⁻²·ч⁻¹",
       y = "TROPOMI ΔCH₄, ppb",
       subtitle = sub) +
  theme_article() +
  theme(legend.position = "right",
        plot.subtitle = element_text(size = 9, colour = "grey40"))

ggsave(file.path(out_dir, "fig7_validation.png"), fig7,
       width = 13, height = 10, units = "cm", dpi = 300)
ggsave(file.path(out_dir, "fig7_validation.pdf"), fig7,
       width = 13, height = 10, units = "cm")

cat("✓ Рис. 7 сохранён в", out_dir, "\n")
