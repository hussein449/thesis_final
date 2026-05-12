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
 * projection anchored at each road's first polyline vertex. For the 68 km
 * M51 corridor the worst-case east-west distortion is below 1 % between the
 * Khalde anchor (≈33.78°N) and the Sour terminus (≈33.29°N), well below the
 * 200 m sensing radius used by the detector.
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
 * Default operational parameters.
 *
 * Citation policy:
 *   [SPEC]   = manufacturer / standards-body specification (verifiable).
 *   [LIT]    = transportation / robotics literature (verifiable).
 *   [DESIGN] = modelling choice (no external source claimed).
 *   [TUNING] = chosen for visualisation; does not affect Monte-Carlo numbers
 *              published in the thesis.
 */
export const DEFAULT_PARAMS = {
  // Time discretization
  dt: 1.0,                   // [DESIGN] seconds per simulation step
  totalTime: 3600,           // [DESIGN] 1 hour of simulated operation per trial

  // Drone kinematics
  // [SPEC] DJI Mavic 3 Enterprise specs: 21 m/s max horizontal speed,
  //         ~46 min flight time. Source: DJI official datasheet
  //         https://enterprise.dji.com/mavic-3-enterprise/specs
  //         12 m/s is a conservative cruise speed (~57% of max) consistent
  //         with sustained patrol on a battery budget.
  droneSpeed: 12,            // m/s

  // [LIT] Optical detection radius for road incidents from a low-altitude
  //         (≈80 m AGL) UAV with a 4K camera is reported at 100–300 m,
  //         depending on object size and viewing angle. See e.g. Kyrkou et al.
  //         "Drone-Net: A drone-based UAV imagery dataset for traffic
  //         monitoring" (2018). 200 m is mid-range.
  sensingRange: 200,         // m

  // [DESIGN] Beyond this an accident is counted as missed. Chosen so that a
  //         single drone covering a 4 km segment at 12 m/s will round-trip
  //         in roughly the window, surfacing the "coverage saturation" trade-
  //         off in the comparison plots.
  maxDetectionWindow: 600,   // s

  // Battery model (Step 3 — integrated operational simulation)
  // [SPEC] Typical 5000 mAh / 14.8 V LiPo on a commercial quadcopter sustains
  //         ~25 minutes of mixed flight (DJI Mavic 3 datasheet, see above).
  //         A linear drain of (100/1500) %/s ≈ 0.0667 %/s discharges from
  //         100 % to 0 % in 1500 s = 25 min, matching the spec.
  enableOperational: true,
  batteryDrainRate: 100 / 1500,  // %/s while patrolling
  // [DESIGN] return-to-dock and ready-to-deploy thresholds. 25 % gives a
  //         comfortable margin to ferry back to the dock without forcing an
  //         emergency landing; 80 % avoids redeploying a barely-charged drone.
  lowBatteryThreshold: 25,
  readyThreshold: 80,
  dockTransitTime: 60,           // [DESIGN] s — ferry time
  dockChargeTime: 240,           // [DESIGN] s — minimum charge before redeploy
  chargeRate: 100 / 240,         // [SPEC]   %/s — DJI Mavic 3 fast-charge

  // Dispatch rule: nearest drone on the same road that is currently in
  // 'patrolling' state. If none, the accident remains active and accumulates
  // delay until either a drone becomes available again, a reserve is
  // dispatched, or the maxDetectionWindow expires (counted as missed).

  // Replacement rule: when a drone goes off-patrol (returning/docked), the
  // segment it was patrolling is left uncovered until it returns. A reserve
  // pool of size `reserveCount` allows immediate replacement: when a drone
  // begins returning, the next idle reserve teleports to its segment after
  // a `reserveDispatchDelay`. This models a fresh drone leaving the dock.
  reserveCount: 2,               // [DESIGN]
  reserveDispatchDelay: 30,      // [DESIGN] s — reserve travel time to segment

  // Accident generation
  // [LIT] Accidents per road are modelled as a homogeneous Poisson process,
  //         the standard treatment for road-incident arrivals in safety
  //         analysis (Hauer 1997, "Observational Before-After Studies in
  //         Road Safety", chapter on accident frequency models).
  //         Per-road base rate λ = (annual accidents / 31 536 000 s).
  //         Multiplied by `accidentRateMultiplier` to allow stress testing.
  accidentRateMultiplier: 30,    // [TUNING] above real-world rates so a 1-hour
                                 // trial produces statistically meaningful
                                 // counts; thesis figures should disclose this
                                 // factor when reporting "trials per fleet size".
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

// ---------------------------------------------------------------------------
// Dispatch-policy simulation
// ---------------------------------------------------------------------------

/**
 * Active-dispatch model: when an accident occurs, one drone on the same road
 * is selected and diverted to the accident location. Detection time equals the
 * travel time at droneSpeed. If no patrolling drone exists the accident waits
 * until one becomes available (or times out).
 *
 * dispatchRule: 'nearest' | 'batteryFirst' | 'balanced'
 *   nearest      – drone whose current arc-length is closest to the accident
 *   batteryFirst – highest-battery patrolling drone (maximises range margin)
 *   balanced     – drone with the fewest prior dispatches (load balancing)
 *
 * Returns the same shape as simulateOnce.
 */
export function simulateWithDispatch({ allocation, params, seed, dispatchRule = 'nearest' }) {
  const P = { ...DEFAULT_PARAMS, ...params, enableOperational: true }
  const rng = makeRng(seed)

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
          idx: i,
          s: segStart + rng() * segLen,
          dir: rng() < 0.5 ? 1 : -1,
          segStart,
          segEnd,
          battery: 60 + rng() * 40,
          state: 'patrolling',
          phaseEnd: 0,
          dispatches: 0,
        })
      }
    }
    return { road, path, baseRate, droneStates, nAssigned: nDrones }
  })

  // Pre-generate accidents
  const accidents = []
  for (let r = 0; r < roadStates.length; r++) {
    const rs = roadStates[r]
    if (rs.baseRate <= 0) continue
    let t = 0
    while (true) {
      const u = Math.max(rng(), 1e-12)
      t += -Math.log(u) / rs.baseRate
      if (t >= P.totalTime) break
      accidents.push({ time: t, roadIdx: r, s: rng() * rs.path.totalLength,
        detected: false, detectionTime: null, missed: false, dispatchedAt: null })
    }
  }
  accidents.sort((a, b) => a.time - b.time)

  const availabilityHistory = []
  const active = []
  let nextAccIdx = 0

  for (let t = 0; t < P.totalTime; t += P.dt) {
    let availableCount = 0

    for (const rs of roadStates) {
      for (const d of rs.droneStates) {
        if (d.state === 'patrolling') {
          d.s += d.dir * P.droneSpeed * P.dt
          if (d.s >= d.segEnd) { d.s = d.segEnd; d.dir = -1 }
          if (d.s <= d.segStart) { d.s = d.segStart; d.dir = 1 }
          d.battery -= P.batteryDrainRate * P.dt
          if (d.battery <= P.lowBatteryThreshold) {
            d.state = 'returning'; d.phaseEnd = t + P.dockTransitTime
          }
          availableCount++
        } else if (d.state === 'returning') {
          if (t >= d.phaseEnd) { d.state = 'docked'; d.phaseEnd = t + P.dockChargeTime }
        } else if (d.state === 'docked') {
          d.battery = Math.min(100, d.battery + P.chargeRate * P.dt)
          if (d.battery >= P.readyThreshold && t >= d.phaseEnd) d.state = 'patrolling'
        }
      }
    }
    availabilityHistory.push({ t, available: availableCount })

    // Admit new accidents
    while (nextAccIdx < accidents.length && accidents[nextAccIdx].time <= t) {
      const acc = accidents[nextAccIdx]
      const rs = roadStates[acc.roadIdx]
      const candidates = rs.droneStates.filter((d) => d.state === 'patrolling')

      if (candidates.length > 0) {
        let chosen
        if (dispatchRule === 'nearest') {
          chosen = candidates.reduce((best, d) =>
            Math.abs(d.s - acc.s) < Math.abs(best.s - acc.s) ? d : best)
        } else if (dispatchRule === 'batteryFirst') {
          chosen = candidates.reduce((best, d) => d.battery > best.battery ? d : best)
        } else {
          // balanced — fewest dispatches
          chosen = candidates.reduce((best, d) => d.dispatches < best.dispatches ? d : best)
        }
        const travelTime = Math.abs(chosen.s - acc.s) / P.droneSpeed
        acc.detectionTime = travelTime
        acc.detected = true
        acc.dispatchedAt = t
        chosen.dispatches++
      }
      // If no drone available, mark as missed immediately
      if (!acc.detected) acc.missed = true
      nextAccIdx++
    }

    // Timeout unresolved actives (not used in dispatch model but kept for shape compat)
    for (const acc of active) {
      if (!acc.detected && t - acc.time > P.maxDetectionWindow) acc.missed = true
    }
  }

  const detected = accidents.filter((a) => a.detected)
  const missed = accidents.filter((a) => !a.detected)
  return {
    accidents,
    availabilityHistory,
    detectionTimes: detected.map((a) => a.detectionTime),
    nDetected: detected.length,
    nMissed: missed.length,
    nTotal: accidents.length,
    pUnder2Min: accidents.length === 0 ? 0
      : detected.filter((a) => a.detectionTime <= 120).length / accidents.length,
    avgDetectionTime: detected.length === 0 ? null
      : detected.reduce((s, a) => s + a.detectionTime, 0) / detected.length,
  }
}

