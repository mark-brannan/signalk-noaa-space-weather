import { chromium } from 'playwright'
const [url, out, state] = process.argv.slice(2)
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 })
await p.context().addCookies([{ name: 'mockstate', value: state, url }]); await p.goto(url); await p.waitForTimeout(2500)
await p.getByText('Conditions', { exact: true }).first().click(); await p.waitForTimeout(1500)
const c = p.locator('#kpChart'); await c.scrollIntoViewIfNeeded()
const bb = await c.boundingBox()
await p.screenshot({ path: out, clip: { x: 0, y: Math.max(0, bb.y - 90), width: 420, height: bb.height + 170 } })
await b.close()
