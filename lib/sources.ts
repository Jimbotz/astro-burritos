/**
 * Data sources from the challenge brief and how EarthScope uses each one. Coverage and access were verified on
 * 2026-11-14 (docs/backend/frontend-data-handoff.md §9, docs/roadmap/data-strategy.md) and IMERG through POWER on
 * 2026-11-15. Only the public NASA POWER API feeds the live analysis (MERRA-2 for every variable, GPM IMERG for the rain
 * cross-check); the rest are planned integrations, offline validation or manual audit tools. None needs a login.
 */
export type SourceStatus = 'integrated' | 'planned' | 'validation' | 'audit'

export type ChallengeSource = {
  name: string
  product: string
  coverage: string
  resolution: string
  status: SourceStatus
  role: string
  /** What stands between the source and the live analysis (empty for the integrated one). */
  blocker: string
}

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  integrated: 'In use',
  planned: 'Planned',
  validation: 'Used to validate',
  audit: 'Manual audit',
}

export const CHALLENGE_SOURCES: ChallengeSource[] = [
  {
    name: 'NASA POWER', product: 'MERRA-2 reanalysis, monthly, daily and regional API v2.10', coverage: '1981-01 to 2025-12', resolution: '0.5° × 0.625° cell',
    status: 'integrated', role: 'Every value on this page: 13 variables, the map grid and the projection.', blocker: '',
  },
  {
    name: 'GPM IMERG (via NASA POWER)', product: 'IMERG monthly precipitation, POWER parameter IMERG_PRECTOT (served in UTC)', coverage: '1998-01 to 2025-12', resolution: '0.1° pixels, averaged over the MERRA-2 cell',
    status: 'integrated', role: 'The second, satellite-based rain record of the cross-check card: does it agree with MERRA-2, whose year-to-year rain barely matches stations?', blocker: '',
  },
  {
    name: 'MODIS / VIIRS (via ORNL DAAC subsets)', product: 'Terra NDVI/EVI MOD13Q1.061, land surface temperature MOD11A2.061, VIIRS VNP13A1', coverage: '2000-02 to 2026-10', resolution: '250 m / 1 km',
    status: 'planned', role: 'Vegetation and surface-temperature trends with their quality layers.', blocker: 'Public without a login (AppEEARS needs one), but at most 10 dates per request: about 56 requests per place for 2001–2024.',
  },
  {
    name: 'GLDAS (via Hydrology Time Series)', product: 'GLDAS Noah 2.1 monthly', coverage: '2000-01 to 2026-07', resolution: '0.25°',
    status: 'planned', role: 'An independent check of POWER’s root-zone soil wetness (GWETROOT).', blocker: 'Needs a NASA Earthdata login (its API is the Giovanni Time Series Service), so it is left out of a tool anyone must be able to run.',
  },
  {
    name: 'NOAA GHCN-Daily (Climate Data Online)', product: 'Station records: Tlaxcala and Puebla airport', coverage: 'Tlaxcala temperature 1981–2005', resolution: 'Weather station',
    status: 'validation', role: 'Offline validation: POWER matches the stations’ maximum-temperature trend, warms nights more slowly and barely tracks year-to-year rain.', blocker: 'Large gaps; no stations in the Tehuacán valley after 2009.',
  },
  {
    name: 'KNMI Climate Explorer', product: 'CRU TS, GPCC, ERA5 and other named datasets', coverage: 'Global', resolution: 'Per dataset',
    status: 'audit', role: 'Manual sanity check against a named reference dataset.', blocker: 'Web tool with human verification; not automatable from the server.',
  },
]
