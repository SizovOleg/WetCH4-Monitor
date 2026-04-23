# =============================================================================
# Рис. 4. ΔCH₄ по природным зонам и связь с температурой воздуха
# Источник данных: d:\test\wetland_zapsib\article\data\article_t1_zonal_stats.csv
# =============================================================================

library(ggplot2)
library(dplyr)
library(readr)
library(patchwork)
library(ggrepel)

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

t1 <- read_csv(file.path(data_dir, "article_t1_zonal_stats.csv"),
               show_col_types = FALSE) |>
  mutate(zone_name    = factor(zone_name, levels = zone_order),
         zone_label   = factor(zone_ru[as.character(zone_name)],
                                levels = unname(zone_ru)))

# --- панель а: столбчатая ΔCH₄ по зонам -------------------------------------

fig4a <- ggplot(t1, aes(x = zone_label, y = delta_ch4_ppb, fill = zone_name)) +
  geom_col(width = 0.7, colour = "black", linewidth = 0.3) +
  geom_hline(yintercept = 0, colour = "black", linewidth = 0.3) +
  geom_text(aes(label = formatC(delta_ch4_ppb, format = "f", digits = 1, decimal.mark = ","),
                vjust = ifelse(delta_ch4_ppb >= 0, -0.4, 1.2)),
            size = 2.8) +
  scale_fill_manual(values = zone_colors, guide = "none") +
  scale_y_continuous(expand = expansion(mult = c(0.15, 0.15)),
                     labels = scales::label_number(decimal.mark = ",", big.mark = "")) +
  labs(x = NULL, y = expression(Delta*"CH"[4]*", ppb"), title = "а") +
  theme_article() +
  theme(axis.text.x = element_text(angle = 35, hjust = 1))

# --- панель б: scatter ΔCH₄ vs T_air, размер пузыря ~ % болот ---------------

fig4b <- ggplot(t1, aes(x = t_air_wetland_c, y = delta_ch4_ppb,
                          fill = zone_name,
                          size = wetland_fraction_pct)) +
  geom_hline(yintercept = 0, colour = "grey50",
             linewidth = 0.3, linetype = "dashed") +
  geom_point(shape = 21, colour = "black", stroke = 0.4, alpha = 0.9) +
  geom_text_repel(aes(label = zone_label),
                   size = 2.8, box.padding = 0.4, max.overlaps = Inf,
                   show.legend = FALSE, segment.colour = NA,
                   nudge_y = ifelse(t1$zone_name == "Middle taiga", -1.2,
                             ifelse(t1$zone_name %in% c("Forest-tundra",
                                                        "Northern taiga"),
                                    -1.8,
                             ifelse(t1$zone_name == "Tundra", -1.45, 0)))) +
  scale_fill_manual(values = zone_colors, guide = "none") +
  scale_size_continuous("Заболоч., %",
                         range = c(2.5, 10),
                         breaks = c(5, 20, 40, 60)) +
  scale_x_continuous(limits = c(4, 17),
                     labels = scales::label_number(decimal.mark = ",", big.mark = "")) +
  scale_y_continuous(labels = scales::label_number(decimal.mark = ",", big.mark = "")) +
  labs(x = "Ср. температура воздуха, °C (май–октябрь)",
       y = expression(Delta*"CH"[4]*", ppb"), title = "б") +
  theme_article() +
  theme(legend.position = "right",
         legend.key.size = unit(0.4, "cm"),
         axis.title.x = element_text(vjust = 7.9, margin = margin(t = -10)))

# --- сборка и экспорт -------------------------------------------------------

fig4 <- fig4a + fig4b + plot_layout(widths = c(1, 1.15))

ggsave(file.path(out_dir, "fig4_zonal.png"), fig4,
       width = 18, height = 9, units = "cm", dpi = 400)

cat("✓ Рис. 4 сохранён в", out_dir, "\n")

# --- регрессия ΔCH₄ ~ заболоченность × температура --------------------------

m <- lm(delta_ch4_ppb ~ I(wetland_fraction_pct * t_air_wetland_c), data = t1)
cat("\nРегрессия ΔCH₄ ~ wetland_fraction × T_air:\n")
cat("  R² =", round(summary(m)$r.squared, 3), "\n")
cat("  p  =", format.pval(summary(m)$coefficients[2, 4], digits = 3), "\n")