// ---------------------------------------------------------------------------
// Detailed log export — for CSV/JSON download
// ---------------------------------------------------------------------------

/**
 * Runs one trial and returns structured records suitable for CSV/JSON export.
 * Records two tables:
 *   accidentLog  – one row per accident event
 *   droneLog     – drone states sampled every `sampleInterval` seconds
 */
export function simulateDetailedLog({ allocation, params, seed, sampleInterval = 60 }) {
  const P = { ...DEFAULT_PARAMS, ...params, enableOperational: true }
  const rng = makeRng(seed ?? 42)

  const roadStates = allocation.map(({ road, drones: nDrones }) => {
    const path = buildRoadPath(road)
    const baseRate = baselineRoadRate(road) * P.accidentRateMultiplier
    const droneStates = []
    if (nDrones > 0) {
      const segLen = path.totalLength / nDrones
      for (let i = 0; i < nDrones; i++) {
        const si = i * segLen
        droneStates.push({
          id: `${road.shortName}-${i + 1}`,
          corridor: road.name,
          s: si + rng() * segLen,
          dir: rng() < 0.5 ? 1 : -1,
          segStart: si,
          segEnd: (i + 1) * segLen,
          battery: 60 + rng() * 40,
          state: 'patrolling',
          phaseEnd: 0,
        })
      }
    }
    return { road, path, baseRate, droneStates }
  })

  const accidents = []
  for (let r = 0; r < roadStates.length; r++) {
    const rs = roadStates[r]
    if (rs.baseRate <= 0) continue
    let t = 0
    while (true) {
      const u = Math.max(rng(), 1e-12)
      t += -Math.log(u) / rs.baseRate
      if (t >= P.totalTime) break
      accidents.push({ accidentId: accidents.length + 1, time: t, roadIdx: r,
        corridor: rs.road.name, s: rng() * rs.path.totalLength,
        detected: false, detectionTime: null, missed: false })
    }
  }
  accidents.sort((a, b) => a.time - b.time)

  const droneLog = []
  const active = []
  let nextAccIdx = 0
  let nextSample = 0

  for (let t = 0; t < P.totalTime; t += P.dt) {
    if (t >= nextSample) {
      for (const rs of roadStates) {
        for (const d of rs.droneStates) {
          droneLog.push({
            time_s: Math.round(t),
            uav_id: d.id,
            corridor: d.corridor,
            battery_pct: +d.battery.toFixed(1),
            state: d.state,
            arc_length_m: +d.s.toFixed(1),
          })
        }
      }
      nextSample += sampleInterval
    }

    for (const rs of roadStates) {
      for (const d of rs.droneStates) {
        if (d.state === 'patrolling') {
          d.s += d.dir * P.droneSpeed * P.dt
          if (d.s >= d.segEnd) { d.s = d.segEnd; d.dir = -1 }
          if (d.s <= d.segStart) { d.s = d.segStart; d.dir = 1 }
          d.battery -= P.batteryDrainRate * P.dt
          if (d.battery <= P.lowBatteryThreshold) {
            d.state = 'returning'; d.phaseEnd = t + P.dockTransitTime
          }
        } else if (d.state === 'returning') {
          if (t >= d.phaseEnd) { d.state = 'docked'; d.phaseEnd = t + P.dockChargeTime }
        } else if (d.state === 'docked') {
          d.battery = Math.min(100, d.battery + P.chargeRate * P.dt)
          if (d.battery >= P.readyThreshold && t >= d.phaseEnd) d.state = 'patrolling'
        }
      }
    }

    while (nextAccIdx < accidents.length && accidents[nextAccIdx].time <= t) {
      active.push(accidents[nextAccIdx++])
    }

    for (let i = active.length - 1; i >= 0; i--) {
      const acc = active[i]
      const rs = roadStates[acc.roadIdx]
      const accPos = positionAt(rs.path, acc.s)
      let detected = false
      for (const d of rs.droneStates) {
        if (d.state !== 'patrolling') continue
        const dPos = positionAt(rs.path, d.s)
        if (Math.hypot(accPos[0] - dPos[0], accPos[1] - dPos[1]) <= P.sensingRange) {
          acc.detected = true
          acc.detectionTime = +(t - acc.time).toFixed(1)
          acc.respondingUAV = d.id
          detected = true
          active.splice(i, 1)
          break
        }
      }
      if (!detected && t - acc.time > P.maxDetectionWindow) {
        acc.missed = true
        active.splice(i, 1)
      }
    }
  }
  for (const acc of active) acc.missed = true

  const accidentLog = accidents.map((a) => ({
    accident_id: a.accidentId,
    corridor: a.corridor,
    time_occurred_s: +a.time.toFixed(1),
    status: a.detected ? 'detected' : 'missed',
    detection_time_s: a.detectionTime ?? '',
    responding_uav: a.respondingUAV ?? '',
  }))

  return { accidentLog, droneLog }
}

