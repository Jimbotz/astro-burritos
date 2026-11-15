'use client'

import { useMemo } from 'react'
import { ChevronDown, MapPin } from 'lucide-react'
import { useCountries, useStates } from '@/lib/geo'

// `country` is Natural Earth's ADM0_A3 code and `state` its admin-1 name. An ocean click has neither.
// lat/lon is the picked point, never an area average. NASA POWER returns the native MERRA-2 cell
// (0.5° × 0.625°) nearest to it, so values describe that cell, not the city or a station.
export type Region = { name: string; lat: number; lon: number; country?: string; state?: string }

const round = (value: number) => Number(value.toFixed(2))
const byName = (a: string, b: string) => a.localeCompare(b)

export function LocationSelector({ value, onChange }: { value: Region; onChange: (region: Region) => void }) {
  const countries = useCountries().data?.features
  const states = useStates(value.country)
  const sortedCountries = useMemo(() => countries?.slice().sort((a, b) => byName(a.properties.NAME, b.properties.NAME)), [countries])
  const sortedStates = useMemo(() => states.data?.features.slice().sort((a, b) => byName(a.properties.name, b.properties.name)), [states.data])

  function selectCountry(code: string) {
    const country = countries?.find((feature) => feature.properties.ADM0_A3 === code)
    if (country) onChange({ name: country.properties.NAME, lat: round(country.properties.LABEL_Y), lon: round(country.properties.LABEL_X), country: code })
  }

  function selectState(name: string) {
    const state = states.data?.features.find((feature) => feature.properties.name === name)
    const countryName = countries?.find((feature) => feature.properties.ADM0_A3 === value.country)?.properties.NAME
    if (!state || !countryName) return selectCountry(value.country ?? '')
    onChange({ name: `${state.properties.name}, ${countryName}`, lat: round(state.properties.latitude), lon: round(state.properties.longitude), country: value.country, state: name })
  }

  const statePlaceholder = !value.country ? 'Select a country first' : states.error ? 'No subdivisions available' : !states.data ? 'Loading states…' : 'Whole country'

  return <div className="field-group">
    <label className="field-label" htmlFor="country"><MapPin size={16} /> LOCATION</label>
    <div className="select-wrap"><select id="country" value={value.country ?? ''} disabled={!sortedCountries} onChange={(event) => selectCountry(event.target.value)}>
      <option value="" disabled>{sortedCountries ? 'Custom point • no country' : 'Loading countries…'}</option>
      {sortedCountries?.map((feature) => <option key={feature.properties.ADM0_A3} value={feature.properties.ADM0_A3}>{feature.properties.NAME}</option>)}
    </select><ChevronDown size={16} aria-hidden="true" /></div>
    <div className="select-wrap"><select aria-label="State or province" value={value.state ?? ''} disabled={!sortedStates?.length} onChange={(event) => selectState(event.target.value)}>
      <option value="">{statePlaceholder}</option>
      {sortedStates?.map((feature, index) => <option key={`${feature.properties.name}-${index}`} value={feature.properties.name}>{feature.properties.name}</option>)}
    </select><ChevronDown size={16} aria-hidden="true" /></div>
    <div className="coordinate-row"><span>{value.lat.toFixed(2)}° {value.lat >= 0 ? 'N' : 'S'}</span><span>{Math.abs(value.lon).toFixed(2)}° {value.lon >= 0 ? 'E' : 'W'}</span><span className="coordinate-source">WGS84</span></div>
  </div>
}
