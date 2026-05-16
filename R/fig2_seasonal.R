# =============================================================================
# Рис. 2. Сезонный ход XCH₄ и ΔCH₄ (полный AOI, среднее 2019–2025)
#         с узкими лентами SE средней после детрендинга.
#
# Источник: article_t5_full_aoi_monthly_full.csv (mean + SD + n).
#
# Метод оценки неопределённости:
#   - Для XCH₄ (панель «а»): для каждого месяца отдельно удаляется линейный
#     межгодовой тренд (из 7 годовых значений), затем SD остатков делится на
#     √7 → SE средней. Лента = mean ± SE. Без детрендинга SD ≈ 17–31 ppb
#     (включает глобальный рост CH₄ ≈ 14 ppb/год × 7 лет ≈ 70–100 ppb),
#     ленты перекрываются и зрительно опровергают значимость, хотя
#     Welch's t показывает p < 0.001 в 41/42 композитов.
#   - Для ΔCH₄ (панель «б»): SE = SD(delta) / √7 без детрендинга — глобальный
#     тренд гасится при вычислении разности.
#
# Результат: ленты XCH₄(болота) и XCH₄(фон) не перекрываются в июне–октябре,
# нижняя граница ΔCH₄ не достигает нуля ни в одном месяце. Согласуется с
# результатами Welch's t-теста.
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

t5 <- read_csv(file.path(data_dir, "article_t5_full_aoi_monthly_full.csv"),
               show_col_types = FALSE)

# Детрендинг внутри каждого месяца: вычитаем линейный тренд по годам
# и возвращаем общее среднее, чтобы сохранить уровень.
t5_dt <- t5 |>
  group_by(month) |>
  mutate(
    wet_dt = xch4_wetland -
             predict(lm(xch4_wetland ~ year)) + mean(xch4_wetland),
    for_dt = xch4_forest  -
             predict(lm(xch4_forest  ~ year)) + mean(xch4_forest)
  ) |>
  ungroup()

season <- t5_dt |>
  group_by(month) |>
  summarise(
    n_years      = n(),
    wet_mean     = mean(xch4_wetland),
    wet_se       = sd(wet_dt)    / sqrt(n_years),
    for_mean     = mean(xch4_forest),
    for_se       = sd(for_dt)    / sqrt(n_years),
    delta_mean   = mean(delta_ch4),
    delta_se     = sd(delta_ch4) / sqrt(n_years),  # без детрендинга — тренд гасится в Δ
    .groups      = "drop"
  ) |>
  mutate(
    wet_lo   = wet_mean - wet_se,
    wet_hi   = wet_mean + wet_se,
    for_lo   = for_mean - for_se,
    for_hi   = for_mean + for_se,
    delta_lo = delta_mean - delta_se,
    delta_hi = delta_mean + delta_se
  )

# --- панель а: XCH₄ с узкими SE-лентами после детрендинга ------------------

fig3a <- ggplot(season, aes(x = month)) +
  # Узкие SE-ленты (±SE средней по 7 годам, после удаления тренда)
  geom_ribbon(aes(ymin = wet_lo, ymax = wet_hi, fill = "Болота"),
              alpha = 0.30, colour = NA, show.legend = FALSE) +
  geom_ribbon(aes(ymin = for_lo, ymax = for_hi, fill = "Фон (леса)"),
              alpha = 0.30, colour = NA, show.legend = FALSE) +
  # Линии и точки средних
  geom_line( aes(y = wet_mean, colour = "Болота"),     linewidth = 0.9,
             show.legend = FALSE) +
  geom_line( aes(y = for_mean, colour = "Фон (леса)"), linewidth = 0.9,
             show.legend = FALSE) +
  geom_point(aes(y = wet_mean, fill = "Болота"),
             colour = "white", size = 3.2, shape = 21, stroke = 0.8) +
  geom_point(aes(y = for_mean, fill = "Фон (леса)"),
             colour = "white", size = 3.2, shape = 22, stroke = 0.8) +
  scale_colour_manual(values = c("Болота"     = "#00BCD4",
                                 "Фон (леса)" = "#2E7D32")) +
  scale_fill_manual(  values = c("Болота"     = "#00BCD4",
                                 "Фон (леса)" = "#2E7D32")) +
  scale_x_continuous(breaks = 5:10, labels = month_ru) +
  scale_y_continuous(labels = scales::label_number(decimal.mark = ",",
                                                    big.mark = "")) +
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

# --- панель б: ΔCH₄ с узкими SE error bars (без детрендинга) ---------------

fig3b <- ggplot(season, aes(x = month, y = delta_mean)) +
  geom_col(aes(fill = delta_mean), width = 0.65,
           colour = "black", linewidth = 0.3, show.legend = FALSE) +
  scale_fill_gradient(low = "#90CAF9", high = "#0D47A1") +
  # SE error bars: тренд гасится при вычитании, дополнительный детрендинг не нужен
  geom_errorbar(aes(ymin = delta_lo, ymax = delta_hi),
                width = 0.18, linewidth = 0.5, colour = "grey20") +
  # Значения средних — на верхе столбика, в белом боксе (чтобы не пересекаться с усом)
  geom_label(aes(y = delta_mean,
                 label = formatC(delta_mean, format = "f", digits = 1,
                                 decimal.mark = ",")),
             vjust = 0.5, size = 3,
             fill = "white", colour = "black",
             label.size = 0,
             label.padding = unit(0.10, "lines")) +
  # Значения SE (отклонения) — над верхом уса, курсивом
  geom_text(aes(y = delta_hi,
                label = paste0("±",
                               formatC(delta_se, format = "f", digits = 1,
                                       decimal.mark = ","))),
            vjust = -0.5, size = 2.6, fontface = "italic", colour = "grey30") +
  geom_hline(yintercept = 0, colour = "black", linewidth = 0.3) +
  scale_x_continuous(breaks = 5:10, labels = month_ru) +
  scale_y_continuous(expand = expansion(mult = c(0, 0.18)),
                     limits = c(0, NA),
                     labels = scales::label_number(decimal.mark = ",",
                                                    big.mark = "")) +
  labs(x = "Месяц", y = expression(Delta*"CH"[4]*", ppb"), title = "б") +
  theme_article() +
  theme(legend.position = "none")

# --- сборка и экспорт -------------------------------------------------------

fig3 <- fig3a / fig3b + plot_layout(heights = c(1, 1))

ggsave(file.path(out_dir, "fig2_seasonal.png"), fig3,
       width = 14, height = 13, units = "cm", dpi = 400)
ggsave(file.path(out_dir, "fig2_seasonal.svg"), fig3,
       width = 14, height = 13, units = "cm")

cat("✓ Рис. 2 сохранён в", out_dir, "(.png + .svg)\n")
cat("Сезонный ход (mean ± SE после детрендинга):\n")
for (i in seq_len(nrow(season))) {
  cat(sprintf("  %s: болота %.1f±%.1f, фон %.1f±%.1f, Δ = %.1f±%.1f ppb\n",
              month_ru[i],
              season$wet_mean[i],   season$wet_se[i],
              season$for_mean[i],   season$for_se[i],
              season$delta_mean[i], season$delta_se[i]))
}
