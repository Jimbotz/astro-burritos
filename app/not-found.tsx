import Link from 'next/link'
import { MapPinOff } from 'lucide-react'

export default function NotFound() {
  return <main className="app-shell">
    <section className="panel status-page">
      <MapPinOff size={24} className="status-page-icon" aria-hidden="true" />
      <h1>Page not found</h1>
      <p>EarthScope has a single page: pick a place, a variable and a period there.</p>
      <Link className="export-button" href="/">Go to EarthScope</Link>
    </section>
  </main>
}
