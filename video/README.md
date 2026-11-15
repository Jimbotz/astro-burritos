# EarthScope demo video (30 s)

The Space Apps Project Demo (≤ 30 s), built with [HyperFrames](https://hyperframes.heygen.com) 0.9.52: HTML + GSAP rendered to MP4. It is not part of the app; the Next.js build ignores this folder.

- `renders/earthscope-30s.mp4`: the current render (1920×1080, 30 fps, silent, exactly 30.0 s).
- `index.html`: the 9 app clips on the timeline (`assets/clips/s1…s9`, real footage of main at 8034bb0, live NASA POWER data).
- `compositions/overlay.html`: intro card, captions, guiding-question banners, click pulses and the end card. **All the script text is in its `data-composition-variables` block**, so a copy change is an edit there plus a re-render.

| Time | Clip | What it shows |
|---|---|---|
| 0–3.5 s | s1-globe | Intro: the challenge (Be an Earth System Trend Detective!) and the problem (noisy climate data) |
| 3.5–6.5 s | s2-query | Step 1: pick *Coldest night of the year*, press Analyze |
| 6.5–9.5 s | s3-map | Question 2, *where*: Step 3 map of Puebla's cells |
| 9.5–12.5 s | s5-signals | Question 2, *when*: warm nights +5.5 pp/decade and coldest night +1.1 °C/decade (robust); hot days not detectable |
| 12.5–14.5 s | s4-results | Results: statistical summary, five robustness checks |
| 14.5–18.5 s | s6-water | Question 1: humidity, soil and rain tabs; no persistent decline, rain without a trend claim |
| 18.5–21.5 s | s7-crosscheck | MERRA-2 vs GPM IMERG rain, and Puebla vs Tehuacán |
| 21.5–24 s | s8-projection | Exploratory projection, blocked by its back-test for this variable |
| 24–26 s | s9-evidence | Evidence file |
| 26–30 s | — | End card with the "not an official NASA product" disclaimer |

Needs Node ≥ 22, FFmpeg and ffprobe, and internet (GSAP loads from jsDelivr).

```bash
cd video
npx hyperframes preview                                # live preview in the browser
npx hyperframes check                                  # lint the composition
npx hyperframes render --output renders/new.mp4        # render the MP4
```

Keep the numbers as the app shows them (Puebla cell, 2001–2024, read on 2026-11-15) and keep the end-card disclaimer.

## Re-recording the footage

Only for a new visual; text changes don't need it. Vercel's Security Checkpoint blocks automated browsers, so record a local production build:

```bash
pnpm build && pnpm start -p 3100                       # in the repo root
cd video/recording && npm install && npx playwright-core install chromium
node record.mjs                                        # headed Chromium, one screencast per scene → frames/<scene>/ + marks.json
./build-clips.sh                                       # → ../assets/clips/*.mp4, trimmed to their slots
```

`record.mjs` uses the CDP screencast, which captures page pixels only (no browser UI). If a new take moves the clicks, update the trims in `build-clips.sh` and the pulse times and positions in `overlay.html` from `marks.json` (CSS px × 1.2 = video px).
