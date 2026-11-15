// Takes of the real app (local prod build of main), one CDP screencast per scene (page pixels only).
// Each scene writes frames/<scene>/*.jpg and an entry in marks.json; build-clips.sh turns each scene into one clip.
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
const cosmetics = () => page.addStyleTag({ content: 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}' })
await cosmetics()
const ready = () => page.waitForSelector('#results[data-state="ready"]', { timeout: 120000 })
await ready()
await page.waitForTimeout(5000) // globe textures, map grid

const hold = (s) => page.waitForTimeout(s * 1000)
const jump = (sel, off = 0) => page.evaluate(([s, o]) => { const el = document.querySelector(s); scrollTo(0, el ? el.getBoundingClientRect().top + scrollY + o : o) }, [sel, off])
const smooth = (sel, off = 0, ms = 1200) => page.evaluate(([s, o, d]) => new Promise((done) => {
  const el = s ? document.querySelector(s) : null
  const to = el ? el.getBoundingClientRect().top + scrollY + o : o
  const from = scrollY; const start = performance.now()
  const step = (n) => { const k = Math.min(1, (n - start) / d); const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2; scrollTo(0, from + (to - from) * e); k < 1 ? requestAnimationFrame(step) : done() }
  requestAnimationFrame(step)
}), [sel, off, ms])

rmSync('frames', { recursive: true, force: true }); mkdirSync('frames')
const scenes = []
let current = null
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  if (current) {
    const file = `frames/${current.name}/${String(current.frames.length).padStart(5, '0')}.jpg`
    current.frames.push({ file, ts: metadata.timestamp })
    writeFileSync(file, Buffer.from(data, 'base64'))
  }
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1 })

const clicks = []
const click = async (locator, name) => {
  const b = await locator.boundingBox()
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2
  await page.mouse.move(cx, cy, { steps: 12 }); await hold(0.3)
  clicks.push({ scene: current?.name, name, t: +(Date.now() / 1000 - current.t0).toFixed(3), click: [Math.round(cx), Math.round(cy)] })
  await page.mouse.click(cx, cy)
}
async function scene(name, run) {
  mkdirSync(`frames/${name}`)
  current = { name, frames: [], t0: Date.now() / 1000 }
  await page.mouse.move(800, 450) // nudge a repaint so the scene starts with a frame
  await run()
  scenes.push({ name, t0: current.t0, frames: current.frames })
  console.log(name, current.frames.length, 'frames')
  current = null
}

// 1 · Globe (Step 2) and Step 3 map side by side.
await jump('.maps-row', -16)
await scene('s1-globe', () => hold(4.5))

// 2 · Step 1: pick the hottest-extreme variable and analyze.
await jump(null, 0)
await scene('s2-query', async () => {
  await hold(0.6)
  await click(page.getByText('Coldest night of the year', { exact: true }).first(), 'pick-tnn')
  await hold(0.6)
  await click(page.getByRole('button', { name: /Analyze region/ }), 'analyze')
  await hold(1.5)
})
await ready(); await hold(12) // grid for the new variable

// 3 · Step 3 map: where (cells of the state, colored by trend).
await jump('.maps-row', -16)
await scene('s3-map', () => hold(4))

// 4 · Results headline + statistical summary: how sure.
await jump('#results', -24)
await scene('s4-results', async () => { await hold(1.2); await smooth('#results', 260, 1400); await hold(1.6) })

// 5 · All climate signals, temperature tab: when (warm nights vs hot days).
await jump('#signals', -24)
await scene('s5-signals', async () => {
  await hold(0.6)
  await click(page.locator('#signals').getByText('Temperature', { exact: true }).first(), 'tab-temperature')
  await hold(2.2)
})

// 6 · Water side: humidity, soil, precipitation (no trend claim).
await scene('s6-water', async () => {
  for (const tab of ['Humidity', 'Soil', 'Precipitation']) { await click(page.locator('#signals').getByText(tab, { exact: true }).first(), `tab-${tab}`); await hold(1.3) }
  await click(page.locator('#signals').getByText('All', { exact: true }).first(), 'tab-all')
})

// 7 · Cross-checks: two NASA rain records, two places.
await jump('.crosscheck-row', -24)
await scene('s7-crosscheck', () => hold(4))

// 8 · Step 3 projection: exploratory, with its back-test.
await jump('.projection-panel', -140)
await scene('s8-projection', () => hold(3.5))

// 9 · Evidence file.
await jump('.evidence-panel', -24)
await scene('s9-evidence', () => hold(3))

await cdp.send('Page.stopScreencast')
writeFileSync('marks.json', JSON.stringify({ scenes, clicks }, null, 1))
console.log(JSON.stringify(clicks))
await browser.close()
