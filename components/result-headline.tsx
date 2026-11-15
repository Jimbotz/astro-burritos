'use client'

import { useState } from 'react'
import { Check, Link2, LoaderCircle, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { PointResponse, VariableId } from '@/lib/api/v2'
import { headlineFor } from '@/lib/ui/headline'

// Top of the Results: the plain-language answer for the step 1 variable, before the charts and the evidence, with a
// button that copies the shareable link (the query is written to the URL when Analyze runs).
export function ResultHeadline({ place, variable, point, isLoading, error, analysisRequested }: { place: string; variable: VariableId; point?: PointResponse; isLoading: boolean; error?: Error; analysisRequested: boolean }) {
  const [copied, setCopied] = useState(false)
  const result = point?.variables.find((item) => item.id === variable)
  if (!analysisRequested) return null
  if (isLoading) return <p className="result-headline is-pending" role="status"><LoaderCircle className="loading-icon" size={18} aria-hidden="true" /> Analyzing {place}…</p>
  if (error || !result || !point) return null
  const headline = headlineFor(place, result, point)
  const Icon = headline.tone === 'up' ? TrendingUp : headline.tone === 'down' ? TrendingDown : Minus

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return <section className={`result-headline is-${headline.tone}`} aria-label="Answer in one sentence">
    <Icon size={22} className="result-headline-icon" aria-hidden="true" />
    <div className="result-headline-body"><p className="result-headline-text">{headline.text}</p><p className="result-headline-detail">{headline.detail}</p></div>
    <button className="share-button" type="button" onClick={copyLink} aria-live="polite">{copied ? <><Check size={16} /> Copied</> : <><Link2 size={16} /> Copy link</>}</button>
  </section>
}
