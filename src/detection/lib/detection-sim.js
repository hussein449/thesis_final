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
 * projection anchored at each road's first polyline vertex. For the ~28 km
 * Khalde→Awali stretch of M51 the worst-case east-west distortion is well
 * under 0.5 % between the Khalde anchor (≈33.78°N) and the Awali terminus
 * (≈33.60°N), far below the 200 m sensing radius used by the detector.
 */

// ---------------------------------------------------------------------------
// Geometry helpers (live in src/lib/geometry.js — re-exported here so existing
// importers of detection-sim continue to work)
// ---------------------------------------------------------------------------

export {
  projectToMeters,
  unprojectMeters,
  buildRoadPath,
  positionAt,
} from '../../lib/geometry'

import {
  buildRoadPath,
  positionAt,
} from '../../lib/geometry'

// ---------------------------------------------------------------------------
// Section-time-slot accident model (§4-§5 of the simplified-model report)
// ---------------------------------------------------------------------------

import {
  defaultSectionScores,
  computeRiskMatrix,
  dailyAccidentRate,
} from '../../partitioning/lib/risk-scoring'

import {
  computeSlotProbabilities,
  computeSectionTimeSlotRates,
  generateAccidentsForDay,
} from '../../partitioning/lib/accident-generator'

import {
  buildSections,
} from '../../partitioning/lib/sections'

import {
  buildPatrolSegments,
} from '../../partitioning/lib/uav-segments'

import {
  computeIotDetection,
  DEFAULT_R_IOT,
} from './iot-alert'

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

  // [LIT/DESIGN] In the IoT-alert model (§9-§12 of the simplified-model
  //         report) this is the IoT communication range R_IoT, not an
  //         optical sensing radius. The ground IoT sensor near the accident
  //         transmits an alert; the UAV receives it when it enters the
  //         signal zone [s_k - R_IoT, s_k + R_IoT]. 200 m matches the
  //         optical sensing radius from the prior model, so detection
  //         statistics stay comparable until tuned.
  sensingRange: 200,         // m (== R_IoT for the IoT alert model)
  iotRange: DEFAULT_R_IOT,   // alias, in case callers prefer the IoT term

  // §6 — UAV patrol segmentation mode. 'uniform' divides the corridor
  // into M equal-length segments; 'risk-aware' groups 1-km sections so
  // each UAV's segment carries roughly equal cumulative risk. The
  // Monte Carlo runner sets this from the policy (uniform vs riskAware)
  // before each sweep point, so the two policies are now genuinely
  // distinct on a single-corridor configuration.
  patrolMode: 'uniform',

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

  // Accident generation — section-time-slot Poisson model (§4-§5 of the
  // simplified-model report). For each road:
  //   d_total/day        = (accidents × accidentRateMultiplier) / 365
  //   λ_{i,b}/day        = (d_total/B) · P(i|b)
  //   N_{i,b}(d)         ~ Poisson(λ_{i,b}/day)
  //   τ_k ~ U(t_b_start, t_b_end);  s_k ~ U(s_i_start, s_i_end)
  //
  // accidentRateMultiplier acts on d_total (uniform across slots).
  // simStartHour sets where the trial window starts in the day, which
  // determines which time slot(s) the trial samples from.
  accidentRateMultiplier: 30,    // [TUNING] above real-world rates so a 1-hour
                                 // trial produces statistically meaningful
                                 // counts; thesis figures should disclose this
                                 // factor when reporting "trials per fleet size".
  simStartHour: 8,               // [DESIGN] hour of day (0-24) at which a trial
                                 // begins. 8 = morning rush (slot 2). The 5
                                 // time slots are 00-06, 06-10, 10-16, 16-20,
                                 // 20-24 (per the simplified-model report §3).
}

// ---------------------------------------------------------------------------
// Schedule builder for the section-time-slot Poisson model
// ---------------------------------------------------------------------------

/**
 * Build (or rebuild) the per-road risk + rate model used to generate
 * accidents. Each entry contains:
 *   { road, scores, riskMatrix, slotProbs, rateMatrix }
 * The road is keyed by id; results are cached for the lifetime of the
 * module since the input (road object) is immutable in practice.
 */
