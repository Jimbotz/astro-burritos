/**
 * Data sources from the challenge brief and how EarthScope uses each one. Coverage and access were verified on
 * 2026-11-14 (docs/backend/frontend-data-handoff.md §9, docs/roadmap/data-strategy.md) and IMERG through POWER on
 * 2026-11-15. Only the public NASA POWER API feeds the live analysis (MERRA-2 for every variable, GPM IMERG for the rain
 * cross-check); the rest are planned integrations, offline validation or manual audit tools. None needs a login.
 */
export type SourceStatus = 'integrated' | 'planned' | 'validation' | 'audit' | 'method'

export type ChallengeSource = {
  name: string
  product: string
  coverage: string
  resolution: string
  status: SourceStatus
  role: string
  /** What stands between the source and the live analysis (empty for the integrated one). */
  blocker: string
  /** Which parts of the page use it: the core climate analysis and/or the impact lenses. */
  lenses: Array<'core' | 'water' | 'heat'>
}

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  integrated: 'In use',
  planned: 'Planned',
  validation: 'Used to validate',
  audit: 'Manual audit',
  method: 'Method',
}

export const CHALLENGE_SOURCES: ChallengeSource[] = [
  {
    name: 'NASA POWER', product: 'MERRA-2 reanalysis, monthly, daily and regional API v2.10', coverage: '1981-01 to 2025-12', resolution: '0.5° × 0.625° cell',
    status: 'integrated', role: 'The core climate analysis (13 variables, the map grid, the projection) and the climate side of both impact lenses.', blocker: '', lenses: ['core', 'water', 'heat'],
  },
  {
    name: 'GPM IMERG (via NASA POWER)', product: 'IMERG monthly precipitation, POWER parameter IMERG_PRECTOT (served in UTC)', coverage: '1998-01 to 2025-12', resolution: '0.1° pixels, averaged over the MERRA-2 cell',
    status: 'integrated', role: 'The second, satellite-based rain record of the cross-check card: does it agree with MERRA-2, whose year-to-year rain barely matches stations?', blocker: '', lenses: ['core'],
  },
  {
    name: 'MODIS / VIIRS (via ORNL DAAC subsets)', product: 'Terra NDVI/EVI MOD13Q1.061, land surface temperature MOD11A2.061, VIIRS VNP13A1', coverage: '2000-02 to 2026-10', resolution: '250 m / 1 km',
    status: 'planned', role: 'Vegetation and surface-temperature trends with their quality layers.', blocker: 'Public without a login (AppEEARS needs one), but at most 10 dates per request: about 56 requests per place for 2001–2024.', lenses: [],
  },
  {
    name: 'GLDAS (via Hydrology Time Series)', product: 'GLDAS Noah 2.1 monthly', coverage: '2000-01 to 2026-07', resolution: '0.25°',
    status: 'planned', role: 'An independent check of POWER’s root-zone soil wetness (GWETROOT).', blocker: 'Needs a NASA Earthdata login (its API is the Giovanni Time Series Service), so it is left out of a tool anyone must be able to run.', lenses: [],
  },
  {
    name: 'NOAA GHCN-Daily (Climate Data Online)', product: 'Station records: Tlaxcala and Puebla airport', coverage: 'Tlaxcala temperature 1981–2005', resolution: 'Weather station',
    status: 'validation', role: 'Offline validation: POWER matches the stations’ maximum-temperature trend, warms nights more slowly and barely tracks year-to-year rain.', blocker: 'Large gaps; no stations in the Tehuacán valley after 2009.', lenses: ['core'],
  },
  {
    name: 'KNMI Climate Explorer', product: 'CRU TS, GPCC, ERA5 and other named datasets', coverage: 'Global', resolution: 'Per dataset',
    status: 'audit', role: 'Manual sanity check against a named reference dataset.', blocker: 'Web tool with human verification; not automatable from the server.', lenses: [],
  },
  {
    name: 'CONAGUA / SMN (stations and Drought Monitor)', product: 'Daily station records (45 stations near the study cells) and the municipal Mexican Drought Monitor', coverage: 'Stations 1981–2025; drought 2003-01 to 2026-10', resolution: 'Weather station; municipality',
    status: 'integrated', role: 'Water lens: validation of POWER rain and observed drought (D1 or worse) per municipality.', blocker: '', lenses: ['water'],
  },
  {
    name: 'INEGI (Censo 2020 ITER, Marco Geoestadístico 2020)', product: 'Population by locality with coordinates; municipal outlines of Puebla, Tlaxcala and Oaxaca', coverage: '2020', resolution: 'Locality; municipality',
    status: 'integrated', role: 'Heat lens: exposed population and urban share; municipal outlines for the lens maps.', blocker: '', lenses: ['heat', 'water'],
  },
  {
    name: 'FAO-56', product: 'Penman–Monteith reference evapotranspiration (Allen et al., 1998)', coverage: 'Method', resolution: 'Method',
    status: 'method', role: 'Water lens: the method behind ET0 and the climate water balance; not a source of observations.', blocker: '', lenses: ['water'],
  },
]
