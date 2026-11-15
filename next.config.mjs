/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server in .next/standalone for the Dockerfile. Vercel and `next start` ignore it.
  output: 'standalone',
  async headers() {
    // No X-Frame-Options on purpose: it blocks the v0 preview, which embeds the app in an iframe.
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }]
  },
  images: {
    unoptimized: true,
  },
  // GET /api/region?country=…&state=… reads the Natural Earth outlines from public/geo on the server; /api/impact also
  // reads the bundled CONAGUA/SMN and INEGI subsets, the per-cell POWER snapshots and the manifests in data/impact.
  outputFileTracingIncludes: {
    '/api/region': ['./public/geo/**/*'],
    '/api/impact': ['./public/geo/**/*', './data/impact/derived/**/*', './data/impact/manifests/**/*'],
  },
  // The raw public downloads (git-ignored, ~600 MB) and the test fixtures never belong in the server bundle.
  outputFileTracingExcludes: {
    '/api/impact': ['./data/impact/raw/**/*', './data/impact/fixtures/**/*'],
  },
}

export default nextConfig