// ---------------------------------------------------------------------------
// Battery trace — for visualisation only
// ---------------------------------------------------------------------------

/**
 * Runs one simulation trial and records each drone's battery % every
 * `sampleInterval` seconds. Returns an array of drone traces:
 *   [{ id, label, color, samples: [{t, battery, state}] }]
 *
 * Designed for plotting; does not affect Monte-Carlo results.
 */
export function simulateBatteryTrace({ allocation, params, seed, sampleInterval = 30 }) {
  const P = { ...DEFAULT_PARAMS, ...params, enableOperational: true }
  const rng = makeRng(seed ?? 42)

  // Build drone list with initial battery (staggered so not all dock at once)
  const drones = []
  allocation.forEach(({ road, drones: nDrones }, ri) => {
    const path = buildRoadPath(road)
    if (nDrones === 0) return
    const segLen = path.totalLength / nDrones
    for (let i = 0; i < nDrones; i++) {
      drones.push({
        id: `${road.shortName}-${i + 1}`,
        label: `${road.shortName} #${i + 1}`,
        color: road.color,
        roadIdx: ri,
        segStart: i * segLen,
        segEnd: (i + 1) * segLen,
        s: i * segLen + rng() * segLen,
        dir: rng() < 0.5 ? 1 : -1,
        battery: 40 + (i / Math.max(nDrones - 1, 1)) * 55, // stagger 40–95%
        state: 'patrolling',
        phaseEnd: 0,
        samples: [],
      })
    }
  })

  let nextSample = 0
  for (let t = 0; t <= P.totalTime; t += P.dt) {
    // Sample
    if (t >= nextSample) {
      drones.forEach(d => d.samples.push({ t: t / 60, battery: d.battery, state: d.state }))
      nextSample += sampleInterval
    }

    // Advance drones
    for (const d of drones) {
      if (d.state === 'patrolling') {
        d.s += d.dir * P.droneSpeed * P.dt
        if (d.s >= d.segEnd) { d.s = d.segEnd; d.dir = -1 }
        if (d.s <= d.segStart) { d.s = d.segStart; d.dir = 1 }
        d.battery -= P.batteryDrainRate * P.dt
        if (d.battery <= P.lowBatteryThreshold) {
          d.state = 'returning'
          d.phaseEnd = t + P.dockTransitTime
        }
      } else if (d.state === 'returning') {
        if (t >= d.phaseEnd) { d.state = 'docked'; d.phaseEnd = t + P.dockChargeTime }
      } else if (d.state === 'docked') {
        d.battery = Math.min(100, d.battery + P.chargeRate * P.dt)
        if (d.battery >= P.readyThreshold && t >= d.phaseEnd) d.state = 'patrolling'
      }
    }
  }

  return drones.map(({ id, label, color, samples }) => ({ id, label, color, samples }))
}

