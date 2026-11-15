'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { ArrowRight, ArrowUpRight, Globe, Info, MapPin, MapPinned, MousePointerClick, Navigation, Pause, Play, Rotate3d, RotateCcw, Sparkles, ZoomIn } from 'lucide-react'
import { EarthGlobe } from '@/components/earth-globe'
import { PanelHeader } from '@/components/panel-header'
import { LocationSelector, type Region } from '@/components/location-selector'
import { VariableSelector, type Variable } from '@/components/variable-selector'
import { PeriodPicker } from '@/components/period-picker'
import { TrendChart } from '@/components/trend-chart'
import { AreaMap } from '@/components/area-map'
import { EvidencePanel, ResultsPanel } from '@/components/evidence-panel'
import { DataSourceBadge } from '@/components/data-source-badge'
import { SignalExplorer } from '@/components/signal-explorer'
import { SignalHighlights } from '@/components/signal-highlights'
import { usePointAnalysis } from '@/hooks/use-earthscope'
import type { VariableId } from '@/lib/api/v2'
import type { ClimateAnalysis } from '@/lib/nasa/types'

// The two legacy choices open their equivalent in the API v2 explorer.
const FOCUS_FOR: Record<Variable, VariableId> = { temperature: 'T2M', precipitation: 'PRECTOTCORR' }

const fetcher = async (url: string): Promise<ClimateAnalysis> => {
  const response = await fetch(url)
  const body = await response.json() as ClimateAnalysis & { error?: string }
  if (!response.ok) throw new Error(body.error || 'Unable to retrieve climate observations.')
  return body
}

