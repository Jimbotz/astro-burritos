'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

// Fallback for an unexpected runtime error in the page (Next 16: `retry` re-renders the segment).
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return <main className="app-shell">
    <section className="panel status-page" role="alert">
      <AlertTriangle size={24} className="status-page-icon" aria-hidden="true" />
      <h1>Something went wrong on this page</h1>
      <p>No climate values were invented: the page stopped instead. Try again, and if it keeps failing, reload the site.</p>
      <button className="export-button" type="button" onClick={() => retry()}><RotateCcw size={16} /> Try again</button>
    </section>
  </main>
}
