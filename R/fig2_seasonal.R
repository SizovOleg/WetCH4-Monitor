# =============================================================================
# Рис. 2. Сезонный ход XCH₄ и ΔCH₄ (полный AOI, среднее 2019–2025)
# Источник данных: article_t5_full_aoi_monthly.csv
# Метрика: среднее по годам значения из месячных композитов TROPOMI
# =============================================================================

library(ggplot2)
library(dplyr)
library(readr)
library(patchwork)

# --- настройки ---------------------------------------------------------------

data_dir <- "article/data"
out_dir  <- "article/figures"
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

month_ru <- c("Май", "Июн", "Июл", "Авг", "Сен", "Окт")

theme_article <- function(base_size = 10) {
  theme_bw(base_size = base_size) +
    theme(
      panel.grid.minor = element_blank(),
      panel.grid.major = element_line(colour = "grey90", linewidth = 0.3),
      axis.title       = element_text(size = base_size),
      axis.text        = element_text(size = base_size - 1, colour = "black"),
      legend.title     = element_blank(),
      legend.text      = element_text(size = base_size - 1),
      legend.position  = "top",
      legend.margin    = margin(0, 0, -5, 0),
      plot.title       = element_text(face = "bold", size = base_size + 2,
                                       hjust = 0, margin = margin(b = 4))
    )
}

# --- данные -----------------------------------------------------------------

t5 <- read_csv(file.path(data_dir, "article_t5_full_aoi_monthly.csv"),
               show_col_types = FALSE)

season <- t5 |>
  group_by(month) |>
  summarise(
    delta_ch4    = mean(delta_ch4,    na.rm = TRUE),
    xch4_wetland = mean(xch4_wetland, na.rm = TRUE),
    xch4_forest  = mean(xch4_forest,  na.rm = TRUE),
    .groups = "drop"
  )

# --- панель а: XCH₄ над болотами и лесным фоном -----------------------------

fig3a <- ggplot(season, aes(x = month)) +
  geom_line(aes(y = xch4_wetland, colour = "Болота"),     linewidth = 0.9,
            show.legend = FALSE) +
  geom_line(aes(y = xch4_forest,  colour = "Фон (леса)"), linewidth = 0.9,
            show.legend = FALSE) +
  geom_point(aes(y = xch4_wetland, fill = "Болота"),
             colour = "white", size = 3.2, shape = 21, stroke = 0.8) +
  geom_point(aes(y = xch4_forest,  fill = "Фон (леса)"),
             colour = "white", size = 3.2, shape = 22, stroke = 0.8) +
  scale_colour_manual(values = c("Болота" = "#00BCD4",
                                  "Фон (леса)" = "#2E7D32")) +
  scale_fill_manual(  values = c("Болота" = "#00BCD4",
                                  "Фон (леса)" = "#2E7D32")) +
  scale_x_continuous(breaks = 5:10, labels = month_ru) +
  scale_y_continuous(labels = scales::label_number(decimal.mark = ",", big.mark = "")) +
  labs(x = "Месяц", y = expression("XCH"[4]*", ppb"), title = "а") +
  guides(fill = guide_legend(override.aes = list(
           shape  = c(21, 22),
           size   = 3.5,
           stroke = 0.8,
           colour = "white"
         ))) +
  theme_article() +
  theme(legend.position = c(0.90, 0.05),
        legend.justification = c(1, 0),
        legend.background = element_rect(fill = alpha("white", 0.85),
                                         colour = "grey80", linewidth = 0.3),
        legend.margin = margin(6, 10, 6, 10))

# --- панель б: ΔCH₄ с подписями значений ------------------------------------

fig3b <- ggplot(season, aes(x = month, y = delta_ch4)) +
  geom_col(aes(fill = delta_ch4), width = 0.65,
           colour = "black", linewidth = 0.3, show.legend = FALSE) +
  scale_fill_gradient(low = "#90CAF9", high = "#0D47A1") +
  geom_text(aes(label = formatC(delta_ch4, format = "f", digits = 1, decimal.mark = ",")),
            vjust = -0.5, size = 3) +
  geom_hline(yintercept = 0, colour = "black", linewidth = 0.3) +
  scale_x_continuous(breaks = 5:10, labels = month_ru) +
  scale_y_continuous(expand = expansion(mult = c(0, 0.15)),
                     labels = scales::label_number(decimal.mark = ",", big.mark = "")) +
  labs(x = "Месяц", y = expression(Delta*"CH"[4]*", ppb"), title = "б") +
  theme_article() +
  theme(legend.position = "none")

# --- сборка и экспорт -------------------------------------------------------

fig3 <- fig3a / fig3b + plot_layout(heights = c(1, 1))

ggsave(file.path(out_dir, "fig2_seasonal.png"), fig3,
       width = 14, height = 13, units = "cm", dpi = 400)

cat("✓ Рис. 2 сохранён в", out_dir, "\n")
cat("ΔCH₄ по месяцам (ppb):",
    paste(sprintf("%.1f", season$delta_ch4), collapse = ", "), "\n")
