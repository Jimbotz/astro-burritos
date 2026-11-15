'use client'

import { useId, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { GLOSSARY, type GlossaryKey } from '@/lib/ui/glossary'

// A technical term with its plain-language definition, shown on hover and on keyboard focus (dotted underline).
export function Term({ name, children }: { name: GlossaryKey; children: ReactNode }) {
  const id = `term-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return <span className="term" tabIndex={0} aria-describedby={id}>
    {children}
    <span className="term-tip" role="tooltip" id={id}>{GLOSSARY[name]}</span>
  </span>
}

// An ⓘ button whose text floats over the page on hover, keyboard focus or tap, without moving the layout.
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = `tip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return <span className="info-tip">
    <button type="button" className="info-tip-button" aria-label={label} aria-describedby={id}><Info size={16} /></button>
    <span className="term-tip info-tip-text" role="tooltip" id={id}>{children}</span>
  </span>
}
