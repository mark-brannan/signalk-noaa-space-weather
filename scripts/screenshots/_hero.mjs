import { chromium } from 'playwright'
const [url, out, state] = process.argv.slice(2)
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 420, height: 560 }, deviceScaleFactor: 2 })
await p.context().addCookies([{ name: 'mockstate', value: state, url }]); await p.goto(url); await p.waitForTimeout(2500)
await p.screenshot({ path: out }); await b.close()
