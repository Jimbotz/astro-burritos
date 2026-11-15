/** @type {import('next').NextConfig} */
const nextConfig = {
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
  // GET /api/region?country=…&state=… reads the Natural Earth outlines from public/geo on the server.
  outputFileTracingIncludes: {
    '/api/region': ['./public/geo/**/*'],
  },
}

export default nextConfig
