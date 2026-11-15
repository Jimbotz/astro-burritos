# EarthScope methodology

EarthScope is an independent NASA Space Apps project. The MVP uses the NASA POWER Monthly and Annual API at a single point location for two parameters:

- `T2M`: temperature at 2 meters. NASA POWER reports this monthly in degrees Celsius.
- `PRECTOTCORR`: corrected precipitation. NASA POWER reports the monthly value in `mm/day`, so EarthScope converts it to a monthly total by multiplying by the actual number of calendar days before summing the year.

## Processing

1. The server validates latitude, longitude, parameter, and a complete year range.
2. The API response is kept as monthly observations. POWER's `YYYY13` annual convenience record is excluded so the annual calculation is explicit.
3. Fill values (reported by POWER in the response header, normally `-999`) and non-numeric values are excluded. Missing months are not replaced with zero.
4. Annual temperature is a day-weighted mean of valid monthly values. Annual precipitation is the sum of each valid monthly `mm/day` value multiplied by the real calendar days in that month.
5. A year is eligible for the trend only when all twelve months are present (12/12; an 11-month rain total would bias the year low, audit finding A1). At least three eligible years are required.
6. The baseline trend is ordinary least squares on annual aggregates: `y = a + b * year`. EarthScope reports the OLS slope, R², a classical 95% interval and a two-sided t-test p-value when residual variance is estimable.
7. EarthScope also reports Mann–Kendall with tie correction, Sen's slope and a lag-1 residual autocorrelation screen as non-parametric/diagnostic checks. The current Mann–Kendall and OLS intervals are baseline results; they are not corrected for serial correlation and are not adjusted for multiple testing in the single-series endpoint.

## Interpretation limits

NASA POWER's meteorological parameters are derived from the MERRA-2 assimilation model; they are not presented as direct satellite measurements. A p-value below 0.05 is evidence against a zero slope under this model and its assumptions; it is not causality, an environmental alert, or a forecast. A p-value at or above 0.05 does not prove that no change exists. Classical OLS uncertainty may be optimistic when annual residuals are autocorrelated, so the interface states this limitation.

No IMERG, GIBS, causal attribution, prediction, or AI-generated scientific interpretation is enabled in the MVP.
