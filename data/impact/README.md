# data/impact

Data of the impact lenses (IMPLEMENTACION_LENTES_IMPACTO §5). Every source is public and needs no login. See `docs/backend/data-sources-no-auth.md`.

| Folder | Content | In git |
|---|---|---|
| `manifests/` | One manifest per source: provider, product, URL, retrieval time, coverage, resolution, time standard, `authRequired: false`, access mode, licence, SHA-256 | Yes |
| `raw/` | Original public downloads (INEGI, SMN) and cached POWER responses, with `downloads.tsv` (URL, time, bytes, SHA-256) | No (≈ 600 MB, regenerate with `scripts/impact/`) |
| `normalized/` | Daily records in the normalized schema (§5.2). They are produced in memory during ingestion and on every `/api/impact` request (`lib/analysis/impact-quality.ts`) and are not stored: at about 150,000 records per cell they would add hundreds of MB | No (empty) |
| `derived/` | Processed subsets that the API reads: INEGI municipalities and cell population, SMN drought monitor and stations, per-cell POWER snapshots of Puebla (21), Tlaxcala (29) and Oaxaca (20) | Yes |
| `fixtures/` | Real POWER responses for the offline tests of `/api/impact` (`manifest.json` lists the exact requests) | Yes |

Municipal outlines (INEGI Marco Geoestadístico 2020, simplified) live in `public/geo/municipios/` because the browser draws them too.

Regenerate:

```bash
bash scripts/impact/fetch-raw.sh
python -I scripts/impact/smn_catalog.py
python -I scripts/impact/ingest_public.py population drought geometry stations manifests
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/ts-resolve.mjs scripts/impact/preprocess-power.ts
```
