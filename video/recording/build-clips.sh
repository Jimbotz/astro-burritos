#!/usr/bin/env bash
# Turns record.mjs output (frames/ + marks.json) into take.mp4, then cuts the 9 clips into ../assets/clips.
# The cut times (seconds in take.mp4) and crops (take px, 2560x1440) match the take of 2026-11-15; a new take needs new times (see marks.json).
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
import json
d=json.load(open('marks.json')); fr=d['frames']; t0=d['t0']
first=max(i for i,f in enumerate(fr) if f['ts']<=t0)
out=['ffconcat version 1.0']
for i in range(first,len(fr)):
    start=max(fr[i]['ts'],t0); end=fr[i+1]['ts'] if i+1<len(fr) else start+0.5
    out+=[f"file '{fr[i]['file']}'", f"duration {end-start:.4f}"]
out.append(f"file '{fr[-1]['file']}'")
open('frames.ffconcat','w').write('\n'.join(out)+'\n')
PY
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i frames.ffconcat -vf "fps=30,format=yuv420p" -c:v libx264 -preset medium -crf 16 take.mp4
cut() { ffmpeg -hide_banner -loglevel error -y -ss "$2" -i take.mp4 -t "$3" -vf "$4,scale=1920:1080:flags=lanczos,format=yuv420p" -an -c:v libx264 -preset slow -crf 17 -r 30 -movflags +faststart "../assets/clips/$1.mp4"; }
FULL="crop=2560:1440:0:0"
cut s1-globe      0.5  3.0 "$FULL"
cut s2-click      7.9  1.2 "crop=1920:1080:0:96"
cut s3-chart     17.9  3.8 "$FULL"
cut s4-headline  13.7  3.0 "$FULL"
cut s5-evidence  30.0  2.5 "crop=1600:900:64:512"
cut s6-map       37.0  2.5 "$FULL"
cut s7-tabs      44.2  5.0 "crop=1920:1080:0:64"
cut s8-oaxaca    59.8  2.5 "$FULL"
cut s9-oaxaca-map 66.5 2.5 "$FULL"
ls -la ../assets/clips
