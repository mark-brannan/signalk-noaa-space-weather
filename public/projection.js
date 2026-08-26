// Map projections for the webapp's global maps. Pulled out of drap-map.js
// because the argument for azimuthal equidistant here --
// https://github.com/mark-brannan/signalk-noaa-space-weather/issues/174 --
// is specific to D-RAP (straight lines from the vessel are great circles,
// which are HF propagation paths), but the projection itself is not: the
// regional aurora map is a candidate for the same treatment later, behind a
// selector, which is why this stays a separate, product-agnostic module.

const D2R = Math.PI / 180

/**
 * A forward azimuthal equidistant projection centred on (lat0, lon0), in the
 * radian-ish units the projection is naturally scaled in: a point's distance
 * from the origin is its true great-circle distance from the centre, in
 * radians, and bearing from the centre is preserved exactly. A caller scales
 * to pixels by picking how many pixels one radian (or one degree) is worth.
 *
 * Returns [x, y] with y increasing northward (mathematical convention, not
 * screen convention -- a caller drawing to a canvas flips the sign when
 * converting to pixel y).
 *
 * The one singularity is the antipode of the centre, where every bearing
 * maps to the same point in reality but spreads across the whole boundary
 * circle here. `c` is clamped just short of pi so a point that lands there
 * (or a rounding error that overshoots pi) renders at the disc's edge
 * instead of producing NaN/Infinity -- nothing is lost, since the antipode
 * is a single geographic point regardless of which edge pixel draws it.
 */
export function azimuthalEquidistant(lat0, lon0) {
  const phi0 = lat0 * D2R
  const lam0 = lon0 * D2R
  const sinPhi0 = Math.sin(phi0)
  const cosPhi0 = Math.cos(phi0)

  return (lon, lat) => {
    const phi = lat * D2R
    const dLambda = lon * D2R - lam0
    const cosC = sinPhi0 * Math.sin(phi) + cosPhi0 * Math.cos(phi) * Math.cos(dLambda)
    let c = Math.acos(Math.max(-1, Math.min(1, cosC)))
    if (c < 1e-9) return [0, 0]
    if (c > Math.PI - 1e-6) c = Math.PI - 1e-6
    const k = c / Math.sin(c)
    return [
      k * Math.cos(phi) * Math.sin(dLambda),
      k * (cosPhi0 * Math.sin(phi) - sinPhi0 * Math.cos(phi) * Math.cos(dLambda))
    ]
  }
}
