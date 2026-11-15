# EarthScope demo video (30 s)

The Space Apps Project Demo (≤ 30 s), built with [HyperFrames](https://hyperframes.heygen.com) 0.9.52: HTML + GSAP rendered to MP4. It is not part of the app; the Next.js build ignores this folder.

- `renders/earthscope-test-30s.mp4`: the current render (1920×1080, 30 fps, silent).
- `index.html`: the 9 app clips on the timeline (`assets/clips/s1…s9`, real footage of the app, live NASA POWER data).
- `compositions/overlay.html`: captions, callouts, click pulses and the end card. **All the script text is in its `data-composition-variables` block**, so a copy change is an edit there plus a re-render.

Needs Node ≥ 22, FFmpeg and ffprobe (`brew install ffmpeg`), and internet (GSAP loads from jsDelivr).

```bash
cd video
npx hyperframes preview                                # live preview in the browser
npx hyperframes check                                  # lint the composition
npx hyperframes render --output renders/new.mp4        # render the MP4
```

Keep the numbers as the app shows them (Puebla 2001–2024: +0.45 °C/decade, robust, 5 of 5 checks) and keep the end-card disclaimer.

## Re-recording the footage

Only for a new visual; text changes don't need it. Vercel's Security Checkpoint blocks automated browsers, so record a local production build:

```bash
pnpm build && pnpm start -p 3100                       # in the repo root
cd video/recording && npm install && npx playwright-core install chromium
node record.mjs                                        # ~90 s headed Chromium take → frames/ + marks.json
./build-clips.sh                                       # → take.mp4 → ../assets/clips/*.mp4
```

`record.mjs` uses the CDP screencast, which captures page pixels only (no browser UI, nothing else on screen). If the take differs, update the cut times in `build-clips.sh` from `marks.json`.
