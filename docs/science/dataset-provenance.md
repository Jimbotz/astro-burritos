# Dataset provenance

Every source the app uses at runtime is public and needs no login, key or token. Each response records the exact requests in `sources[]`, and the Evidence File links to them.

## NASA POWER API v2.10: MERRA-2

- **Provider:** NASA POWER, NASA Langley Research Center. Base URL: `https://power.larc.nasa.gov/api/temporal`.
- **Endpoints:**

  | Endpoint | Used by | Parameters |
  |---|---|---|
  | `monthly/point` | `GET /api/point`, `GET /api/crosscheck` (the identical URL) | `T2M, T2M_RANGE, T2M_MAX, T2M_MIN, PRECTOTCORR, QV2M, RH2M, GWETROOT` |
  | `daily/point` | `GET /api/point` | `T2M_MAX, T2M_MIN` |
  | `monthly/regional` | `GET /api/region` | One parameter per request, in aligned 5° tiles |

- **Request settings:** `community=AG`, `format=JSON`. Point requests ask for `time-standard=LST`. Point series always start in 1981 and end no earlier than 2020, so the 1991–2020 baseline is complete.
- **Source model:** read from `header.sources` (`MERRA2`). The API version comes from `header.api.version`, and the fill value from `header.fill_value`.
- **Spatial support:** the point endpoint returns the nearest native MERRA-2 cell (0.5° × 0.625°) and its mean elevation (`geometry.coordinates[2]`).

## NASA POWER API v2.10: GPM IMERG

- **Parameter:** `IMERG_PRECTOT`, monthly precipitation in mm/day, from POWER's `monthly/regional` endpoint. Verified on 2026-11-15:
  - native 0.1° pixels, from 1998-01;
  - **UTC only**. With `time-standard=LST`, POWER returns `-999` and the message “The IMERG Source Data is not available at the Local Solar Time (LST) standard”;
  - a regional request needs at least a 2° range per axis, so EarthScope asks for the 2° × 2° box centred on the MERRA-2 cell (400 pixels, about 75 kB per year).
- **Version:** POWER's response header reports the source as `IMERG` but not the IMERG run or version, so EarthScope labels it “GPM IMERG monthly precipitation (via NASA POWER)”.
- **Reproducible request** (Puebla cell, 2001–2024):

  ```text
  https://power.larc.nasa.gov/api/temporal/monthly/regional?parameters=IMERG_PRECTOT&community=AG&latitude-min=18&latitude-max=20&longitude-min=-99.125&longitude-max=-97.125&start=2001&end=2024&format=JSON&time-standard=UTC
  ```

## Other data

| Data | Source | Use |
|---|---|---|
| Country and state boundaries | Natural Earth countries at 1:50m and states at 1:10m (public domain), built by `scripts/build-geo.sh` into `public/geo/` | Globe, selectors, the 2D map, server-side area lookup |
| Station records | NOAA NCEI GHCN-Daily public files (`https://www.ncei.noaa.gov/pub/data/ghcn/daily/by_station/<id>.csv.gz`): Puebla airport `MXM00076685` (rain) and Tlaxcala `MXM00076683` (rain, TMAX, TMIN) | Offline validation only (`docs/backend/analysis/`) |
| Globe textures | `public/textures/`: four files byte-identical to the example images of `three-globe` 2.45.6, including the NASA Blue Marble image; two smaller versions from the first commit; the clouds texture has no recorded source yet | Visual only, never data |

## Reproducible point request

Replace the coordinates and years as needed:

```text
https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,T2M_RANGE,T2M_MAX,T2M_MIN,PRECTOTCORR,QV2M,RH2M,GWETROOT&community=AG&longitude=-98.2&latitude=19.04&start=1981&end=2024&format=JSON&time-standard=LST
```

The tests replay real saved responses of these requests (`tests/fixtures/power/manifest.json`), so the published results can be reproduced offline with `pnpm test`.

## Attribution

Users should follow NASA POWER's current terms and attribution guidance before publishing derived products. EarthScope is not an official NASA product.