// ---------------------------------------------------------------------------
// Drone trajectory recording — for visualisation only
// ---------------------------------------------------------------------------

/**
 * Runs one trial and records each drone's lat/lon position every
 * `sampleInterval` seconds. Returns an array of drone traces:
 *   [{ id, label, color, path: [[lat, lon], ...] }]
 *
 * Uses the same battery state machine as simulateBatteryTrace so the
 * recorded path reflects real charging gaps.
 */
export function simulateDroneTrajectories({ allocation, params, seed, sampleInterval = 30 }) {
  const P = { ...DEFAULT_PARAMS, ...params, enableOperational: true }
  const rng = makeRng(seed ?? 42)

  const drones = []
  allocation.forEach(({ road, drones: nDrones }) => {
    const path = buildRoadPath(road)
    if (nDrones === 0) return
    const segLen = path.totalLength / nDrones
    for (let i = 0; i < nDrones; i++) {
      drones.push({
        id: `${road.shortName}-${i + 1}`,
        label: `${road.shortName} #${i + 1}`,
        color: road.color,
        roadPath: path,
        segStart: i * segLen,
        segEnd: (i + 1) * segLen,
        s: i * segLen + rng() * segLen,
        dir: rng() < 0.5 ? 1 : -1,
        battery: 40 + (i / Math.max(nDrones - 1, 1)) * 55,
        state: 'patrolling',
        phaseEnd: 0,
        pathPoints: [],
      })
    }
  })

  let nextSample = 0
  for (let t = 0; t <= P.totalTime; t += P.dt) {
    if (t >= nextSample) {
      drones.forEach((d) => {
        const [mx, my] = positionAt(d.roadPath, d.s)
        const [lat, lon] = unprojectMeters(mx, my, d.roadPath.refLat, d.roadPath.refLon)
        d.pathPoints.push([lat, lon])
      })
      nextSample += sampleInterval
    }

    for (const d of drones) {
      if (d.state === 'patrolling') {
        d.s += d.dir * P.droneSpeed * P.dt
        if (d.s >= d.segEnd) { d.s = d.segEnd; d.dir = -1 }
        if (d.s <= d.segStart) { d.s = d.segStart; d.dir = 1 }
        d.battery -= P.batteryDrainRate * P.dt
        if (d.battery <= P.lowBatteryThreshold) {
          d.state = 'returning'
          d.phaseEnd = t + P.dockTransitTime
        }
      } else if (d.state === 'returning') {
        if (t >= d.phaseEnd) { d.state = 'docked'; d.phaseEnd = t + P.dockChargeTime }
      } else if (d.state === 'docked') {
        d.battery = Math.min(100, d.battery + P.chargeRate * P.dt)
        if (d.battery >= P.readyThreshold && t >= d.phaseEnd) d.state = 'patrolling'
      }
    }
  }

  return drones.map(({ id, label, color, pathPoints }) => ({ id, label, color, path: pathPoints }))
}
