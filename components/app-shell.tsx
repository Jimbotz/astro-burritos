'use client'

import { useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import { ArrowRight, ArrowUpRight, Globe, Info, MapPin, MapPinned, MousePointerClick, Navigation, Pause, Play, Rotate3d, RotateCcw, Sparkles, ZoomIn } from 'lucide-react'
import { EarthGlobe } from '@/components/earth-globe'
import { PanelHeader } from '@/components/panel-header'
import { LocationSelector, type Region } from '@/components/location-selector'
import { VariableSelector } from '@/components/variable-selector'
import { PeriodPicker } from '@/components/period-picker'
import { PointTrendChart } from '@/components/trend-chart'
import { AreaMap } from '@/components/area-map'
import { MapLayerControls, type LayerKind } from '@/components/map-layer'
import { EvidencePanel, ResultsPanel } from '@/components/evidence-panel'
import { ResultHeadline } from '@/components/result-headline'
import { DataSourceBadge } from '@/components/data-source-badge'
import { SignalExplorer } from '@/components/signal-explorer'
import { SignalHighlights } from '@/components/signal-highlights'
import { usePointAnalysis } from '@/hooks/use-earthscope'
import { useReducedMotion } from '@/hooks/use-browser'
import type { VariableId } from '@/lib/api/v2'
import { decodeQuery, encodeQuery, type SharedQuery } from '@/lib/ui/query-url'

const subscribeNothing = () => () => {}

// Demonstration cases (step 1): one click fills the query and runs it. Coordinates: Puebla keeps the city point used by
// default; Tlaxcala and Oaxaca use their Natural Earth label points, as the state select does.
const EXAMPLES: Array<{ label: string; hint: string; region: Region; variable: VariableId; kind: LayerKind }> = [
  { label: 'Warming in Puebla', hint: 'Mean air temperature: a robust warming trend, colored by trend on the map', region: { name: 'Puebla, Mexico', lat: 19.04, lon: -98.20, country: 'MEX', state: 'Puebla' }, variable: 'T2M', kind: 'trend' },
  { label: 'Coldest nights in Tlaxcala', hint: 'Coldest night of the year: the extreme that is warming fastest', region: { name: 'Tlaxcala, Mexico', lat: 19.4, lon: -98.16, country: 'MEX', state: 'Tlaxcala' }, variable: 'TNn', kind: 'anomaly' },
  { label: 'Rain in Oaxaca', hint: 'Annual precipitation: shown without a trend claim, and its projection is blocked', region: { name: 'Oaxaca, Mexico', lat: 16.94, lon: -96.21, country: 'MEX', state: 'Oaxaca' }, variable: 'PRECTOTCORR', kind: 'anomaly' },
]

export function AppShell() {
  const [region, setRegion] = useState<Region>({ name: 'Puebla, Mexico', lat: 19.04, lon: -98.20, country: 'MEX', state: 'Puebla' })
  // Step 1 variable. Every result comes from API v2 (one pipeline: 12/12 months, per-variable profiles); the legacy
  // GET /api/series endpoint still exists for external clients but the interface no longer calls it.
  const [variable, setVariable] = useState<VariableId>('T2M')
  const [focus, setFocus] = useState<VariableId>('T2M')
  // How the step 3 map colors the step 1 variable. Display only: changing it never resets the analysis.
  const [layerKind, setLayerKind] = useState<LayerKind>('anomaly')
  const [startYear, setStartYear] = useState(2001)
  const [endYear, setEndYear] = useState(2024)
  const [analysisRequested, setAnalysisRequested] = useState(false)
  // The globe starts still under reduced motion, until the user presses play or pause.
  const reducedMotion = useReducedMotion()
  const [pausedChoice, setPaused] = useState<boolean | null>(null)
  const paused = pausedChoice ?? reducedMotion
  const [resetSignal, setResetSignal] = useState(0)
  // One request returns every processed variable at the analysis point (API v2).
  const point = usePointAnalysis(analysisRequested ? { latitude: region.lat, longitude: region.lon, startYear, endYear } : null)
  const requesting = point.isLoading

  // Shareable links: a valid ?place=…&var=… query restores step 1 once and runs the analysis. Read without an effect
  // (server snapshot '' keeps hydration identical), then applied during render, React's pattern for adjusting state.
  const search = useSyncExternalStore(subscribeNothing, () => window.location.search, () => '')
  const [appliedSearch, setAppliedSearch] = useState(false)
  if (!appliedSearch && search) {
    setAppliedSearch(true)
    const shared = decodeQuery(search)
    if (shared) apply(shared, false)
  }

  function apply(query: SharedQuery, writeUrl = true) {
    setRegion(query.region)
    setVariable(query.variable)
    setFocus(query.variable)
    setLayerKind(query.layer)
    setStartYear(query.startYear)
    setEndYear(query.endYear)
    setPaused(true)
    setAnalysisRequested(true)
    if (writeUrl) window.history.replaceState(null, '', encodeQuery(query))
  }

  // Every selection (globe click or selects) stops the rotation so the chosen place stays in view;
  // the play button resumes it.
  function selectRegion(next: Region) {
    setRegion(next)
    setAnalysisRequested(false)
    setPaused(true)
  }

  function analyze() {
    setAnalysisRequested(true)
    window.history.replaceState(null, '', encodeQuery({ region, variable, startYear, endYear, layer: layerKind }))
  }

  function runExample(example: (typeof EXAMPLES)[number]) {
    apply({ region: example.region, variable: example.variable, startYear: 2001, endYear: 2024, layer: example.kind })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="EarthScope home">
          {/* Official NASA Space Apps logo (spaceappschallenge.org/brand), color-and-white version for the dark band. */}
          <Image className="brand-logo" src="/brand/space-apps-logo-color-white.svg" alt="NASA Space Apps Challenge" width={102} height={40} priority />
          <span className="brand-divider" />
          <span className="brand-stack"><span className="brand-name">earthscope</span><span className="brand-kicker">SPACE APPS CONTEXT</span></span>
          <span className="brand-divider" />
          <span className="brand-subtitle">CLIMATE SIGNALS, IN CONTEXT</span>
        </a>
        <div className="topbar-right">
          <span className="project-tag"><span className="tiny-dot" /> INDEPENDENT RESEARCH PROJECT</span>
        </div>
      </header>

      <div className="disclaimer"><Info size={16} /><span>Independent NASA Space Apps Challenge project. <strong>Not an official NASA product.</strong></span></div>

      {/* Layout (team mockup, Nov 2026): step 1 holds the whole query (place, period, variable, map layer) across the
          full width; then the globe (step 2) next to the 2D map (step 3); then the results. */}
      <div className="layout" id="main">
        <section className="filters-panel query-panel panel" aria-label="Set up your query">
          <PanelHeader badge="Step 1" title="Set up your query" icon={Navigation} />
          <div className="query-intro">
            <h1>Find a signal. <span>Understand its story.</span></h1>
            <p className="intro-copy">Explore historical climate observations for a place you care about.</p>
            <div className="demo-examples" role="group" aria-label="Examples"><span>Try an example:</span>{EXAMPLES.map((example) => <button key={example.label} type="button" title={example.hint} onClick={() => runExample(example)}>{example.label}</button>)}</div>
          </div>
          {/* DOM order follows the flow: location → period → variable → map layer → analyze. */}
          <div className="query-grid">
            <div className="query-main">
              <LocationSelector value={region} onChange={selectRegion} />
              <PeriodPicker startYear={startYear} endYear={endYear} onStartChange={(year) => { setStartYear(year); setAnalysisRequested(false) }} onEndChange={(year) => { setEndYear(year); setAnalysisRequested(false) }} />
            </div>
            <div className="query-variables">
              <VariableSelector value={variable} onChange={(next) => { setVariable(next); setFocus(next); setAnalysisRequested(false) }} />
            </div>
            <div className="query-layer">
              <MapLayerControls variable={variable} kind={layerKind} onKind={setLayerKind} />
              <div className="setup-actions">
                <button className="analyze-button" type="button" onClick={analyze} disabled={requesting}><Sparkles size={16} /> {requesting ? 'Requesting…' : 'Analyze region'} <span>→</span></button>
              </div>
            </div>
          </div>
          <div className="setup-meta">
            <div className="setup-note"><Info size={16} /><span>Analyze requests the selected variable and the rest of the processed variables from NASA POWER, and colors the map for the selected country or state. Results are descriptive, not forecasts.</span></div>
            <div className="panel-footnote"><span className="step-number">01</span><span>SELECT LOCATION, VARIABLE &amp; MAP LAYER</span></div>
          </div>
        </section>

        <div className="maps-row">
          <div className="globe-panel panel">
            <PanelHeader badge="Step 2" title="Pick a place on the map" icon={Globe} />
            <div className="globe-head"><h2>One planet. <span>Countless signals.</span></h2><div className="globe-controls" aria-label="Globe controls"><button className="icon-button" type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Resume globe rotation' : 'Pause globe rotation'} title={paused ? 'Resume rotation' : 'Pause rotation'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button><button className="icon-button" type="button" onClick={() => setResetSignal((n) => n + 1)} aria-label="Reset globe view" title="Reset view"><RotateCcw size={16} /></button></div></div>
            <div className="globe-stage"><EarthGlobe region={region} paused={paused} resetSignal={resetSignal} onSelect={selectRegion} /></div>
            <div className="globe-caption"><ol className="globe-steps" aria-label="How to use the globe"><li><Rotate3d size={16} /> DRAG TO ROTATE</li><li><ArrowRight size={16} className="step-arrow" aria-hidden="true" /><ZoomIn size={16} /> SCROLL TO ZOOM</li><li><ArrowRight size={16} className="step-arrow" aria-hidden="true" /><MousePointerClick size={16} /> CLICK A COUNTRY</li><li><ArrowRight size={16} className="step-arrow" aria-hidden="true" /><MapPinned size={16} /> THEN A STATE</li></ol><span className="globe-location"><MapPin size={16} /> {region.name}</span></div>
            <div className="globe-legend"><span className="legend-item"><span className="legend-point" /> SELECTED LOCATION</span><span className="legend-divider" /><span className="legend-note">No data overlays are shown until observations are verified.</span></div>
          </div>
          <AreaMap region={region} startYear={startYear} endYear={endYear} variable={variable} kind={layerKind} active={analysisRequested} />
        </div>

        <h2 className="results-title">Results</h2>
        <ResultHeadline place={region.name} variable={variable} point={point.data} isLoading={point.isLoading} error={point.error} analysisRequested={analysisRequested} />
        <ResultsPanel region={region} variable={variable} startYear={startYear} endYear={endYear} analysisRequested={analysisRequested} point={point.data} error={point.error} isLoading={point.isLoading} />
        <div className="results-row">
          <PointTrendChart variable={variable} result={point.data?.variables.find((item) => item.id === variable)} startYear={startYear} endYear={endYear} analysisRequested={analysisRequested} isLoading={point.isLoading} error={point.error} onRetry={() => point.mutate()} />
          <SignalHighlights point={point.data} isLoading={point.isLoading} error={point.error} onFocus={setFocus} />
        </div>
        <SignalExplorer point={point.data} isLoading={point.isLoading} error={point.error} analysisRequested={analysisRequested} focus={focus} onFocus={setFocus} onRetry={() => point.mutate()} startYear={startYear} endYear={endYear} />
        <EvidencePanel variable={variable} point={point.data} analysisRequested={analysisRequested} error={point.error} isLoading={point.isLoading} />
      </div>

      <footer className="app-footer"><DataSourceBadge /><span className="footer-center">Scientific evidence before visual certainty. • Earth imagery: NASA Blue Marble • Boundaries: Natural Earth</span><a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER project <ArrowUpRight size={16} /></a></footer>
    </main>
  )
}
