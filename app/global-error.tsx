'use client' // Error boundaries must be Client Components

// Last-resort fallback when the root layout itself fails; it must render its own html and body. globals.css may not
// load here, so the brand tokens are written as their hex values (deep-blue, neon-blue, page tint).
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', background: '#F2F5FB', color: '#07173F' }}>
        <div role="alert" style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20 }}>EarthScope could not load</h1>
          <p>No climate values were invented: the site stopped instead. Please try again.</p>
          <button type="button" onClick={() => retry()} style={{ padding: '8px 16px', border: 0, borderRadius: 10, background: '#0960E1', color: '#FFFFFF', fontWeight: 700, cursor: 'pointer' }}>Try again</button>
        </div>
      </body>
    </html>
  )
}
