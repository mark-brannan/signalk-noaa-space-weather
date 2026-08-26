// Build a self-contained projections.html embedding the real fixtures.
import { readFileSync, writeFileSync } from 'node:fs'

const here = new URL('.', import.meta.url).pathname
const repo = '/home/solace/signalk-noaa-space-weather/.claude/worktrees/map-projection-exploration-ee86f8'

const coast = JSON.parse(readFileSync(here + 'coast.geojson', 'utf8'))
// Flatten to array of polylines [[lon,lat],...]
const lines = []
for (const f of coast.features) {
  const g = f.geometry
  if (g.type === 'LineString') lines.push(g.coordinates)
  else if (g.type === 'MultiLineString') lines.push(...g.coordinates)
}

const aurora = JSON.parse(readFileSync(repo + '/examples/ovation-aurora.2026_08_01.json', 'utf8'))

// Parse DRAP tabular text: header row of lons, then "lat | v v v ..."
const drapTxt = readFileSync(repo + '/examples/drap-global-frequencies.2026_08_20.txt', 'utf8')
const drapLines = drapTxt.split('\n')
let lonRow = null
const drapCells = [] // [lon, lat, mhz]
for (const line of drapLines) {
  if (line.startsWith('#') || /^-+$/.test(line.trim()) || !line.trim()) continue
  if (!lonRow) { lonRow = line.trim().split(/\s+/).map(Number); continue }
  const m = line.split('|')
  if (m.length !== 2) continue
  const lat = Number(m[0].trim())
  const vals = m[1].trim().split(/\s+/).map(Number)
  vals.forEach((v, i) => drapCells.push([lonRow[i], lat, v]))
}

