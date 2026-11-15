'use client'

import { useId, type ReactNode } from 'react'
import { GLOSSARY, type GlossaryKey } from '@/lib/ui/glossary'

// A technical term with its plain-language definition, shown on hover and on keyboard focus (dotted underline).
export function Term({ name, children }: { name: GlossaryKey; children: ReactNode }) {
  const id = `term-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return <span className="term" tabIndex={0} aria-describedby={id}>
    {children}
    <span className="term-tip" role="tooltip" id={id}>{GLOSSARY[name]}</span>
  </span>
}
