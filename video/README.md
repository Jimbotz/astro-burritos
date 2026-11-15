# EarthScope demo video (30 s)

The Space Apps Project Demo (≤ 30 s), built with [HyperFrames](https://hyperframes.heygen.com) 0.9.52: HTML + GSAP rendered to MP4. It is not part of the app; the Next.js build ignores this folder.

- `renders/earthscope-30s-v2.mp4`: the current cut (1920×1080, 30 fps, exactly 30.0 s, voice-over at −16 LUFS). `renders/earthscope-30s.mp4` is the first version (silent, Puebla).
- `index.html`: the app clips (`assets/clips/s1…s4c`, real footage of a local production build of main at 5ac9cd2 for Tehuacán, Puebla, live NASA POWER data) and the voice-over, one `<audio>` per sentence (`assets/voice/vo-1…5.wav`). Each video clip is a whole take; `data-media-start` is its in-point, so re-timing is an edit of attributes, not a re-encode.
- `compositions/overlay.html`: intro card, captions (the voice-over in phrases), highlight frames, the click pulse and the end card. **All the script text is in its `data-composition-variables` block.** Each caption, frame and pulse carries its own `data-start`/`data-duration`; the animation reads them.

| Time | Clip | Voice-over |
|---|---|---|
| 0–3.6 s | s1-globe | "Where is climate turning into risk for water and heat?" (intro card) |
| 3.6–12.05 s | s2-water | "Tehuacán recorded drought five years in a row. In 2023, all four water-stress signals crossed their thresholds." |
| 12.05–18.35 s | s3-heat | "Unusually hot days now fill almost a third of the year, where more than 600,000 people live." |
| 18.35–25.95 s | s4a-checks, s4b-station, s4c-rain | "No claim without evidence: five statistical checks, ground stations, and two NASA rain records." |
| 25.95–30 s | — | "EarthScope: find the signal, plan for the risk." (end card with the disclaimer) |

Facts behind the script (Tehuacán cell 18.5°, −97.5°, 2001–2024, read on 2026-11-15): water lens "Corroborated water signal (priority)", CONAGUA D1+ drought in 5 of the last 5 years, and 2023 is the one year listed in all four water components; warm days (TX90p) 30.9 % of days in 2020–2024, robust trend; 628,759 people in the cell (INEGI 2020); station TEHUACAN r = 0.44 over 24 years.

## Voice-over

`assets/voice/voiceover-raw.mp3` is the team's recording (34.9 s). `recording/build-voice.sh` cleans it and cuts it into one clip per sentence that fits 30 s (pauses tightened, 1.09× with the pitch kept, about −16 LUFS). A new recording needs new sentence bounds in that script (from the loudness envelope at the breaks), then new `data-start`/`data-duration` for the `<audio>` clips, captions and frames: `npx hyperframes transcribe assets/voice/vo-N.wav` gives the word times inside each sentence.

Needs Node ≥ 22, FFmpeg and ffprobe, and internet (GSAP loads from jsDelivr).

```bash
cd video
npx hyperframes preview                                # live preview in the browser
npx hyperframes check                                  # lint the composition
npx hyperframes render --output renders/new.mp4        # render the MP4
```

Keep the numbers as the app shows them and keep the end-card disclaimer. The takes open Tehuacán through a shared link (`?place=Tehuacán, Puebla&lat=18.46&lon=-97.39…`); typing a state in Step 1 would move the point to the state's label point and change every number.

## Re-recording the footage

Only for a new visual; text changes don't need it. Vercel's Security Checkpoint blocks automated browsers, so record a local production build:

```bash
pnpm build && pnpm start -p 3100                       # in the repo root
cd video/recording && npm install && npx playwright-core install chromium
node record.mjs                                        # headed Chromium, one screencast per scene → frames/<scene>/ + marks.json
./build-clips.sh                                       # → ../assets/clips/*.mp4, one whole take per scene
```

`record.mjs` uses the CDP screencast, which captures page pixels only (no browser UI). If a new take moves the clicks, update `data-media-start` in `index.html` and the pulse times and positions in `overlay.html` from `marks.json` (CSS px × 1.2 = video px; pulse time = clip start + click time − media start).