const _roadModelCache = new Map()
function getRoadRiskModel(road) {
  const cached = _roadModelCache.get(road.id)
  if (cached && cached._sig === road.accidents) return cached
  const sections = buildSections(road.lengthKm)
  const scores = defaultSectionScores(road)
  const riskMatrix = computeRiskMatrix(scores)
  const slotProbs = computeSlotProbabilities(riskMatrix)
  const rateMatrix = computeSectionTimeSlotRates(dailyAccidentRate(road.accidents), slotProbs)
  const model = { sections, scores, riskMatrix, slotProbs, rateMatrix, _sig: road.accidents }
  _roadModelCache.set(road.id, model)
  return model
}

/**
 * Generate the accident schedule for one trial using the section-time-slot
 * Poisson model.
 *
 * For each road in `roadStates`:
 *   1. Look up its cached risk + rate model.
 *   2. Scale every λ_{i,b} by params.accidentRateMultiplier (stress factor).
 *   3. Sample Poisson events for each day that intersects the trial window
 *      [simStartHour, simStartHour + totalTime/3600).
 *   4. Convert each event:
 *        time          = (globalHour − simStartHour) × 3600   (seconds)
 *        s (meters)    = e.s × 1000                          (km → m)
 *      plus extra fields {sectionIndex, timeSlot, tau} for downstream UIs
 *      that want to inspect the section/slot a given event came from.
 *
 * Returns events sorted by time, in the same shape the rest of the engine
 * already consumes.
 */
