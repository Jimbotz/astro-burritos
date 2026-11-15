'use client'

import { ChevronDown, CloudRain, Droplets, ListPlus, Sprout, Thermometer, ThermometerSnowflake, ThermometerSun, type LucideIcon } from 'lucide-react'
import { REGION_VARIABLE_IDS, getVariable, type VariableDescriptor, type VariableId } from '@/lib/variables/catalog'
import { unitEn } from '@/lib/ui/format'

// Step 1 offers the nine variables the map can also draw (monthly NASA POWER parameters), so one choice drives the
// analysis and the step 3 layer. Four are one click away; the other five open from the fifth option.
const PRIMARY: Array<{ id: VariableId; label: string; unit: string; icon: LucideIcon }> = [
  { id: 'T2M', label: 'Temperature', unit: '°C', icon: Thermometer },
  { id: 'PRECTOTCORR', label: 'Precipitation', unit: 'mm/year', icon: CloudRain },
  { id: 'TXx', label: 'Hottest day of the year', unit: '°C', icon: ThermometerSun },
  { id: 'TNn', label: 'Coldest night of the year', unit: '°C', icon: ThermometerSnowflake },
]
const MORE = REGION_VARIABLE_IDS
  .filter((id) => !PRIMARY.some((item) => item.id === id))
  .map((id) => getVariable(id))
  .filter((item): item is VariableDescriptor => Boolean(item))
const GROUP_ICON: Record<VariableDescriptor['group'], LucideIcon> = { temperature: Thermometer, precipitation: CloudRain, humidity: Droplets, soil: Sprout }

const parameterOf = (id: VariableId) => getVariable(id)?.source.parameters.join(' + ') ?? id

export function VariableSelector({ value, onChange }: { value: VariableId; onChange: (id: VariableId) => void }) {
  const extra = MORE.find((item) => item.id === value)
  const ExtraIcon = extra ? GROUP_ICON[extra.group] : ListPlus

  return <fieldset className="field-group variable-field">
    <legend className="field-label">CLIMATE VARIABLE</legend>
    <div className="variable-options">
      {PRIMARY.map((item) => {
        const Icon = item.icon
        const selected = value === item.id
        return <button key={item.id} type="button" className={`variable-option ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => onChange(item.id)}>
          <span className="variable-icon"><Icon size={16} /></span>
          <span><strong>{item.label}</strong><small>{parameterOf(item.id)} • {item.unit}</small></span>
        </button>
      })}
      {/* Fifth option: a card-styled native select, so the list opens like any dropdown and stays keyboard accessible. */}
      <div className={`variable-option variable-more ${extra ? 'selected' : ''}`}>
        <span className="variable-icon"><ExtraIcon size={16} /></span>
        <span><strong>{extra ? extra.label.en : 'More variables'}</strong><small>{extra ? `${parameterOf(extra.id)} • ${unitEn(extra.unit)}` : `${MORE.length} more • NASA POWER`}</small></span>
        <ChevronDown size={16} className="variable-unit" aria-hidden="true" />
        <select aria-label="More climate variables" value={extra?.id ?? ''} onChange={(event) => onChange(event.target.value as VariableId)}>
          <option value="" disabled hidden>More variables</option>
          {MORE.map((item) => <option key={item.id} value={item.id}>{item.label.en}</option>)}
        </select>
      </div>
    </div>
    <p className="field-hint">{getVariable(value)?.description.en}</p>
  </fieldset>
}
