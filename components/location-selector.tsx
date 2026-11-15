'use client'

import { useMemo } from 'react'
import { MapPin, Search } from 'lucide-react'
import { useCountries, useStates } from '@/lib/geo'

// `country` is Natural Earth's ADM0_A3 code and `state` its admin-1 name. An ocean click has neither.
// lat/lon is the picked point, never an area average. NASA POWER returns the native MERRA-2 cell
// (0.5° × 0.625°) nearest to it, so values describe that cell, not the city or a station.
export type Region = { name: string; lat: number; lon: number; country?: string; state?: string }

const round = (value: number) => Number(value.toFixed(2))
const byName = (a: string, b: string) => a.localeCompare(b)

/** Case- and accent-insensitive form for matching ("cord" finds "Córdoba", "yucatan" finds "Yucatán"). */
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()

/** Best option for typed text: exact name, then a name that starts with it, then one that contains it. */
export function bestMatch(options: string[], text: string) {
  const query = fold(text)
  if (!query) return null
  return options.find((name) => fold(name) === query)
    ?? options.find((name) => fold(name).startsWith(query))
    ?? options.find((name) => fold(name).includes(query))
    ?? null
}

/**
 * A place typed with suggestions (native <input list> + <datalist>, which filters as you type). A suggestion picked
 * from the list, a full name, or Enter on part of one selects it; leaving the field with anything else restores the
 * current name. `key={current}` remounts it when the selection changes elsewhere (globe, examples, links).
 * ponytail: native datalist styling varies by browser; a custom combobox only if the team needs a styled list.
 */
function PlaceInput({ id, label, options, current, placeholder, disabled, onPick, onClear }: {
  id: string
  label: string
  options: string[]
  current: string
  placeholder: string
  disabled: boolean
  onPick: (name: string) => void
  onClear?: () => void
}) {
  const exact = (text: string) => options.find((name) => fold(name) === fold(text))
  return <div className="place-field">
    <label className="input-label" htmlFor={id}>{label}</label>
    <div className="select-wrap">
      <input
        key={current}
        id={id}
        list={`${id}-options`}
        defaultValue={current}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          // A suggestion picked from the list arrives as a replacement, not a keystroke; a typed full name only counts
          // when no longer name starts with it (so "Niger" waits instead of hiding "Nigeria").
          const typed = (event.nativeEvent as InputEvent).inputType?.startsWith('insertText') || (event.nativeEvent as InputEvent).inputType?.startsWith('delete')
          const name = exact(event.target.value)
          const unique = name && options.filter((option) => fold(option).startsWith(fold(name))).length === 1
          if (name && name !== current && (!typed || unique)) onPick(name)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          const name = bestMatch(options, event.currentTarget.value)
          if (name) { event.currentTarget.value = name; if (name !== current) onPick(name) }
        }}
        onBlur={(event) => {
          const text = event.currentTarget.value.trim()
          const name = exact(text)
          if (!text && onClear) onClear()
          else if (name && name !== current) onPick(name)
          else event.currentTarget.value = current
        }}
      />
      <Search size={16} aria-hidden="true" />
      <datalist id={`${id}-options`}>{options.map((name) => <option key={name} value={name} />)}</datalist>
    </div>
  </div>
}

export function LocationSelector({ value, onChange }: { value: Region; onChange: (region: Region) => void }) {
  const countries = useCountries().data?.features
  const states = useStates(value.country)
  const countryNames = useMemo(() => countries?.map((feature) => feature.properties.NAME).sort(byName) ?? [], [countries])
  const stateNames = useMemo(() => [...new Set(states.data?.features.map((feature) => feature.properties.name))].sort(byName), [states.data])
  const countryName = countries?.find((feature) => feature.properties.ADM0_A3 === value.country)?.properties.NAME ?? ''

  function selectCountry(code: string) {
    const country = countries?.find((feature) => feature.properties.ADM0_A3 === code)
    if (country) onChange({ name: country.properties.NAME, lat: round(country.properties.LABEL_Y), lon: round(country.properties.LABEL_X), country: code })
  }

  function selectState(name: string) {
    const state = states.data?.features.find((feature) => feature.properties.name === name)
    if (!state || !countryName) return selectCountry(value.country ?? '')
    onChange({ name: `${state.properties.name}, ${countryName}`, lat: round(state.properties.latitude), lon: round(state.properties.longitude), country: value.country, state: name })
  }

  const statePlaceholder = !value.country ? 'Select a country first' : states.error ? 'No subdivisions available' : !states.data ? 'Loading states…' : `All of ${countryName} • type a state`

  return <div className="field-group">
    <div className="field-label"><MapPin size={16} /> LOCATION</div>
    <PlaceInput
      id="country"
      label="Country"
      options={countryNames}
      current={countryName}
      placeholder={countries ? 'Type a country' : 'Loading countries…'}
      disabled={!countries}
      onPick={(name) => selectCountry(countries?.find((feature) => feature.properties.NAME === name)?.properties.ADM0_A3 ?? '')}
    />
    <PlaceInput
      id="state"
      label="State / province"
      options={stateNames}
      current={value.state ?? ''}
      placeholder={statePlaceholder}
      disabled={!stateNames.length}
      onPick={selectState}
      onClear={() => { if (value.state) selectCountry(value.country ?? '') }}
    />
    <div className="coordinate-row"><span>{value.lat.toFixed(2)}° {value.lat >= 0 ? 'N' : 'S'}</span><span>{Math.abs(value.lon).toFixed(2)}° {value.lon >= 0 ? 'E' : 'W'}</span><span className="coordinate-source">WGS84</span></div>
  </div>
}
