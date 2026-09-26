import { chromium } from 'playwright'
const [url, out] = process.argv.slice(2)
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 420, height: 560 }, deviceScaleFactor: 2 })
await p.context().addCookies([{ name: 'mockstate', value: 'watch', url }]); await p.goto(url); await p.waitForTimeout(2500)
const t = p.getByText('Weekly outlook', { exact: false }).first()
await t.hover(); await p.waitForTimeout(400); await p.screenshot({ path: out + '-hover.png' })
await t.click(); await p.waitForTimeout(800); await p.screenshot({ path: out + '-open.png' })
console.log(await p.evaluate(() => [...document.querySelectorAll('dialog')].map(d => d.id + ':' + d.open)))
await b.close()
