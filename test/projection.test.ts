import { describe, expect, it } from 'vitest'
import { azimuthalEquidistant } from '../public/projection.js'

describe('azimuthalEquidistant', () => {
  it('maps the centre to the origin', () => {
    const project = azimuthalEquidistant(38, -40)
    const [x, y] = project(-40, 38)
    expect(x).toBeCloseTo(0, 9)
    expect(y).toBeCloseTo(0, 9)
  })

  it('is true to scale: distance from the origin is the great-circle distance, in radians', () => {
    const project = azimuthalEquidistant(0, 0)
    // A point 90 degrees of latitude away is a quarter of the way around the
    // world -- pi/2 radians -- which is the whole point of the projection.
    const [x, y] = project(0, 90)
    expect(Math.hypot(x, y)).toBeCloseTo(Math.PI / 2, 6)
  })

  it('preserves bearing from the centre: north is +y, east is +x', () => {
    const project = azimuthalEquidistant(0, 0)
    const [xNorth, yNorth] = project(0, 10)
    expect(xNorth).toBeCloseTo(0, 6)
    expect(yNorth).toBeGreaterThan(0)

    const [xEast, yEast] = project(10, 0)
    expect(xEast).toBeGreaterThan(0)
    expect(yEast).toBeCloseTo(0, 6)
  })

  it('keeps the exact antipode finite, where bearing is undefined', () => {
    // Every bearing is equally "toward" the exact antipode -- there is no
    // right answer for which edge pixel it lands on, only a wrong one
    // (NaN/Infinity) to avoid. Antipode of 38N 40W is 38S 140E.
    const project = azimuthalEquidistant(38, -40)
    const [x, y] = project(140, -38)
    expect(Number.isFinite(x)).toBe(true)
    expect(Number.isFinite(y)).toBe(true)
  })

  it('places a near-antipodal point close to the boundary circle', () => {
    const project = azimuthalEquidistant(38, -40)
    // A tenth of a degree short of the exact antipode: bearing is
    // well-defined here, so this checks the clamp doesn't distort a real,
    // representable point.
    const [x, y] = project(140, -37.9)
    expect(Math.hypot(x, y)).toBeCloseTo(Math.PI, 2)
  })

  it('agrees with the great-circle distance formula at an arbitrary point', () => {
    // Halifax, from a vessel near Bermuda -- checked against the haversine
    // distance independently rather than against this module's own math.
    const vessel = { lat: 32.3, lon: -64.75 }
    const halifax = { lat: 44.65, lon: -63.6 }
    const project = azimuthalEquidistant(vessel.lat, vessel.lon)
    const [x, y] = project(halifax.lon, halifax.lat)

    const toRad = (d) => (d * Math.PI) / 180
    const phi1 = toRad(vessel.lat)
    const phi2 = toRad(halifax.lat)
    const dPhi = toRad(halifax.lat - vessel.lat)
    const dLambda = toRad(halifax.lon - vessel.lon)
    const a =
      Math.sin(dPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
    const haversineC = 2 * Math.asin(Math.sqrt(a))

    expect(Math.hypot(x, y)).toBeCloseTo(haversineC, 6)
  })
})
