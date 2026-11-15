/** Plain-language definitions for the statistical terms on the page (audience: high-school and college students). */
export const GLOSSARY = {
  hamedRao: 'Hamed–Rao p-value: how likely a trend this strong would be if nothing were really changing, corrected because one year tends to resemble the next. Below 0.05 is usually called significant.',
  qValue: 'q-value: the p-value adjusted because 13 variables are tested at once (Benjamini–Hochberg), so that false alarms stay near 5% of the signals reported.',
  mannKendall: 'Mann–Kendall p-value: a test that only asks whether values tend to go up or down over the years, without assuming a straight line. Shown without the autocorrelation correction, for reference.',
  ci95: '95% confidence interval: the range where the true rate of change probably lies. If it does not include 0, the direction of the change is clear.',
  minimumDetectable: 'Smallest detectable trend: the slowest change these years of data could reliably reveal. A real change smaller than this can exist without being detected.',
  relevance: 'Relevance threshold: the smallest change per decade considered practically important for this variable. Smaller significant trends read as “significant but small”.',
  sensitivity: 'Sensitivity window: the same trend computed over a different set of years. A robust signal keeps its direction.',
  robustness: 'Robustness criteria: five checks that must all pass for a “robust trend”: multiple-testing control, an interval that excludes zero, a test after removing year-to-year memory (pre-whitening), removing any one year, and a different window.',
  predictionInterval: '95% prediction interval: where a single future year would fall 95 times out of 100 if the straight line kept going. It is much wider than the uncertainty of the line itself.',
  rmse: 'RMSE (root-mean-square error): the typical size of a prediction miss, in the variable’s own unit. Lower is better.',
  fieldFdr: 'Field FDR: the cells are tested together so that, among the cells marked significant, at most about 10% are expected to be false alarms.',
} as const

export type GlossaryKey = keyof typeof GLOSSARY
