#!/usr/bin/env bash
# Turns record.mjs output (frames/<scene>/ + marks.json) into one clip per scene in ../assets/clips (1920x1080, 30 fps).
# Each scene keeps its real timing: every frame lasts until the next one (the screencast only sends changed frames).
set -euo pipefail
cd "$(dirname "$0")"
PY=$(command -v python3 || command -v python)
"$PY" - <<'PY'
import json
d = json.load(open('marks.json'))
for s in d['scenes']:
    fr = s['frames']; t0 = s['t0']
    out = ['ffconcat version 1.0']
    for i, f in enumerate(fr):
        start = max(f['ts'], t0)
        end = fr[i + 1]['ts'] if i + 1 < len(fr) else max(s.get('t1', 0), start + 0.5)
        out += [f"file '{f['file'].split('/', 2)[2]}'", f"duration {max(end - start, 0.001):.4f}"]
    out.append(f"file '{fr[-1]['file'].split('/', 2)[2]}'")
    open(f"frames/{s['name']}/list.ffconcat", 'w').write('\n'.join(out) + '\n')
    print(s['name'])
PY
mkdir -p ../assets/clips
rm -f ../assets/clips/*.mp4
for dir in frames/*/; do
  name=$(basename "$dir")
  ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$dir/list.ffconcat" \
    -vf "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p" -an -c:v libx264 -preset slow -crf 17 -movflags +faststart "../assets/clips/$name.mp4"
done
# ponytail: no trimming here. Each clip keeps its whole take; index.html picks the in-point with data-media-start.
ls -la ../assets/clips
