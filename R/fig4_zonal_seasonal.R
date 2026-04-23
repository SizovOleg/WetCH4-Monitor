# =============================================================================
# Рис. 4. Сезонный ход ΔCH₄ по 8 природным зонам ЗСР
# Источник данных: article_t2_zonal_seasonal.csv
# =============================================================================

library(ggplot2)
library(dplyr)
library(readr)

# --- настройки ---------------------------------------------------------------

data_dir <- "article/data"
out_dir  <- "article/figures"
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

zone_order <- c("Tundra", "Forest-tundra", "Northern taiga", "Middle taiga",
                "Southern taiga", "Subtaiga", "Forest-steppe", "Steppe")

zone_ru <- c("Tundra"         = "Тундра",
             "Forest-tundra"  = "Лесотундра",
             "Northern taiga" = "Сев. тайга",
             "Middle taiga"   = "Средн. тайга",
             "Southern taiga" = "Южн. тайга",
             "Subtaiga"       = "Подтайга",
             "Forest-steppe"  = "Лесостепь",
             "Steppe"         = "Степь")

zone_colors <- c("Tundra"         = "#5E81AC",
                 "Forest-tundra"  = "#88C0D0",
                 "Northern taiga" = "#2E7D32",
                 "Middle taiga"   = "#4CAF50",
                 "Southern taiga" = "#A5D6A7",
                 "Subtaiga"       = "#FFC107",
                 "Forest-steppe"  = "#FF9800",
                 "Steppe"         = "#D84315")

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

t2 <- read_csv(file.path(data_dir, "article_t2_zonal_seasonal.csv"),
               show_col_types = FALSE) |>
  mutate(zone_name  = factor(zone_name, levels = zone_order),
         zone_label = factor(zone_ru[as.character(zone_name)],
                              levels = unname(zone_ru)))

# --- рисунок ----------------------------------------------------------------

zone_colors_named <- setNames(zone_colors, unname(zone_ru))
zone_colors_light <- lighten_col(zone_colors_named, 0.55)

fig5 <- ggplot(t2, aes(x = month, y = delta_ch4,
                         group  = zone_label)) +
  geom_hline(yintercept = 0, colour = "black", linewidth = 0.3) +
  geom_line(aes(colour = zone_label), linewidth = 0.8) +
  geom_point(aes(fill = zone_label,
                 colour = after_scale(lighten_col(fill, 0.55))),
             shape = 21, size = 2.8, stroke = 0.2) +
  scale_colour_manual("Природная зона", values = zone_colors_named) +
  scale_fill_manual(values = zone_colors_named, guide = "none") +
  scale_x_continuous(breaks = 5:10, labels = month_ru) +
  scale_y_continuous(labels = scales::label_number(decimal.mark = ",", big.mark = "")) +
  labs(x = "Месяц", y = expression(Delta*"CH"[4]*", ppb")) +
  guides(colour = guide_legend(override.aes = list(
    shape    = 21,
    fill     = unname(zone_colors_named),
    colour   = unname(zone_colors_light),
    stroke   = 0.2,
    size     = 3,
    linetype = 0
  ))) +
  theme_article() +
  theme(legend.position = "right",
         legend.key.size = unit(0.5, "cm"))

# --- экспорт ----------------------------------------------------------------

ggsave(file.path(out_dir, "fig4_zonal_seasonal.png"), fig5,
       width = 16, height = 10, units = "cm", dpi = 400)

cat("✓ Рис. 4 сохранён в", out_dir, "\n")

# --- пики по зонам (для обсуждения в тексте) --------------------------------

peaks <- t2 |>
  group_by(zone_name) |>
  filter(delta_ch4 == max(delta_ch4)) |>
  select(zone_name, month, delta_ch4) |>
  arrange(match(zone_name, zone_order))

cat("\nМаксимум ΔCH₄ по зонам:\n")
print(peaks)
