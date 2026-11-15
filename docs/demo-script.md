# EarthScope · 10-minute demo script

**The question:** *Which climate signals are changing, and can we trust them?*

**Team astro-burritos:** Guillermo Carreto Sánchez, Jayme Said Barbosa Hernández, Samuel Soriano Chávez.

Every number below was produced by the app with live NASA POWER data on 2026-11-15, for 2001–2024. POWER can revise its data, so if a number on screen differs slightly, read the screen, not this script.

## Before you start

- Open the three links below in separate tabs about 2 minutes before the demo. Each one runs its analysis on load, and the cache keeps the second visit fast.
- The links point to the live app. The cross-check cards exist only after this branch is merged and deployed; until then, use `http://localhost:3000` with the same query.
- Keep a screen recording of the full run as a backup. The app has no stored data on purpose, so if NASA POWER is down it shows an error, not numbers.

| Tab | Link | Used in steps |
|---|---|---|
| A · Puebla temperature | https://earthscope-chi.vercel.app/?place=Puebla%2C+Mexico&lat=19.04&lon=-98.20&var=T2M&from=2001&to=2024&layer=trend&country=MEX&state=Puebla&vs=tehuacan | 1–4, 9 |
| B · Puebla rain | https://earthscope-chi.vercel.app/?place=Puebla%2C+Mexico&lat=19.04&lon=-98.20&var=PRECTOTCORR&from=2001&to=2024&layer=anomaly&country=MEX&state=Puebla&vs=tehuacan | 5–6 |
| C · Tlaxcala rain | https://earthscope-chi.vercel.app/?place=Tlaxcala%2C+Mexico&lat=19.40&lon=-98.16&var=PRECTOTCORR&from=2001&to=2024&layer=anomaly&country=MEX&state=Tlaxcala&vs=tehuacan | 7–8 |

Shared links run the analysis but do not scroll. Scroll down to the section named in each step.

## Run of show

| Step | Time | Where | What happens on screen |
|---|---|---|---|
| 1 | 0:00–0:45 | Tab A, top of the page | The question and the 3D globe |
| 2 | 0:45–1:30 | Step 1 panel, globe, 2D map | Puebla selected; the map colors each cell by its trend |
| 3 | 1:30–2:00 | (narration) | Why the highlands matter: frost and warm nights |
| 4 | 2:00–3:30 | Results, All climate signals, Two places card | Temperature, warm nights, coldest night; Puebla vs. Tehuacán |
| 5 | 3:30–4:15 | Tab B, Results | Rain: series and anomalies, no trend claim |
| 6 | 4:15–5:15 | Tab B, Two NASA rain records card | MERRA-2 vs. GPM IMERG for Puebla: Inconclusive |
| 7 | 5:15–6:30 | Tab C, Two NASA rain records card | A real disagreement in Tlaxcala |
| 8 | 6:30–7:15 | Same card, rules line and reasons | How Agree / Disagree / Inconclusive is decided |
| 9 | 7:15–8:30 | Tab A, Results, Statistical summary | 95% interval, Mann–Kendall, the five checks |
| 10 | 8:30–9:30 | Evidence file | Spatial limits and data provenance |
| — | 9:30–10:00 | | Buffer for one question |

## Script

### 1 · The question (0:00–0:45)

> Everyone hears that the climate is changing. Our question is sharper: **which climate signals are changing, and can we trust them?** EarthScope turns NASA data into evidence a student can check. It finds the trend, and it refuses to make a claim the data cannot support.

### 2 · Pick a place (0:45–1:30)

Point at the Step 1 panel, then the globe and the 2D map.

> We start in Puebla, in the central Mexican highlands. You can pick any country or state on the globe. The 2D map shows the native NASA POWER cells inside the state, each 0.5° by 0.625°, about 55 by 65 km. We never pretend a cell is a city or a weather station.

### 3 · Why it matters here (1:30–2:00)

Narration only. The app has no sector selector.

> This is farming country at more than 2,000 metres. For a farmer here, two questions matter: are nights getting warmer, and is the coldest night of the year (the frost risk) changing?

### 4 · Temperature and warm nights (2:00–3:30)

Scroll to **Results**. Then, in **All climate signals**, click *Warm nights* and *Coldest night of the year*.

