import { chromium } from 'playwright'
const [url, out] = process.argv.slice(2)
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 })
await p.context().addCookies([{ name: 'mockstate', value: 'quiet', url }]); await p.goto(url); await p.waitForTimeout(2000)
await p.getByText('Map', { exact: true }).first().click(); await p.waitForTimeout(3000)
await p.screenshot({ path: out }); await b.close()