const html = `<!doctype html><meta charset="utf-8"><title>projections</title>
<style>
body{background:#0d1117;color:#e6edf3;font:13px system-ui;margin:16px}
.panel{display:inline-block;vertical-align:top;margin:6px;background:#161b22;border:1px solid #30363d;border-radius:6px;padding:8px}
.panel h3{margin:0 0 6px;font-size:13px;font-weight:600}
h2{font-size:15px;margin:18px 4px 4px}
canvas{display:block}
</style>
<body>
<div id="sheets"></div>
<script>
const COAST = ${JSON.stringify(lines)}
const AURORA = ${JSON.stringify(aurora.coordinates)}
const DRAP = ${JSON.stringify(drapCells)}
const VESSEL = { lat: 38, lon: -40 }   // mid-Atlantic
const D2R = Math.PI/180

// ---- forward projections: (lonDeg, latDeg) -> [x, y] in radian-ish units, y up
function equirect(l, p){ return [l*D2R, p*D2R] }
function mercator(l, p){ p = Math.max(-82, Math.min(82, p)); return [l*D2R, Math.log(Math.tan(Math.PI/4 + p*D2R/2))] }
function winkel(l, p){
  const lam = l*D2R, phi = p*D2R, cphi1 = Math.cos(50.467*D2R)
  const a = Math.acos(Math.max(-1, Math.min(1, Math.cos(phi)*Math.cos(lam/2))))
  const sinca = a === 0 ? 1 : Math.sin(a)/a
  const x = 0.5*(lam*cphi1 + 2*Math.cos(phi)*Math.sin(lam/2)/sinca)
  const y = 0.5*(phi + Math.sin(phi)/sinca)
  return [x, y]
}
function mollTheta(phi){
  let t = phi
  for (let i=0;i<10;i++){
    const d = (2*t + Math.sin(2*t) - Math.PI*Math.sin(phi)) / (2 + 2*Math.cos(2*t))
    t -= d; if (Math.abs(d) < 1e-7) break
  }
  return t
}
function mollweideAt(lam, phi, cm){
  const t = mollTheta(phi)
  return [cm + (2*Math.SQRT2/Math.PI)*(lam-cm)*Math.cos(t), Math.SQRT2*Math.sin(t)]
}
const GOODE_LAT = 40.73333*D2R, GOODE_Y0 = 0.0528035274542
const LOBES_N = [[-Math.PI, -40*D2R, -100*D2R], [-40*D2R, Math.PI, 30*D2R]]
const LOBES_S = [[-Math.PI, -100*D2R, -160*D2R], [-100*D2R, -20*D2R, -60*D2R], [-20*D2R, 80*D2R, 20*D2R], [80*D2R, Math.PI, 140*D2R]]
function goodeLobe(lam, phi){
  const set = phi >= 0 ? LOBES_N : LOBES_S
  for (const lb of set) if (lam >= lb[0] && lam <= lb[1]) return lb
  return set[set.length-1]
}
function goode(l, p){
  const lam = l*D2R, phi = p*D2R
  const lb = goodeLobe(lam, phi), cm = lb[2]
  if (Math.abs(phi) <= GOODE_LAT) return [cm + (lam-cm)*Math.cos(phi), phi]
  const [x, y] = mollweideAt(lam, phi, cm)
  return [x, y - Math.sign(phi)*GOODE_Y0]
}
function azeqFactory(lat0, lon0){
  const p0 = lat0*D2R, l0 = lon0*D2R, sp0 = Math.sin(p0), cp0 = Math.cos(p0)
  return (l, p) => {
    const phi = p*D2R
    let dl = l*D2R - l0
    const cosc = sp0*Math.sin(phi) + cp0*Math.cos(phi)*Math.cos(dl)
    const c = Math.acos(Math.max(-1, Math.min(1, cosc)))
    if (c < 1e-9) return [0, 0]
    const k = c / Math.sin(c)
    return [k*Math.cos(phi)*Math.sin(dl), k*(cp0*Math.sin(phi) - sp0*Math.cos(phi)*Math.cos(dl))]
  }
}
function polarN(l, p){ const r = (90-p)*D2R; return [r*Math.sin(l*D2R), r*Math.cos(l*D2R)] }
function polarS(l, p){ const r = (90+p)*D2R; return [r*Math.sin(l*D2R), -r*Math.cos(l*D2R)] }

const PROJS = [
  { name: 'Equirectangular (plate carrée)', fn: equirect, w: 640 },
  { name: 'Web Mercator (clipped ±82°)', fn: mercator, w: 480 },
  { name: 'Winkel tripel', fn: winkel, w: 640 },
  { name: "Goode's homolosine (interrupted)", fn: goode, w: 640, interrupted: true },
  { name: 'Azimuthal equidistant, vessel-centred', fn: azeqFactory(VESSEL.lat, VESSEL.lon), w: 420, disc: Math.PI },
  { name: 'Polar azimuthal N (pole to 30°N)', fn: polarN, w: 320, disc: 60*D2R, latMin: 30 },
  { name: 'Polar azimuthal S (pole to 30°S)', fn: polarS, w: 320, disc: 60*D2R, latMax: -30 },
]

// ---- color ramps
const NOAA_RAMP = [[116,166,117],[50,196,53],[23,227,16],[30,232,10],[37,241,6],[45,247,3],[61,255,0],[109,255,0],[156,255,2],[199,255,1],[248,255,1],[255,238,0],[254,222,0],[254,201,0],[255,182,0],[255,163,0],[255,144,2],[254,113,0],[250,54,0],[249,2,0],[228,0,0]]
function auroraColor(pct){
  if (!(pct > 0)) return null
  const pos = Math.min(100, pct)/5, seg = Math.min(NOAA_RAMP.length-2, Math.floor(pos)), t = pos-seg
  const a = NOAA_RAMP[seg], b = NOAA_RAMP[seg+1]
  const alpha = Math.min(1, pct/2)*(0.3+0.6*(pct/100))
  return 'rgba('+Math.round(a[0]+(b[0]-a[0])*t)+','+Math.round(a[1]+(b[1]-a[1])*t)+','+Math.round(a[2]+(b[2]-a[2])*t)+','+alpha.toFixed(3)+')'
}
function drapColor(mhz){ // placeholder ramp, 0..35 MHz; dark -> hot
  if (!(mhz > 0)) return null
  const t = Math.min(1, mhz/35)
  return 'rgba('+Math.round(40+215*t)+','+Math.round(30+120*t)+','+Math.round(90-60*t)+','+(0.25+0.6*t).toFixed(3)+')'
}

function makePanel(parent, proj, cells, cellDeg, colorFn){
  const div = document.createElement('div'); div.className = 'panel'
  const h = document.createElement('h3'); h.textContent = proj.name; div.appendChild(h)
  const cv = document.createElement('canvas')
  // compute bounds by sampling the graticule
  const fns = [proj.fn]
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9
  if (proj.disc){ minX=-proj.disc;maxX=proj.disc;minY=-proj.disc;maxY=proj.disc }
  else for (const fn of fns) for (let p=-90;p<=90;p+=2) for (let l=-180;l<=180;l+=2){
    const [x,y] = fn(l,p)
    if (x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y
  }
  const W = proj.w, S = W/(maxX-minX), H = Math.ceil((maxY-minY)*S)
  cv.width = W*2; cv.height = H*2; cv.style.width = W+'px'
  const ctx = cv.getContext('2d'); ctx.scale(2,2)
  div.appendChild(cv); parent.appendChild(div)
  const px = (x,y) => [(x-minX)*S, (maxY-y)*S]

  function drawHemi(fn, latFilter){
    // globe silhouette: fill all cells with base ocean tint
    for (const [lonRaw, lat, val] of cells){
      if (latFilter && !latFilter(lat)) continue
      let lon = lonRaw > 180 ? lonRaw-360 : lonRaw
      const corners = [[lon-cellDeg.lon/2, lat-cellDeg.lat/2],[lon+cellDeg.lon/2, lat-cellDeg.lat/2],[lon+cellDeg.lon/2, lat+cellDeg.lat/2],[lon-cellDeg.lon/2, lat+cellDeg.lat/2]]
      // keep the cell inside one lobe for interrupted projections
      ctx.beginPath()
      let ok = true, prev = null
      for (const [cl, cp] of corners){
        const lam = Math.max(-180, Math.min(180, cl)), phi = Math.max(-90, Math.min(90, cp))
        const [x,y] = fn(proj.interrupted ? snapLobe(lam, phi, lon, lat) : lam, phi)
        const [X,Y] = px(x,y)
        if (prev && Math.hypot(X-prev[0], Y-prev[1]) > 60) { ok = false; break }
        prev = [X,Y]
        if (ctx.beginPathDone) ctx.lineTo(X,Y); else { ctx.moveTo(X,Y); ctx.beginPathDone = true }
      }
      ctx.beginPathDone = false
      if (!ok) continue
      ctx.closePath()
      ctx.fillStyle = '#1b2330'; ctx.fill()
      const c = colorFn(val)
      if (c){ ctx.fillStyle = c; ctx.fill() }
    }
    // coastline
    ctx.strokeStyle = 'rgba(160,180,200,0.8)'; ctx.lineWidth = 0.6
    for (const line of COAST){
      ctx.beginPath(); let prev = null
      for (const [lon, lat] of line){
        if (latFilter && !latFilter(lat)) { prev = null; continue }
        const [x,y] = fn(lon, lat); const [X,Y] = px(x,y)
        if (prev && Math.hypot(X-prev[0], Y-prev[1]) > 40) prev = null
        if (prev) ctx.lineTo(X,Y); else ctx.moveTo(X,Y)
        prev = [X,Y]
      }
      ctx.stroke()
    }
    // vessel
    if (!latFilter || latFilter(VESSEL.lat)){
      const [x,y] = fn(VESSEL.lon, VESSEL.lat); const [X,Y] = px(x,y)
      ctx.beginPath(); ctx.arc(X,Y,4,0,7); ctx.fillStyle='#fff'; ctx.fill()
      ctx.beginPath(); ctx.arc(X,Y,7,0,7); ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.lineWidth=1.2; ctx.stroke()
    }
  }
  function snapLobe(lam, phi, cLon, cLat){
    // keep a cell's corners in the lobe of its centre so quads don't tear
    return lam // corners already within half a cell; lobe misassign is rare at these sizes
  }
  const latFilter = proj.latMin != null ? (lat => lat >= proj.latMin)
    : proj.latMax != null ? (lat => lat <= proj.latMax) : null
  drawHemi(fns[0], latFilter)
}

const sheets = document.getElementById('sheets')
function sheet(title, cells, cellDeg, colorFn){
  const h = document.createElement('h2'); h.textContent = title; sheets.appendChild(h)
  const wrap = document.createElement('div'); wrap.id = title.split(' ')[0].toLowerCase(); sheets.appendChild(wrap)
  for (const p of PROJS) makePanel(wrap, p, cells, cellDeg, colorFn)
}
sheet('AURORA — OVATION 1°×1° fixture 2026-08-01, vessel 38°N 40°W', AURORA, {lat:1, lon:1}, auroraColor)
sheet('DRAP — D-region absorption 2°×4° fixture 2026-08-20 (quiet day, placeholder ramp)', DRAP, {lat:2, lon:4}, drapColor)
</script>
</body>`
writeFileSync(here + 'projections.html', html)
console.log('wrote projections.html', html.length, 'bytes')