> Mean air temperature in this cell rose **+0.45 °C per decade** since 2001. That is not just a line on a chart: it passed **all five robustness checks**, so the app calls it a **robust trend**.
>
> Warm nights, the share of nights warmer than 9 in 10 nights of the same date in 1991–2020, rose **+5.5 percentage points per decade**, also robust. The coldest night of the year warmed **+1.1 °C per decade**.

Scroll to **Two places, same rules**. It opens on Tehuacán.

> Is this local? Tehuacán, about 110 km to the southeast, warmed **+0.62 °C per decade**. Same tests, same rules: the card says **Same signal**. Now switch the variable to *Warm days*. Tehuacán has a robust rise, and Puebla has none we can detect. Part of the signal is shared, part is local.

### 5 · Precipitation (3:30–4:15)

Switch to tab B. Scroll to **Results**.

> Rain is different. NASA POWER follows the rainy season well, but against weather stations it barely matches the year-to-year changes. So for rain EarthScope shows the series, the anomalies and the seasons, and **never** an arrow up or down.

### 6 · POWER against IMERG (4:15–5:15)

Scroll to **Two NASA rain records**.

> Can a second NASA record help? This card brings in **GPM IMERG**, built from satellites, through the same public NASA POWER API, with no login. We average IMERG’s 0.1° pixels over the exact same cell. Then we ask three questions.
>
> Same amount of rain? **Yes**: 884 against 913 mm a year. Same wet and dry years? **Yes**, they partly agree. Same trend? **Not settled**: neither record detects one. MERRA-2 sits just above the 0.05 limit, so it does not count. The verdict is **Inconclusive**.

### 7 · A real disagreement (5:15–6:30)

Switch to tab C (or press the **Two rain records disagree** example, which scrolls to the card).

> Now Tlaxcala, the state next door. Look at the blue line. **MERRA-2 alone shows rain rising +185 mm per decade**, with a p-value below 0.001. A tool that trusts one source would announce “more rain in Tlaxcala”.
>
> The purple line is GPM IMERG for the same cell: **−27 mm per decade**, not significant. Their 95% intervals do not even overlap. EarthScope says **Disagree** and makes no rain claim.

### 8 · How the verdict is decided (6:30–7:15)

Point at the rules line under the card and open **Why trust this result, or not**.

> The rules were fixed before we looked at any result. A record detects a trend when its Hamed–Rao p is below 0.05.
> - **Agree:** both detect a trend in the same direction and their intervals overlap.
> - **Disagree:** the directions are opposite, or the intervals do not overlap.
> - **Inconclusive:** everything else.
>
> The card also tells you why to be careful. The two records are only partly independent. This period crosses 2014, when IMERG changed satellites. And the station check already showed that this rain record is weak year to year.

### 9 · Confidence interval and Mann–Kendall (7:15–8:30)

Back to tab A. Scroll to the **Statistical summary**.

> Here is the evidence behind “robust”:
> - the trend, +0.45 °C per decade;
> - the **95% confidence interval**, +0.23 to +0.70, which does not include zero;
> - **Mann–Kendall** with the Hamed–Rao correction for autocorrelation, p = 0.009;
> - a q-value that controls false discoveries across all 13 variables;
> - five of five robustness criteria.
>
> When a test finds nothing, we show the **minimum detectable trend**, because “not detected” is not “no change”.

### 10 · Limits and provenance (8:30–9:30)

Scroll to the **Evidence file** and open *Every request, spatial support…*.

> Two honest limits. First, every value describes a whole MERRA-2 cell, here at 2,147 metres, not a city or a station. Second, 24 years is short, so some real changes are too small to detect yet.
>
> Every number links to the exact NASA POWER request that produced it. The sources are MERRA-2 and GPM IMERG through NASA POWER, validated offline against NOAA weather stations. Nothing needs an account, and you can run it yourself from our repository.

Close with:

> EarthScope does not just find climate signals. It tells you which ones you can trust.

## If something goes wrong

| Problem | What to do |
|---|---|
| NASA POWER is slow (spinner over 20 s) | Keep talking over step 3; the next tab is usually cached |
| NASA POWER returns an error | Say that the app never shows stored numbers, press **Try again**, and switch to the backup recording if it fails twice |
| A number differs from this script | Read the screen. POWER can revise data; the verdicts are what matter |
| The rain card shows an error about IMERG’s years | The period has fewer than 10 years: set it back to 2001–2024 |