function generateAccidentSchedule(roadStates, params, rng) {
  const totalHours = params.totalTime / 3600
  const startHour = params.simStartHour ?? 0
  const endHour = startHour + totalHours
  const startDay = Math.floor(startHour / 24)
  const endDay = Math.floor(endHour / 24)
  const mult = params.accidentRateMultiplier ?? 1
  const events = []
  for (let r = 0; r < roadStates.length; r++) {
    const rs = roadStates[r]
    const model = getRoadRiskModel(rs.road)
    // Apply the stress multiplier per (section, slot).
    const scaledRate = model.rateMatrix.map((row) => ({
      sectionIndex: row.sectionIndex,
      sStart: row.sStart,
      sEnd: row.sEnd,
      lambda: row.lambda.map((l) => l * mult),
    }))
    for (let d = startDay; d <= endDay; d++) {
      const dayEvents = generateAccidentsForDay(scaledRate, d, rng)
      for (const e of dayEvents) {
        const globalHour = d * 24 + e.tau
        if (globalHour < startHour || globalHour >= endHour) continue
        events.push({
          time: (globalHour - startHour) * 3600,
          roadIdx: r,
          s: e.s * 1000,
          sectionIndex: e.sectionIndex,
          timeSlot: e.timeSlot,
          tau: e.tau,
          detected: false,
          detectionTime: null,
          missed: false,
        })
      }
    }
  }
  events.sort((a, b) => a.time - b.time)
  return events
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
  // Separate, policy-independent RNG for the accident schedule. Both
  // Uniform and Risk-aware policies hit simulateOnce with the same
  // seed for the same (trial, N) pair; using a dedicated RNG that does
  // NOT see drone-setup consumption guarantees that the §14 metric
  // requirement — "use the same accident events for both patrol
  // strategies (fair comparison)" — holds even if future drone-setup
  // changes consume different RNG counts per policy.
  const accidentRng = makeRng((seed * 2654435761) | 0)

  // Per-road state. Patrol segments come from §6 of the simplified-model
  // report (uniform vs. risk-aware). Each UAV is assigned exactly one
  // patrol segment [A_m, B_m] in meters along the corridor.
  const roadStates = allocation.map(({ road, drones: nDrones }) => {
    const path = buildRoadPath(road)
    const model = getRoadRiskModel(road)
    const segments = nDrones > 0
      ? buildPatrolSegments({
          mode: P.patrolMode ?? 'uniform',
          corridorLengthM: path.totalLength,
          M: nDrones,
          sections: model.sections,
          riskMatrix: model.riskMatrix,
        })
      : []
    const droneStates = []
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      droneStates.push({
        s: seg.A + rng() * (seg.B - seg.A),
        dir: rng() < 0.5 ? 1 : -1,
        segStart: seg.A,
        segEnd: seg.B,
        patrolIdx: seg.index,            // 1-based, used for IoT 3-candidate lookup
        battery: 60 + rng() * 40,
        state: 'patrolling',             // patrolling | returning | docked
        phaseEnd: 0,
      })
    }
    return {
      road,
      path,
      segments,
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

  // Pre-generate accident schedule via the section-time-slot model.
  // Uses the dedicated accidentRng so two policies running the same
  // (trial, N) seed get an identical event sequence.
  const accidents = generateAccidentSchedule(roadStates, P, accidentRng)

  // Step the simulation
  const availabilityHistory = []
  const dispatchAttempts = { covered: 0, delayed: 0 }
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

    // (c) admit new accidents — IoT alert model from §10-§12.
    // Detection time is computed in closed form at the moment of admission:
    // for the patrol segment m containing s_k, test only candidates
    // j ∈ {m-1, m, m+1}; reserves currently covering one of those segments
    // can stand in for a returning/docked UAV. T_alert is the minimum
    // alert time across the up-to-3 candidates that are actually patrolling.
    while (
      nextAccIdx < accidents.length &&
      accidents[nextAccIdx].time <= t
    ) {
      const acc = accidents[nextAccIdx]
      const rs = roadStates[acc.roadIdx]
      const uavStates = {}
      for (const d of rs.droneStates) {
        if (d.state === 'patrolling') {
          uavStates[d.patrolIdx] = { sj: d.s, dj: d.dir }
        }
      }
      // A covering reserve replaces its target patrol UAV in the candidate set.
      for (const r of reserves) {
        if (r.state !== 'covering' || !r.target) continue
        if (!rs.droneStates.includes(r.target)) continue
        if (uavStates[r.target.patrolIdx]) continue
        uavStates[r.target.patrolIdx] = { sj: r.s, dj: r.dir }
      }
      const detection = computeIotDetection({
        segments: rs.segments,
        uavStates,
        sk: acc.s,
        R_IoT: P.sensingRange ?? P.iotRange ?? DEFAULT_R_IOT,
        v: P.droneSpeed,
        t,
      })
      if (detection.tAlert != null && detection.tAlert <= P.maxDetectionWindow) {
        acc.detected = true
        acc.detectionTime = detection.tAlert
        acc.responder = detection.responder
        // Distinguish "covered by own patrol" vs. "covered by reserve" by
        // checking which UAV won.
        const responder = rs.droneStates.find(
          (d) => d.patrolIdx === detection.responder && d.state === 'patrolling'
        )
        if (responder) dispatchAttempts.covered++
        else dispatchAttempts.delayed++
      } else {
        acc.missed = true
      }
      nextAccIdx++
    }
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
  // Same separate-RNG trick as simulateOnce — keeps the accident
  // sequence identical across dispatch rules / policies for fair
  // comparison.
  const accidentRng = makeRng((seed * 2654435761) | 0)

  const roadStates = allocation.map(({ road, drones: nDrones }) => {
    const path = buildRoadPath(road)
    const model = getRoadRiskModel(road)
    const segments = nDrones > 0
      ? buildPatrolSegments({
          mode: P.patrolMode ?? 'uniform',
          corridorLengthM: path.totalLength,
          M: nDrones,
          sections: model.sections,
          riskMatrix: model.riskMatrix,
        })
      : []
    const droneStates = []
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      droneStates.push({
        idx: i,
        s: seg.A + rng() * (seg.B - seg.A),
        dir: rng() < 0.5 ? 1 : -1,
        segStart: seg.A,
        segEnd: seg.B,
        patrolIdx: seg.index,
        battery: 60 + rng() * 40,
        state: 'patrolling',
        phaseEnd: 0,
        dispatches: 0,
      })
    }
    return { road, path, segments, droneStates, nAssigned: nDrones }
  })

  // Pre-generate accidents via the section-time-slot model.
  const accidents = generateAccidentSchedule(roadStates, P, accidentRng)
  for (const a of accidents) a.dispatchedAt = null

  const availabilityHistory = []
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

    // Admit new accidents. This entry point studies dispatch rules — it
    // keeps the "teleport-to-accident" model so the three dispatch rules
    // (nearest / batteryFirst / balanced) remain a meaningful comparison.
    // The canonical IoT alert detection lives in simulateOnce.
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
          chosen = candidates.reduce((best, d) => d.dispatches < best.dispatches ? d : best)
        }
        const travelTime = Math.abs(chosen.s - acc.s) / P.droneSpeed
        acc.detectionTime = travelTime
        acc.detected = true
        acc.dispatchedAt = t
        chosen.dispatches++
      } else {
        acc.missed = true
      }
      nextAccIdx++
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
  // Dedicated accident RNG — matches simulateOnce so exported logs use
  // the same event sequence as the Monte Carlo metrics.
  const accidentRng = makeRng(((seed ?? 42) * 2654435761) | 0)

  const roadStates = allocation.map(({ road, drones: nDrones }) => {
    const path = buildRoadPath(road)
    const model = getRoadRiskModel(road)
    const segments = nDrones > 0
      ? buildPatrolSegments({
          mode: P.patrolMode ?? 'uniform',
          corridorLengthM: path.totalLength,
          M: nDrones,
          sections: model.sections,
          riskMatrix: model.riskMatrix,
        })
      : []
    const droneStates = []
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      droneStates.push({
        id: `${road.shortName}-${i + 1}`,
        corridor: road.name,
        s: seg.A + rng() * (seg.B - seg.A),
        dir: rng() < 0.5 ? 1 : -1,
        segStart: seg.A,
        segEnd: seg.B,
        patrolIdx: seg.index,
        battery: 60 + rng() * 40,
        state: 'patrolling',
        phaseEnd: 0,
      })
    }
    return { road, path, segments, droneStates }
  })

  // Pre-generate accidents via the section-time-slot model.
  const accidents = generateAccidentSchedule(roadStates, P, accidentRng)
  for (let i = 0; i < accidents.length; i++) {
    accidents[i].accidentId = i + 1
    accidents[i].corridor = roadStates[accidents[i].roadIdx].road.name
  }

  const droneLog = []
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

    // IoT alert detection — closed-form at admission (matches simulateOnce).
    while (nextAccIdx < accidents.length && accidents[nextAccIdx].time <= t) {
      const acc = accidents[nextAccIdx]
      const rs = roadStates[acc.roadIdx]
      const uavStates = {}
      for (const d of rs.droneStates) {
        if (d.state === 'patrolling') {
          uavStates[d.patrolIdx] = { sj: d.s, dj: d.dir }
        }
      }
      const detection = computeIotDetection({
        segments: rs.segments,
        uavStates,
        sk: acc.s,
        R_IoT: P.sensingRange ?? P.iotRange ?? DEFAULT_R_IOT,
        v: P.droneSpeed,
        t,
      })
      if (detection.tAlert != null && detection.tAlert <= P.maxDetectionWindow) {
        acc.detected = true
        acc.detectionTime = +detection.tAlert.toFixed(1)
        const responder = rs.droneStates.find((d) => d.patrolIdx === detection.responder)
        acc.respondingUAV = responder?.id ?? ''
      } else {
        acc.missed = true
      }
      nextAccIdx++
    }
  }

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

  // Build drone list with initial battery (staggered so not all dock at once).
  // Patrol segments come from §6 (uniform vs risk-aware).
  const drones = []
  allocation.forEach(({ road, drones: nDrones }, ri) => {
    const path = buildRoadPath(road)
    if (nDrones === 0) return
    const model = getRoadRiskModel(road)
    const segments = buildPatrolSegments({
      mode: P.patrolMode ?? 'uniform',
      corridorLengthM: path.totalLength,
      M: nDrones,
      sections: model.sections,
      riskMatrix: model.riskMatrix,
    })
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      drones.push({
        id: `${road.shortName}-${i + 1}`,
        label: `${road.shortName} #${i + 1}`,
        color: road.color,
        roadIdx: ri,
        segStart: seg.A,
        segEnd: seg.B,
        patrolIdx: seg.index,
        s: seg.A + rng() * (seg.B - seg.A),
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
    const model = getRoadRiskModel(road)
    const segments = buildPatrolSegments({
      mode: P.patrolMode ?? 'uniform',
      corridorLengthM: path.totalLength,
      M: nDrones,
      sections: model.sections,
      riskMatrix: model.riskMatrix,
    })
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      drones.push({
        id: `${road.shortName}-${i + 1}`,
        label: `${road.shortName} #${i + 1}`,
        color: road.color,
        roadPath: path,
        segStart: seg.A,
        segEnd: seg.B,
        patrolIdx: seg.index,
        s: seg.A + rng() * (seg.B - seg.A),
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
