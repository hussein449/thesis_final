/**
 * Shared road-path geometry helpers
 * =================================
 *
 * Pure geometry utilities consumed by:
 *   - src/detection/lib/detection-sim.js   (drone movement, accident location)
 *   - src/partitioning/lib/risk-scoring.js (per-section curvature scoring)
 *   - src/detection/components/LiveMap.jsx (rendering paths)
 *
 * Extracted to its own module so the partitioning layer can compute path
 * geometry without importing from the detection layer (which would create
 * a circular dep once detection-sim imports the section-time-slot accident
 * generator).
 *
 * All distances are local meters using an equirectangular projection
 * anchored at each road's first polyline vertex. For corridor lengths up
 * to a few tens of km and latitudes around 33°N, the east-west distortion
 * is well below 1 % — far below the sub-200 m accuracy needed by the
 * detection model.
 */

/** Convert lat/lon to local meters (x, y) relative to a reference point. */
export function projectToMeters(lat, lon, refLat, refLon) {
  const cosRef = Math.cos((refLat * Math.PI) / 180)
  const dx = (lon - refLon) * 111000 * cosRef
  const dy = (lat - refLat) * 111000
  return [dx, dy]
}

/** Convert local meters back to lat/lon. */
export function unprojectMeters(x, y, refLat, refLon) {
  const cosRef = Math.cos((refLat * Math.PI) / 180)
  const lat = refLat + y / 111000
  const lon = refLon + x / (111000 * cosRef)
  return [lat, lon]
}

/**
 * Build a parametric path over a road polyline. Returns:
 *   - segments:     per-segment metadata (start arc length, end arc length, ...)
 *   - totalLength:  total road length in meters
 *   - refLat / refLon: projection anchor (first polyline vertex)
 */
export function buildRoadPath(road) {
  const refLat = road.polyline[0][0]
  const refLon = road.polyline[0][1]
  const projected = road.polyline.map(([la, lo]) =>
    projectToMeters(la, lo, refLat, refLon)
  )

  const segments = []
  let acc = 0
  for (let i = 1; i < projected.length; i++) {
    const [x1, y1] = projected[i - 1]
    const [x2, y2] = projected[i]
    const len = Math.hypot(x2 - x1, y2 - y1)
    segments.push({
      start: acc,
      end: acc + len,
      length: len,
      p1: projected[i - 1],
      p2: projected[i],
    })
    acc += len
  }

  return { segments, totalLength: acc, refLat, refLon }
}

/** Position (in local meters) at arc length `s` along the path. */
export function positionAt(path, s) {
  if (s <= 0) return path.segments[0].p1
  if (s >= path.totalLength) return path.segments[path.segments.length - 1].p2
  for (const seg of path.segments) {
    if (s <= seg.end) {
      const t = (s - seg.start) / seg.length
      return [
        seg.p1[0] + t * (seg.p2[0] - seg.p1[0]),
        seg.p1[1] + t * (seg.p2[1] - seg.p1[1]),
      ]
    }
  }
  return path.segments[path.segments.length - 1].p2
}
