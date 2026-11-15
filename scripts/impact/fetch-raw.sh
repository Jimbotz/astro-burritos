#!/usr/bin/env bash
# Downloads the public raw files of the impact lenses into data/impact/raw/ (git-ignored) and records each one in
# data/impact/manifests/downloads.json (URL, retrieval time, size, SHA-256). No account, key or token is needed.
set -euo pipefail
cd "$(dirname "$0")/../.."
UA="Mozilla/5.0 (compatible; EarthScope data ingestion; NASA Space Apps 2026)"
log=data/impact/raw/downloads.tsv
: > "$log"
get() {
  local url="$1" dest="$2"
  if [ ! -s "$dest" ]; then curl -fsSL --retry 3 --retry-delay 5 -A "$UA" -o "$dest.part" "$url" && mv "$dest.part" "$dest"; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$dest" "$url" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(stat -c %s "$dest")" "$(sha256sum "$dest" | cut -d' ' -f1)" >> "$log"
  echo "ok $dest"
}
get "https://smn.conagua.gob.mx/tools/RESOURCES/Monitor%20de%20Sequia%20en%20Mexico/MunicipiosSequia.xlsx" data/impact/raw/smn/MunicipiosSequia.xlsx
get "https://www.inegi.org.mx/contenidos/programas/ccpv/2020/datosabiertos/iter/iter_00_cpv2020_csv.zip" data/impact/raw/inegi/iter_00_cpv2020_csv.zip
for state in 29_tlaxcala 21_puebla 20_oaxaca; do
  get "https://www.inegi.org.mx/contenidos/productos/prod_serv/contenidos/espanol/bvinegi/productos/geografia/marcogeo/889463807469/$state.zip" "data/impact/raw/inegi/mg2020_$state.zip"
done
echo DONE
