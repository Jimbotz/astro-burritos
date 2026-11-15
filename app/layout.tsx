import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Fira_Code, Fira_Sans, Overpass } from 'next/font/google'
import './globals.css'

// Space Apps brand typefaces: Fira Sans for headings, Overpass for body, Fira Code for numbers.
const firaSans = Fira_Sans({ subsets: ['latin'], weight: ['700', '900'], variable: '--font-fira-sans' })
const overpass = Overpass({ subsets: ['latin'], variable: '--font-overpass' })
const firaCode = Fira_Code({ subsets: ['latin'], variable: '--font-fira-code' })

export const metadata: Metadata = {
  title: 'EarthScope — Hidden Climate Signals',
  description: 'Explore historical climate trends with transparent evidence and NASA Earth data. An independent NASA Space Apps Challenge project.',
  generator: 'v0.app',
  // Official NASA Space Apps small logo (spaceappschallenge.org/brand): black for light tabs, white for dark tabs.
  icons: {
    icon: [
      { url: '/brand/space-apps-small-black.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: light)' },
      { url: '/brand/space-apps-small-white.svg', type: 'image/svg+xml', media: '(prefers-color-scheme: dark)' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#07173F',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${firaSans.variable} ${overpass.variable} ${firaCode.variable}`}>
      <body className="antialiased">
        {children}
        {/* Only on Vercel: elsewhere (Docker, local `next start`) /_vercel/insights doesn't exist and would 404. */}
        {process.env.VERCEL && <Analytics />}
      </body>
    </html>
  )
}
