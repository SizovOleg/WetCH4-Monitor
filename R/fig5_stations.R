# =============================================================================
# Рис. 5. Сезонный ход XCH₄ и ΔCH₄ на трёх станциях (Мухрино, Бакчар, Зотино)
# Источник данных: article_t7_stations_monthly.csv
# Метрика: среднее по годам для каждого месяца (n = 4–7 записей на точку)
# =============================================================================

library(ggplot2)
library(dplyr)
library(readr)
library(patchwork)

# --- настройки ---------------------------------------------------------------

data_dir <- "article/data"
out_dir  <- "article/figures"
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

station_ru      <- c("Mukhrino" = "Мухрино",
                     "Bakchar"  = "Бакчар",
                     "ZOTTO"    = "Зотино")

station_colors  <- c("Мухрино" = "#D32F2F",
                     "Бакчар"  = "#1976D2",
                     "Зотино"  = "#388E3C")

station_shapes  <- c("Мухрино" = 21,
                     "Бакчар"  = 22,
                     "Зотино"  = 24)

# смешать цвет с белым (amount: 0 — без изменений, 1 — чистый белый)
lighten_col <- function(col, amount = 0.5) {
  rgb_val   <- col2rgb(col) / 255
  rgb_light <- rgb_val + (1 - rgb_val) * amount
  rgb(rgb_light[1, ], rgb_light[2, ], rgb_light[3, ])
}

month_ru <- c("Май", "Июн", "Июл", "Авг", "Сен", "Окт")

theme_article <- function(base_size = 10) {
  theme_bw(base_size = base_size) +
    theme(
      panel.grid.minor = element_blank(),
      panel.grid.major = element_line(colour = "grey90", linewidth = 0.3),
      axis.title       = element_text(size = base_size),
      axis.text        = element_text(size = base_size - 1, colour = "black"),
      legend.title     = element_text(size = base_size - 1),
      legend.text      = element_text(size = base_size - 1),
      plot.title       = element_text(face = "bold", size = base_size + 2,
                                       hjust = 0, margin = margin(b = 4))
    )
}

# --- данные -----------------------------------------------------------------

t7 <- read_csv(file.path(data_dir, "article_t7_stations_monthly.csv"),
               show_col_types = FALSE)

season <- t7 |>
  group_by(station, month) |>
  summarise(
    xch4_station = mean(xch4_station, na.rm = TRUE),
    xch4_forest  = mean(xch4_forest,  na.rm = TRUE),
    delta_ch4    = mean(delta_ch4,    na.rm = TRUE),
    n            = n(),
    .groups = "drop"
  ) |>
  mutate(station = factor(station_ru[station],
                            levels = unname(station_ru)))

# --- панель а: XCH₄ над станциями -------------------------------------------

station_colors_light <- lighten_col(station_colors, 0.55)

fig6a <- ggplot(season, aes(x = month, y = xch4_station,
                             group = station)) +
  geom_line(aes(colour = station), linewidth = 0.9) +
  geom_point(aes(fill = station, shape = station,
                 colour = after_scale(lighten_col(fill, 0.55))),
             size = 3, stroke = 0.2) +
  scale_colour_manual(NULL, values = station_colors) +
  scale_fill_manual(NULL,   values = station_colors) +
  scale_shape_manual(NULL,  values = station_shapes) +
  scale_x_continuous(breaks = 5:10, labels = month_ru) +
  scale_y_continuous(labels = scales::label_number(decimal.mark = ",", big.mark = "")) +
  labs(x = "Месяц", y = expression("XCH"[4]*", ppb"), title = "а") +
  guides(colour = "none", shape = "none",
         fill = guide_legend(override.aes = list(
    shape    = unname(station_shapes),
    fill     = unname(station_colors),
    colour   = unname(station_colors_light),
    stroke   = 0.2,
    size     = 3,
    linetype = 0
  ))) +
  theme_article() +
  theme(legend.position = "bottom",
         legend.key.size = unit(0.35, "cm"),
         legend.margin   = margin(-5, 0, 0, 0))

# --- панель б: ΔCH₄ (столбчатая) --------------------------------------------

fig6b <- ggplot(season, aes(x = month, y = delta_ch4, fill = station)) +
  geom_col(aes(colour = after_scale(lighten_col(fill, 0.55))),
           position = position_dodge(width = 0.8),
           width = 0.75, linewidth = 0.2) +
  geom_hline(yintercept = 0, colour = "black", linewidth = 0.3) +
  scale_fill_manual(NULL, values = station_colors) +
  scale_x_continuous(breaks = 5:10, labels = month_ru) +
  scale_y_continuous(labels = scales::label_number(decimal.mark = ",", big.mark = "")) +
  labs(x = "Месяц", y = expression(Delta*"CH"[4]*", ppb"), title = "б") +
  guides(fill = "none") +
  theme_article()

# --- сборка и экспорт -------------------------------------------------------

fig6 <- fig6a + fig6b + plot_layout(widths = c(1, 1),
                                      guides = "collect") &
  theme(legend.position = "bottom",
        legend.key.size = unit(0.35, "cm"),
        legend.margin   = margin(-5, 0, 0, 0))

ggsave(file.path(out_dir, "fig5_stations.png"), fig6,
       width = 17, height = 9, units = "cm", dpi = 400)

cat("✓ Рис. 5 сохранён в", out_dir, "\n")

# --- средние по всем записям (для текста) -----------------------------------

means <- t7 |>
  group_by(station) |>
  summarise(mean_delta = mean(delta_ch4, na.rm = TRUE),
             sd_delta   = sd(delta_ch4,   na.rm = TRUE),
             n          = n(),
             .groups    = "drop")

cat("\nСредний ΔCH₄ по станциям:\n")
print(means)

cat("\nПики ΔCH₄ по станциям (по месячному сезонному ходу):\n")
peaks <- season |>
  group_by(station) |>
  filter(delta_ch4 == max(delta_ch4)) |>
  select(station, month, delta_ch4, n)
print(peaks)
