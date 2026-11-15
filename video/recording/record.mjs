// One continuous take of the real app (local prod build of HEAD), captured with the CDP screencast (page pixels only,
// whatever covers the window). Logs every scene mark and click (CSS px, seconds after t0) to marks.json.
import { chromium } from 'playwright-core'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const BASE = 'http://localhost:3100/'
const browser = await chromium.launch({ headless: false, args: ['--window-position=0,34', '--window-size=1600,987'] })
const context = await browser.newContext({ viewport: null })
const page = await context.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
const cdp = await context.newCDPSession(page)
const { windowId } = await cdp.send('Browser.getWindowForTarget')
const chromeH = await page.evaluate(() => outerHeight - innerHeight)
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 34, width: 1600, height: 900 + chromeH } })
await page.bringToFront()
// Recording-only cosmetics: no scrollbars.
await page.addStyleTag({ content: 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}' })
await page.evaluate(() => document.querySelector('.maps-row').scrollIntoView({ block: 'start' }))
await page.waitForTimeout(4000) // globe textures

rmSync('frames', { recursive: true, force: true }); mkdirSync('frames')
const frames = []
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const file = `frames/${String(frames.length).padStart(5, '0')}.jpg`
  frames.push({ file, ts: metadata.timestamp })
  writeFileSync(file, Buffer.from(data, 'base64'))
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1 })
await page.waitForTimeout(1500)

const marks = []
let t0 = 0
const now = () => +((Date.now() - t0) / 1000).toFixed(3)
const mark = (name) => { marks.push({ name, t: now() }); console.log(name, now()) }
const hold = (s) => page.waitForTimeout(s * 1000)
const smooth = (sel, off = 0, ms = 1200) => page.evaluate(([s, o, d]) => new Promise((done) => {
  const el = typeof s === 'string' ? document.querySelector(s) : null
  const to = el ? el.getBoundingClientRect().top + scrollY + o : o
  const from = scrollY; const start = performance.now()
  const step = (n) => { const k = Math.min(1, (n - start) / d); const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2; scrollTo(0, from + (to - from) * e); k < 1 ? requestAnimationFrame(step) : done() }
  requestAnimationFrame(step)
}), [sel, off, ms])
const click = async (locator, name) => {
  const b = await locator.boundingBox()
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2
  await page.mouse.move(cx, cy); await hold(0.25)
  marks.push({ name, t: now(), click: [Math.round(cx), Math.round(cy)] }); console.log(name, now())
  await page.mouse.click(cx, cy)
}
const ready = () => page.waitForSelector('#results[data-state="ready"]', { timeout: 90000 })

t0 = Date.now()
mark('globe-idle'); await hold(6)

await smooth(null, 0, 1000); mark('top'); await hold(1.5)
await click(page.getByRole('button', { name: 'Warming in Puebla' }), 'click-puebla')
await ready(); mark('puebla-ready'); await hold(3)
await smooth('#results', -24); mark('puebla-headline'); await hold(3)
await smooth('.results-row', -24); mark('puebla-chart'); await hold(5)
const checks = page.getByText('Same direction in the sensitivity window').first()
await checks.evaluate((e) => e.setAttribute('data-rec', 'checks'))
await smooth('[data-rec="checks"]', -360); mark('puebla-checks'); await hold(4.5)
await smooth('.evidence-panel', -24); mark('puebla-evidence'); await hold(4)
await smooth('.maps-row', -16, 1600); mark('puebla-map'); await hold(6)
await smooth('#signals', -24, 1600); mark('signals'); await hold(1.5)
for (const tab of ['Temperature', 'Precipitation', 'Humidity', 'All']) { await click(page.locator('#signals').getByText(tab, { exact: true }).first(), `tab-${tab}`); await hold(1.6) }

await smooth(null, 0, 1400); mark('top-2'); await hold(1)
await click(page.getByRole('button', { name: 'Rain in Oaxaca' }), 'click-oaxaca')
await ready(); mark('oaxaca-ready'); await hold(3)
await smooth('#results', -24); mark('oaxaca-headline'); await hold(4)
await smooth('.maps-row', -16, 1600); mark('oaxaca-map'); await hold(6)

await smooth(null, 0, 1400); mark('top-3'); await hold(1)
await click(page.getByRole('button', { name: 'Coldest nights in Tlaxcala' }), 'click-tlaxcala')
await ready(); mark('tlaxcala-ready'); await hold(3)
await smooth('.results-row', -24); mark('tlaxcala-chart'); await hold(4)
await smooth('.maps-row', -16, 1600); mark('tlaxcala-map'); await hold(5)
mark('end')

await cdp.send('Page.stopScreencast')
writeFileSync('marks.json', JSON.stringify({ t0: t0 / 1000, marks, frames }, null, 1))
console.log('frames', frames.length, 'span', (frames.at(-1).ts - frames[0].ts).toFixed(1), 's')
await browser.close()
