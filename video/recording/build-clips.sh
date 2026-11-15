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
        end = fr[i + 1]['ts'] if i + 1 < len(fr) else start + 0.5
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
# Trim each take to its slot on the 30 s timeline (start offset, length in s), matching index.html.
trim() { ffmpeg -hide_banner -loglevel error -y -ss "$2" -i "../assets/clips/$1.mp4" -t "$3" -an -c:v libx264 -preset slow -crf 17 -r 30 -movflags +faststart t.mp4 && mv t.mp4 "../assets/clips/$1.mp4"; }
trim s1-globe 0.5 3.5; trim s2-query 0.8 3; trim s3-map 0.5 3; trim s5-signals 0.5 3; trim s4-results 1.5 2
trim s6-water 0.8 4; trim s7-crosscheck 0.5 3; trim s8-projection 0.5 2.5; trim s9-evidence 0.5 2
ls -la ../assets/clips