export function AppShell() {
  const [region, setRegion] = useState<Region>({ name: 'Puebla, Mexico', lat: 19.04, lon: -98.20, country: 'MEX', state: 'Puebla' })
  const [variable, setVariable] = useState<Variable>('temperature')
  const [focus, setFocus] = useState<VariableId>(FOCUS_FOR.temperature)
  const [startYear, setStartYear] = useState(2001)
  const [endYear, setEndYear] = useState(2024)
  const [analysisRequested, setAnalysisRequested] = useState(false)
  const [paused, setPaused] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)
  // Respect reduced-motion: start with the globe still.
  useEffect(() => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true) }, [])
  const params = new URLSearchParams({ latitude: String(region.lat), longitude: String(region.lon), startYear: String(startYear), endYear: String(endYear), variable })
  const { data: analysis, error, isLoading, mutate } = useSWR<ClimateAnalysis, Error>(analysisRequested ? `/api/series?${params.toString()}` : null, fetcher, { revalidateOnFocus: false })
  // Same request trigger for every processed variable (API v2); the legacy series above is unchanged.
  const point = usePointAnalysis(analysisRequested ? { latitude: region.lat, longitude: region.lon, startYear, endYear } : null)
  const requesting = isLoading || point.isLoading

  // Every selection (globe click or selects) stops the rotation so the chosen place stays in view;
  // the play button resumes it.
  function selectRegion(next: Region) {
    setRegion(next)
    setAnalysisRequested(false)
    setPaused(true)
  }

  function analyze() {
    setAnalysisRequested(true)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="EarthScope home">
          {/* Official NASA Space Apps logo (spaceappschallenge.org/brand), color-and-white version for the dark band. */}
          <img className="brand-logo" src="/brand/space-apps-logo-color-white.svg" alt="NASA Space Apps Challenge" width={102} height={40} />
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

      <section className="workspace" id="main" aria-label="Climate signal analysis workspace">
        <aside className="filters-panel panel">
          <PanelHeader badge="Step 1" title="Set up your query" icon={Navigation} />
          <h1>Find a signal.<br /><span>Understand its story.</span></h1>
          <p className="intro-copy">Explore historical climate observations for a place you care about.</p>

          <LocationSelector value={region} onChange={selectRegion} />
          <VariableSelector value={variable} onChange={(next) => { setVariable(next); setFocus(FOCUS_FOR[next]); setAnalysisRequested(false) }} />
          <PeriodPicker startYear={startYear} endYear={endYear} onStartChange={(year) => { setStartYear(year); setAnalysisRequested(false) }} onEndChange={(year) => { setEndYear(year); setAnalysisRequested(false) }} />

          <div className="setup-actions">
            <button className="analyze-button" type="button" onClick={analyze} disabled={requesting}><Sparkles size={16} /> {requesting ? 'Requesting…' : 'Analyze region'} <span>→</span></button>
            <div className="setup-note"><Info size={16} /><span>Analyze requests the selected monthly series and every processed variable from NASA POWER. Results are descriptive, not forecasts.</span></div>
            <div className="panel-footnote"><span className="step-number">01</span><span>SELECT LOCATION &amp; CLIMATE VARIABLE</span></div>
          </div>
        </aside>

        <section className="center-column" aria-label="Interactive Earth and historical trend">
          <div className="globe-panel panel">
            <PanelHeader badge="Step 2" title="Pick a place on the map" icon={Globe} />
            <div className="globe-head"><h2>One planet. <span>Countless signals.</span></h2><div className="globe-controls" aria-label="Globe controls"><button className="icon-button" type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Resume globe rotation' : 'Pause globe rotation'} title={paused ? 'Resume rotation' : 'Pause rotation'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button><button className="icon-button" type="button" onClick={() => setResetSignal((n) => n + 1)} aria-label="Reset globe view" title="Reset view"><RotateCcw size={16} /></button></div></div>
            <div className="globe-stage"><EarthGlobe region={region} paused={paused} resetSignal={resetSignal} onSelect={selectRegion} /></div>
            <div className="globe-caption"><ol className="globe-steps" aria-label="How to use the globe"><li><Rotate3d size={16} /> DRAG TO ROTATE</li><li><ArrowRight size={16} className="step-arrow" aria-hidden="true" /><ZoomIn size={16} /> SCROLL TO ZOOM</li><li><ArrowRight size={16} className="step-arrow" aria-hidden="true" /><MousePointerClick size={16} /> CLICK A COUNTRY</li><li><ArrowRight size={16} className="step-arrow" aria-hidden="true" /><MapPinned size={16} /> THEN A STATE</li></ol><span className="globe-location"><MapPin size={16} /> {region.name}</span></div>
            <div className="globe-legend"><span className="legend-item"><span className="legend-point" /> SELECTED LOCATION</span><span className="legend-divider" /><span className="legend-note">No data overlays are shown until observations are verified.</span></div>
          </div>
          <AreaMap region={region} startYear={startYear} endYear={endYear} preferredVariable={FOCUS_FOR[variable]} />
          <TrendChart variable={variable} startYear={startYear} endYear={endYear} analysisRequested={analysisRequested} analysis={analysis} error={error} isLoading={isLoading} onRetry={() => mutate()} />
          <SignalExplorer point={point.data} isLoading={point.isLoading} error={point.error} analysisRequested={analysisRequested} focus={focus} onFocus={setFocus} onRetry={() => point.mutate()} startYear={startYear} endYear={endYear} />
        </section>

        <div className="side-column">
          <ResultsPanel region={region} variable={variable} startYear={startYear} endYear={endYear} analysisRequested={analysisRequested} analysis={analysis} error={error} isLoading={isLoading} />
          <SignalHighlights point={point.data} isLoading={point.isLoading} error={point.error} onFocus={setFocus} />
        </div>
      </section>

      <EvidencePanel variable={variable} analysis={analysis} point={point.data} />

      <footer className="app-footer"><DataSourceBadge /><span className="footer-center">Scientific evidence before visual certainty. • Earth imagery: NASA Blue Marble • Boundaries: Natural Earth</span><a href="https://power.larc.nasa.gov/" target="_blank" rel="noreferrer">NASA POWER project <ArrowUpRight size={16} /></a></footer>
    </main>
  )
}
