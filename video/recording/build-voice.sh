#!/usr/bin/env bash
# Turns the team's voice-over (assets/voice/voiceover-raw.mp3, 34.9 s) into one clip per sentence (assets/voice/vo-1…5.wav)
# that fit the 30 s cut: rumble filter, light denoise, +2.4 dB to about -16 LUFS with a -1.5 dBFS limiter, then per
# sentence: pauses over 0.25 s cut to 0.15 s, ends trimmed, 1.09x faster with the pitch kept.
# Sentence bounds (s) come from the loudness envelope at the breaks; index.html places each clip on the timeline.
set -euo pipefail
cd "$(dirname "$0")/../assets/voice"
ffmpeg -hide_banner -loglevel error -y -i voiceover-raw.mp3 -ac 1 -ar 48000 \
  -af "highpass=f=80,afftdn=nr=10:nf=-45,volume=2.4dB,alimiter=limit=0.84:level=false" clean.wav
i=1
for seg in "0.00 5.95" "6.55 15.60" "16.19 22.93" "23.09 31.45" "31.50 34.90"; do
  a=${seg% *}; b=${seg#* }
  ffmpeg -hide_banner -loglevel error -y -ss "$a" -to "$b" -i clean.wav -ac 1 -ar 48000 -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03:stop_periods=-1:stop_duration=0.25:stop_threshold=-40dB:stop_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,atempo=1.09" "vo-$i.wav"
  echo "vo-$i $(ffprobe -v error -show_entries format=duration -of csv=p=0 "vo-$i.wav")"
  i=$((i + 1))
done
rm clean.wav
