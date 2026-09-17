// The two projections /coverage draws with, as plain math the island can run
// without shipping a map library. The generator (scripts/generate-coverage.mjs)
// projects the basemap with d3-geo at build time and serializes {scale,
// translate, rotate, parallels} into the page; these functions must agree
// with d3 for those parameters, and tests/coverage.test.ts holds the two to
// within half a pixel. Formulas are the standard ones (Šavrič et al. for
// Natural Earth; Albers' conic equal-area), matching d3-geo's conventions:
// degrees in, y down, x = tx + k·rawx, y = ty − k·rawy.
const RAD = Math.PI / 180

/** Natural Earth I forward, radians in, unit sphere out. */
function naturalEarth1Raw(lambda, phi) {
  const phi2 = phi * phi
  const phi4 = phi2 * phi2
  return [
    lambda *
      (0.8707 -
        0.131979 * phi2 +
        phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4))),
    phi *
      (1.007226 +
        phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4))),
  ]
}

/** Conic equal-area forward for two standard parallels, radians in. */
function conicEqualAreaRaw(y0, y1) {
  const sy0 = Math.sin(y0)
  const n = (sy0 + Math.sin(y1)) / 2
  const c = 1 + sy0 * (2 * n - sy0)
  const r0 = Math.sqrt(c) / n
  return (x, y) => {
    const r = Math.sqrt(c - 2 * n * Math.sin(y)) / n
    return [r * Math.sin((x *= n)), r0 - r * Math.cos(x)]
  }
}

/**
 * A forward projection from the serialized parameters: (lon, lat) in degrees
 * to [x, y] in the view's pixel space, or null when the point projects
 * outside the viewBox (a Honolulu dot has no place on the Europe view).
 */
export function makeProjection(params) {
  const raw =
    params.type === 'naturalEarth1'
      ? naturalEarth1Raw
      : conicEqualAreaRaw(params.parallels[0] * RAD, params.parallels[1] * RAD)
  const rotate = params.rotate ?? 0
  const [tx, ty] = params.translate
  const k = params.scale
  const project = (lon, lat) => {
    let l = lon + rotate
    if (l > 180) l -= 360
    else if (l < -180) l += 360
    const [x, y] = raw(l * RAD, lat * RAD)
    return [tx + k * x, ty - k * y]
  }
  const inside = ([x, y]) => x >= 0 && x <= params.width && y >= 0 && y <= params.height
  return { project, inside }
}

/**
 * Pixel space back to (lon, lat), by Newton with finite differences: two
 * unknowns, a well-behaved smooth map, a click's worth of precision. Good to
 * ~1e-6 degrees in a handful of iterations everywhere on the visible sphere.
 */
export function invert(projection, x, y, guess = [0, 40]) {
  let [lon, lat] = guess
  for (let i = 0; i < 25; i++) {
    const p = projection.project(lon, lat)
    const dx = p[0] - x
    const dy = p[1] - y
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) break
    const h = 1e-4
    const px = projection.project(lon + h, lat)
    const py = projection.project(lon, lat + h)
    const a = (px[0] - p[0]) / h
    const b = (py[0] - p[0]) / h
    const c = (px[1] - p[1]) / h
    const d = (py[1] - p[1]) / h
    const det = a * d - b * c
    if (!det) break
    lon -= (dx * d - dy * b) / det
    lat -= (dy * a - dx * c) / det
    if (lat > 89.9) lat = 89.9
    else if (lat < -89.9) lat = -89.9
  }
  return [lon, lat]
}

const EARTH_KM = 6371.0088

/** Great-circle distance in km. */
export function haversineKm(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * RAD
  const dLon = (lon2 - lon1) * RAD
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a))
}

/**
 * The vertices of a geodesic circle: `steps` destination points around
 * (lon, lat) at `km`. The reach rings, drawn the same way the generator's
 * baked ones are (a projected small circle, not a screen-space circle), so a
 * ring at 60° N is honestly wider on screen than one at the equator.
 */
export function circlePoints(lon, lat, km, steps = 36) {
  const delta = km / EARTH_KM
  const sinD = Math.sin(delta)
  const cosD = Math.cos(delta)
  const phi = lat * RAD
  const points = []
  for (let i = 0; i < steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI
    const phi2 = Math.asin(Math.sin(phi) * cosD + Math.cos(phi) * sinD * Math.cos(bearing))
    const lambda2 =
      lon * RAD +
      Math.atan2(Math.sin(bearing) * sinD * Math.cos(phi), cosD - Math.sin(phi) * Math.sin(phi2))
    points.push([lambda2 / RAD, phi2 / RAD])
  }
  return points
}
