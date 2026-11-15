// Takes of the real app (local prod build of main), one CDP screencast per scene (page pixels only).
// Each scene writes frames/<scene>/*.jpg and an entry in marks.json; build-clips.sh turns each scene into one clip.
// Scenes are recorded longer than their slot; index.html picks the in-point with data-media-start.
// Place: Tehuacán, Puebla (18.46, -97.39), the app's comparison place, opened through a shared link.
import { chromium } from 'playwright-core'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'

const BASE = 'http://localhost:3100/'
const PLACE = '?' + new URLSearchParams({ place: 'Tehuacán, Puebla', lat: '18.46', lon: '-97.39', var: 'T2M', from: '2001', to: '2024', layer: 'trend', country: 'MEX', state: 'Puebla', vs: 'puebla' })
const browser = await chromium.launch({ headless: false, args: ['--window-position=0,34', '--window-size=1600,987'] })
const context = await browser.newContext({ viewport: null })
const page = await context.newPage()
await page.goto(BASE + PLACE, { waitUntil: 'networkidle' })
const cdp = await context.newCDPSession(page)
const { windowId } = await cdp.send('Browser.getWindowForTarget')
const chromeH = await page.evaluate(() => outerHeight - innerHeight)
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 34, width: 1600, height: 900 + chromeH } })
await page.bringToFront()
await page.addStyleTag({ content: 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}' })
await page.waitForSelector('#results[data-state="ready"]', { timeout: 120000 })

const hold = (s) => page.waitForTimeout(s * 1000)
const jump = (sel, off = 0) => page.evaluate(([s, o]) => { const el = document.querySelector(s); scrollTo(0, el ? el.getBoundingClientRect().top + scrollY + o : o) }, [sel, off])
const smooth = (sel, off = 0, ms = 1200) => page.evaluate(([s, o, d]) => new Promise((done) => {
  const el = s ? document.querySelector(s) : null
  const to = el ? el.getBoundingClientRect().top + scrollY + o : o
  const from = scrollY; const start = performance.now()
  const step = (n) => { const k = Math.min(1, (n - start) / d); const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2; scrollTo(0, from + (to - from) * e); k < 1 ? requestAnimationFrame(step) : done() }
  requestAnimationFrame(step)
}), [sel, off, ms])
const lens = (name) => page.locator('#impact-lenses').getByRole('button', { name: new RegExp(name) }).first()

// Warm every request off camera (both lenses, the rain cross-check), so the takes show answers, not spinners.
await page.waitForFunction(() => [...document.querySelectorAll('.crosscheck-panel')].every((p) => !p.querySelector('.crosscheck-empty')), null, { timeout: 120000 })
await jump('#impact-lenses', -24)
await lens('Heat Signal').click(); await page.getByText('Corroborated heat-exposure signal').first().waitFor({ timeout: 120000 })
await lens('Water Signal').click(); await page.locator('.impact-station').first().waitFor({ timeout: 120000 })
await hold(3) // map grid, projection

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
  await page.mouse.move(cx, cy, { steps: 12 }); await hold(0.25)
  clicks.push({ scene: current?.name, name, t: +(Date.now() / 1000 - current.t0).toFixed(3), click: [Math.round(cx), Math.round(cy)] })
  await page.mouse.click(cx, cy)
}
async function scene(name, run) {
  mkdirSync(`frames/${name}`)
  current = { name, frames: [], t0: Date.now() / 1000 }
  await page.mouse.move(1590, 890) // nudge a repaint so the scene starts with a frame; park the pointer in the corner
  await run()
  scenes.push({ name, t0: current.t0, t1: Date.now() / 1000, frames: current.frames }) // t1: a still page sends no frames, so the last one lasts until here
  console.log(name, current.frames.length, 'frames')
  current = null
}

// 1 · Globe (Step 2) next to the Step 3 map of Puebla state, Tehuacán selected.
await jump('.maps-row', -16)
const resume = page.getByRole('button', { name: 'Resume globe rotation' }) // a selection pauses it
if (await resume.count()) await resume.click()
await page.mouse.move(1590, 890); await hold(1)
await scene('s1-globe', () => hold(6))

// 2 · Water lens: corroborated water signal, its four components and their years.
await jump('#impact-lenses', -24)
await scene('s2-water', () => hold(10))

// 4b · Validation with a CONAGUA/SMN station (water lens).
await jump('.impact-station', -330)
await scene('s4b-station', () => hold(4))

// 3 · Heat lens: corroborated heat signal, then warm days and who is exposed.
await jump('#impact-lenses', -24)
await scene('s3-heat', async () => {
  await hold(0.5)
  await click(lens('Heat Signal'), 'heat')
  await hold(1.4)
  await smooth('.impact-triple', -150, 1000)
  await hold(6)
})

// 4a · The five robustness checks of the selected variable (mean temperature).
await jump('.criteria-title', -360)
await scene('s4a-checks', () => hold(5))

// 4c · Two NASA rain records (MERRA-2 vs GPM IMERG) for the same cell.
await jump('.crosscheck-row', -24)
await scene('s4c-rain', () => hold(5))

await cdp.send('Page.stopScreencast')
writeFileSync('marks.json', JSON.stringify({ scenes, clicks }, null, 1))
console.log(JSON.stringify(clicks))
await browser.close()
