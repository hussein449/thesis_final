/**
 * Detection Simulation Engine
 * ============================
 *
 * Implements the system-level operational simulation requested by the
 * supervisor's Chapter 7 revision:
 *
 *   - Poisson accident arrivals per road, with rates proportional to risk
 *   - Random accident locations along the road polyline
 *   - Drone patrol via back-and-forth sweeping over an assigned segment
 *   - Detection when a drone enters the sensing range of an accident
 *   - Optional integrated operational layer (battery, docking, replacement)
 *
 * The engine is purely functional: it takes a config + a seedable RNG and
 * returns a deterministic result. This makes Monte Carlo aggregation simple
 * and reproducible across policy comparisons.
 *
 * All distances are computed in meters using a local equirectangular
 * projection anchored at each road's first polyline vertex. This is accurate
 * enough for the sub-5 km road segments used in the Beirut data set.
 */

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

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
 *   - segments: per-segment metadata (start arc length, end arc length, ...)
 *   - totalLength: total road length in meters
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

// ---------------------------------------------------------------------------
// Seedable RNG (mulberry32)
// ---------------------------------------------------------------------------

/** Returns a deterministic [0,1) RNG seeded by an integer. */
export function makeRng(seed) {
  let s = seed >>> 0
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Default simulation parameters
// ---------------------------------------------------------------------------

/**
 * Default operational parameters. Each is documented inline with a brief
 * justification, satisfying the supervisor's requirement that battery,
 * dispatch, docking, and replacement rules be explicitly justified.
 */
export const DEFAULT_PARAMS = {
  // Time discretization
  dt: 1.0,                   // seconds per simulation step
  totalTime: 3600,           // 1 hour of simulated operation per trial

  // Drone kinematics
  droneSpeed: 12,            // m/s — typical commercial quadcopter cruise speed
  sensingRange: 200,         // m — optical detection radius at low altitude

  // Detection window
  maxDetectionWindow: 600,   // s — beyond this an accident is counted as missed

  // Battery model (Step 3 — integrated operational simulation)
  // Justification: a typical 5000 mAh quadcopter battery sustains ~25 minutes
  // of hover. A linear drain of (100/1500) %/s ≈ 0.0667 %/s yields a 25-min
  // patrol endurance from a full charge, matching real-world specs.
  enableOperational: true,
  batteryDrainRate: 100 / 1500,  // %/s while patrolling
  lowBatteryThreshold: 25,       // % — return-to-dock trigger
  readyThreshold: 80,            // % — drone resumes patrol once charged
  // Dispatch rule: nearest drone on the same road that is currently in
  // 'patrolling' state. If none, the accident remains active and accumulates
  // delay until either a drone becomes available again, a reserve is
  // dispatched, or the maxDetectionWindow expires (counted as missed).
  dockTransitTime: 60,           // s — average ferry time to reach the dock
  dockChargeTime: 240,           // s — minimum charging time before redeploy
  chargeRate: 100 / 240,         // %/s — full charge in 4 minutes
  // Replacement rule: when a drone goes off-patrol (returning/docked), the
  // segment it was patrolling is left uncovered until it returns. A reserve
  // pool of size `reserveCount` allows immediate replacement: when a drone
  // begins returning, the next idle reserve teleports to its segment after
  // a `reserveDispatchDelay`. This models a fresh drone leaving the dock.
  reserveCount: 2,
  reserveDispatchDelay: 30,      // s — time for a reserve to reach the segment

  // Accident generation
  // Default base rate: scale road's annual accident count to a per-second rate.
  // Multiplied by the user's `accidentRateMultiplier` to allow stress testing.
  accidentRateMultiplier: 30,    // multiplier above real-world rates so trials
                                 // produce statistically meaningful counts in
                                 // a 1-hour simulated window
}

/** Compute a per-road Poisson rate (accidents/second) from its real data. */
export function baselineRoadRate(road) {
  const annual = road.accidents
  const perSecond = annual / (365 * 24 * 3600)
  return perSecond
}

// ---------------------------------------------------------------------------
// Single-trial simulation
// ---------------------------------------------------------------------------

/**
 * Allocation: an array of { road, drones } where the road is a road object
 * (with .polyline, .accidents, etc.) and `drones` is the integer number of
 * drones assigned to that road.
 *
 * Returns a result object with detection times, availability history, and
 * counts of detected/missed accidents.
 */
export function simulateOnce({ allocation, params, seed }) {
  const P = { ...DEFAULT_PARAMS, ...params }
  const rng = makeRng(seed)

  // Per-road state
  const roadStates = allocation.map(({ road, drones: nDrones }) => {
    const path = buildRoadPath(road)
    const baseRate = baselineRoadRate(road) * P.accidentRateMultiplier
    const droneStates = []
    if (nDrones > 0) {
      const segLen = path.totalLength / nDrones
      for (let i = 0; i < nDrones; i++) {
        const segStart = i * segLen
        const segEnd = (i + 1) * segLen
        droneStates.push({
          s: segStart + rng() * segLen,
          dir: rng() < 0.5 ? 1 : -1,
          segStart,
          segEnd,
          battery: 60 + rng() * 40,
          state: 'patrolling',           // patrolling | returning | docked
          phaseEnd: 0,
        })
      }
    }
    return {
      road,
      path,
      baseRate,
      droneStates,
      nAssigned: nDrones,
    }
  })

  // Reserve pool (shared across all roads). Each reserve, when dispatched,
  // takes over a vacated segment after a short delay.
  const reserves = []
  for (let i = 0; i < P.reserveCount; i++) {
    reserves.push({ state: 'idle', readyAt: 0, target: null })
  }

  // Pre-generate accident schedule per road (Poisson process).
  const accidents = []
  for (let r = 0; r < roadStates.length; r++) {
    const rs = roadStates[r]
    if (rs.baseRate <= 0) continue
    let t = 0
    while (true) {
      const u = Math.max(rng(), 1e-12)
      const dt = -Math.log(u) / rs.baseRate
      t += dt
      if (t >= P.totalTime) break
      accidents.push({
        time: t,
        roadIdx: r,
        s: rng() * rs.path.totalLength,
        detected: false,
        detectionTime: null,
        missed: false,
      })
    }
  }
  accidents.sort((a, b) => a.time - b.time)

  // Step the simulation
  const availabilityHistory = []
  const dispatchAttempts = { covered: 0, delayed: 0 }
  const active = []  // accidents that have occurred but not yet resolved
  let nextAccIdx = 0

  for (let t = 0; t < P.totalTime; t += P.dt) {
    // (a) advance drones
    let availableCount = 0

    for (const rs of roadStates) {
      for (const d of rs.droneStates) {
        if (d.state === 'patrolling') {
          // Move
          d.s += d.dir * P.droneSpeed * P.dt
          if (d.s >= d.segEnd) {
            d.s = d.segEnd
            d.dir = -1
          }
          if (d.s <= d.segStart) {
            d.s = d.segStart
            d.dir = 1
          }

          // Battery drain
          if (P.enableOperational) {
            d.battery -= P.batteryDrainRate * P.dt
            if (d.battery <= P.lowBatteryThreshold) {
              d.state = 'returning'
              d.phaseEnd = t + P.dockTransitTime

              // Try to dispatch a reserve to cover the gap.
              if (P.enableOperational) {
                const r = reserves.find((x) => x.state === 'idle')
                if (r) {
                  r.state = 'enroute'
                  r.readyAt = t + P.reserveDispatchDelay
                  r.target = d
                }
              }
            }
          }

          availableCount++
        } else if (d.state === 'returning') {
          if (t >= d.phaseEnd) {
            d.state = 'docked'
            d.phaseEnd = t + P.dockChargeTime
          }
        } else if (d.state === 'docked') {
          d.battery = Math.min(100, d.battery + P.chargeRate * P.dt)
          if (d.battery >= P.readyThreshold && t >= d.phaseEnd) {
            d.state = 'patrolling'
          }
        }
      }
    }

    // (b) reserves arriving on station become a "ghost" drone that augments
    // its target's segment coverage until the original drone returns. We
    // simulate this by counting it toward availability and using its own
    // sensing position (which we approximate as the midpoint of the gap
    // segment). For simplicity we treat the reserve as patrolling the
    // target's old segment with full sensing capability.
    for (const r of reserves) {
      if (r.state === 'enroute' && t >= r.readyAt) {
        r.state = 'covering'
        r.s = (r.target.segStart + r.target.segEnd) / 2
        r.dir = 1
      }
      if (r.state === 'covering') {
        // Once the original drone has resumed patrolling, the reserve goes
        // back to idle. This is a simple replacement rule.
        if (r.target.state === 'patrolling') {
          r.state = 'idle'
          r.target = null
          continue
        }
        r.s += r.dir * P.droneSpeed * P.dt
        if (r.s >= r.target.segEnd) {
          r.s = r.target.segEnd
          r.dir = -1
        }
        if (r.s <= r.target.segStart) {
          r.s = r.target.segStart
          r.dir = 1
        }
        availableCount++
      }
    }

    availabilityHistory.push({ t, available: availableCount })

    // (c) admit new accidents
    while (
      nextAccIdx < accidents.length &&
      accidents[nextAccIdx].time <= t
    ) {
      active.push(accidents[nextAccIdx])
      nextAccIdx++
    }

    // (d) check detection for each active accident
    for (let i = active.length - 1; i >= 0; i--) {
      const acc = active[i]
      const rs = roadStates[acc.roadIdx]
      const accPos = positionAt(rs.path, acc.s)

      let detected = false
      // Check patrol drones on the same road
      for (const d of rs.droneStates) {
        if (d.state !== 'patrolling') continue
        const dPos = positionAt(rs.path, d.s)
        const dist = Math.hypot(accPos[0] - dPos[0], accPos[1] - dPos[1])
        if (dist <= P.sensingRange) {
          acc.detected = true
          acc.detectionTime = t - acc.time
          if (acc.detectionTime > 0) dispatchAttempts.covered++
          detected = true
          active.splice(i, 1)
          break
        }
      }
      if (detected) continue

      // Check reserves currently covering on this road's segment
      for (const r of reserves) {
        if (r.state !== 'covering') continue
        // Reserves cover a specific drone's segment, identified by target
        const targetRoad = roadStates.find((x) =>
          x.droneStates.includes(r.target)
        )
        if (targetRoad !== rs) continue
        const rPos = positionAt(rs.path, r.s)
        const dist = Math.hypot(accPos[0] - rPos[0], accPos[1] - rPos[1])
        if (dist <= P.sensingRange) {
          acc.detected = true
          acc.detectionTime = t - acc.time
          if (acc.detectionTime > 0) dispatchAttempts.delayed++
          detected = true
          active.splice(i, 1)
          break
        }
      }
      if (detected) continue

      // Timeout
      if (t - acc.time > P.maxDetectionWindow) {
        acc.missed = true
        active.splice(i, 1)
      }
    }
  }

  // Mark any accidents still active at the end as missed.
  for (const acc of active) {
    acc.missed = true
  }

  const detectedAccidents = accidents.filter((a) => a.detected)
  const missedAccidents = accidents.filter((a) => a.missed && !a.detected)

  return {
    accidents,
    availabilityHistory,
    detectionTimes: detectedAccidents.map((a) => a.detectionTime),
    nDetected: detectedAccidents.length,
    nMissed: missedAccidents.length,
    nTotal: accidents.length,
    pUnder2Min: detectedAccidents.length === 0
      ? 0
      : detectedAccidents.filter((a) => a.detectionTime <= 120).length /
        accidents.length,
    avgDetectionTime: detectedAccidents.length === 0
      ? null
      : detectedAccidents.reduce((s, a) => s + a.detectionTime, 0) /
        detectedAccidents.length,
  }
}
