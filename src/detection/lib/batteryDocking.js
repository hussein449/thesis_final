/**
 * Event-Based Battery & Docking Simulator
 * =======================================
 *
 * Reference implementation of the "UAV Battery and Docking Layer" student
 * implementation note (Nov 2025). Pure analytical model:
 *
 *   - linear battery discharge during patrol / travel
 *   - linear charging at the dock
 *   - segment-dependent thresholds B_crit,m and B_min,m
 *   - shared docking station at the corridor mid-point
 *   - reserve UAV pool of size ⌈ρM⌉
 *   - event-driven (no time-stepping), deterministic
 *
 * This layer is intentionally INDEPENDENT of the accident-detection layer
 * in detection-sim.js — accidents are not modelled here, and detection
 * timing is not used. The two simulators can be run side by side.
 *
 * Imports from partitioning/ are read-only — we reuse the existing
 * uniform / risk-aware segmentation logic and the M51 corridor metadata.
 */

import { ROADS } from '../../partitioning/lib/roads.js'
import { buildPatrolSegments } from '../../partitioning/lib/uav-segments.js'
import { buildSections } from '../../partitioning/lib/sections.js'
import {
  defaultSectionScores,
  computeRiskMatrix,
} from '../../partitioning/lib/risk-scoring.js'

// ---------------------------------------------------------------------------
// Corridor metadata (M51 Khalde → Awali)
// ---------------------------------------------------------------------------

const M51 = ROADS.find((r) => r.shortName?.includes('M51')) ?? ROADS[0]
const CORRIDOR_LENGTH_KM = M51.lengthKm ?? 27.9
const CORRIDOR_LENGTH_M = CORRIDOR_LENGTH_KM * 1000
const DOCK_KM = CORRIDOR_LENGTH_KM / 2 // §7 — middle of corridor

// ---------------------------------------------------------------------------
// Default parameters (PDF §6 & §18)
// ---------------------------------------------------------------------------

/**
 * All times in MINUTES, all distances in KM, all batteries in %.
 *   v        — UAV cruise speed in km/min. 8 m/s ≈ 0.48 km/min.
 *   r_fly    — discharge rate (%/min) during patrol or travel.
 *   r_charge — charging rate (%/min) at the dock.
 *   B_safety — minimum battery to keep in reserve when returning.
 *   B_ready  — battery level a charging UAV must reach to re-enter pool.
 *   T_sim    — total simulated time (min). 1440 = 24 h.
 */
export const DEFAULT_PARAMS = {
  v: (8 * 60) / 1000, // 8 m/s → 0.48 km/min
  r_fly: 0.75,        // %/min
  r_charge: 1.0,      // %/min
  B_safety: 5,        // %
  B_ready: 100,       // %
  T_sim: 1440,        // min
}

export const CORRIDOR = {
  name: M51.shortName ?? 'M51 Khalde–Awali',
  lengthKm: CORRIDOR_LENGTH_KM,
  dockKm: DOCK_KM,
}

// ---------------------------------------------------------------------------
// Segment construction — delegates to existing partitioning code
// ---------------------------------------------------------------------------

let _riskModel = null
function getRiskModel() {
  if (_riskModel) return _riskModel
  const sections = buildSections(CORRIDOR_LENGTH_KM)
  const scores = defaultSectionScores(M51)
  const riskMatrix = computeRiskMatrix(scores)
  _riskModel = { sections, riskMatrix }
  return _riskModel
}

/**
 * Build M patrol segments for either 'uniform' or 'risk-aware' mode.
 * Returns segments augmented with the PDF's per-segment quantities:
 *   { index, A, B, length, sCenterKm, dDockKm, Ttravel, Bcrit, Bmin }
 */
export function buildBatterySegments(M, mode, params = {}) {
  const P = { ...DEFAULT_PARAMS, ...params }
  const raw =
    mode === 'uniform'
      ? buildPatrolSegments({ mode: 'uniform', corridorLengthM: CORRIDOR_LENGTH_M, M })
      : buildPatrolSegments({
          mode: 'risk-aware',
          M,
          ...getRiskModel(),
        })

  return raw.map((s) => {
    const aKm = s.A / 1000
    const bKm = s.B / 1000
    const sCenterKm = (aKm + bKm) / 2
    const dDockKm = Math.abs(sCenterKm - DOCK_KM)
    const Ttravel = dDockKm / P.v // min
    const Bcrit = P.r_fly * Ttravel + P.B_safety
    const Bmin = Bcrit + P.r_fly * Ttravel
    return {
      index: s.index,
      A: s.A,
      B: s.B,
      length: s.length,
      sCenterKm,
      dDockKm,
      Ttravel,
      Bcrit,
      Bmin,
    }
  })
}

// ---------------------------------------------------------------------------
// Min-heap priority queue
// ---------------------------------------------------------------------------

class EventQueue {
  constructor() { this._h = [] }
  get size() { return this._h.length }
  push(ev) {
    const h = this._h
    h.push(ev)
    let i = h.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (h[p].t <= h[i].t) break
      ;[h[p], h[i]] = [h[i], h[p]]
      i = p
    }
  }
  pop() {
    const h = this._h
    if (h.length === 0) return null
    const top = h[0]
    const last = h.pop()
    if (h.length > 0) {
      h[0] = last
      let i = 0
      const n = h.length
      while (true) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let s = i
        if (l < n && h[l].t < h[s].t) s = l
        if (r < n && h[r].t < h[s].t) s = r
        if (s === i) break
        ;[h[i], h[s]] = [h[s], h[i]]
        i = s
      }
    }
    return top
  }
}

// ---------------------------------------------------------------------------
// Single simulation run
// ---------------------------------------------------------------------------

/**
 * Run one battery/docking simulation.
 *
 *   M      — number of patrol segments (== active UAVs at t=0)
 *   rho    — reserve ratio; N_reserve = ⌈ρ·M⌉
 *   mode   — 'uniform' | 'risk-aware'
 *   params — overrides for DEFAULT_PARAMS
 *
 * Returns {
 *   M, rho, mode, N_reserve,
 *   segments: [ { ...segmentInfo, U } ],
 *   metrics: { Uavg, Umax, Pfail, PnoReserve, avgReserves, replacements }
 * }
 *
 * U values are PERCENTAGES (0..100), Pfail / PnoReserve also in %.
 */
export function simulateBatteryDocking({ M, rho, mode = 'uniform', params = {} } = {}) {
  if (!Number.isInteger(M) || M < 1) throw new Error('M must be a positive integer')
  const P = { ...DEFAULT_PARAMS, ...params }
  const segments = buildBatterySegments(M, mode === 'riskAware' ? 'risk-aware' : mode, params)
  const N_reserve = Math.ceil(rho * M)

  // Per-segment runtime state
  const state = segments.map((seg) => ({
    seg,
    t0: 0,
    B0: 100,
    waiting: false,            // true iff a request fired with no reserve
    uncoveredStart: null,      // start of current open uncovered interval
    intervals: [],             // closed [start, end] intervals
  }))

  // Reserve pool + integrators
  let reservePool = N_reserve
  let totalRequests = 0
  let failedRequests = 0
  let replacements = 0
  let reserveAreaSum = 0       // ∫ reservePool dt over [0, T_sim]
  let noReserveTimeSum = 0     // total time reservePool === 0
  let lastMark = 0
  function mark(t) {
    const dt = Math.max(0, t - lastMark)
    reserveAreaSum += reservePool * dt
    if (reservePool === 0) noReserveTimeSum += dt
    lastMark = t
  }

  // Waiting list (segments awaiting a reserve)
  const waiting = []
  function popHighestPriority() {
    if (waiting.length === 0) return null
    let bestIdx = 0
    for (let i = 1; i < waiting.length; i++) {
      const a = waiting[bestIdx]
      const b = waiting[i]
      const aUncov = state[a.m - 1].uncoveredStart !== null
      const bUncov = state[b.m - 1].uncoveredStart !== null
      if (aUncov !== bUncov) {
        if (bUncov) bestIdx = i
        continue
      }
      if (b.critTime < a.critTime) { bestIdx = i; continue }
      if (b.critTime > a.critTime) continue
      if (b.dDock > a.dDock) bestIdx = i
    }
    return waiting.splice(bestIdx, 1)[0]
  }

  // Event queue + seed events
  const q = new EventQueue()
  state.forEach((st) => {
    const tReq = (100 - st.seg.Bmin) / P.r_fly
    q.push({ t: tReq, type: 'request', m: st.seg.index })
  })

  // Main event loop
  while (q.size > 0) {
    const ev = q.pop()
    if (ev.t > P.T_sim) break
    mark(ev.t)

    const idx = ev.m != null ? ev.m - 1 : -1
    const st = idx >= 0 ? state[idx] : null
    const seg = st?.seg

    if (ev.type === 'request') {
      totalRequests++
      const tCrit = st.t0 + (st.B0 - seg.Bcrit) / P.r_fly
      if (reservePool > 0) {
        reservePool--
        // Reserve will arrive exactly at tCrit (since B_min = B_crit + r_fly·T_travel),
        // so the segment is covered through the swap. onTime=true means the OLD UAV
        // departs at the swap moment (still at exactly B_crit battery).
        q.push({ t: ev.t + seg.Ttravel, type: 'arrival', m: ev.m, onTime: true })
      } else {
        failedRequests++
        st.waiting = true
        waiting.push({ m: ev.m, critTime: tCrit, dDock: seg.dDockKm })
        q.push({ t: tCrit, type: 'crit', m: ev.m })
      }
    } else if (ev.type === 'crit') {
      // Active UAV has hit B_crit with no reserve having arrived — it must
      // leave the segment now. Segment becomes uncovered until a reserve
      // arrives (handled in 'arrival').
      if (st.waiting && st.uncoveredStart === null) {
        st.uncoveredStart = ev.t
      }
      // The departing UAV reaches the dock at exactly B_safety, then charges.
      const tDock = ev.t + seg.Ttravel
      const Tcharge = (P.B_ready - P.B_safety) / P.r_charge
      q.push({ t: tDock + Tcharge, type: 'ready' })
    } else if (ev.type === 'arrival') {
      // Reserve UAV arrives at segment m.
      if (st.uncoveredStart !== null) {
        st.intervals.push([st.uncoveredStart, ev.t])
        st.uncoveredStart = null
      }
      st.waiting = false
      replacements++

      // On-time path: the OLD UAV is still on segment at exactly B_crit. It now
      // departs for the dock and charges. (Overdue path: old UAV already left
      // at 'crit', so its 'ready' was already scheduled there.)
      if (ev.onTime) {
        const tDock = ev.t + seg.Ttravel
        const Tcharge = (P.B_ready - P.B_safety) / P.r_charge
        q.push({ t: tDock + Tcharge, type: 'ready' })
      }

      // The new active UAV (the reserve) starts patrolling at full battery.
      st.t0 = ev.t
      st.B0 = 100
      q.push({ t: ev.t + (100 - seg.Bmin) / P.r_fly, type: 'request', m: ev.m })
    } else if (ev.type === 'ready') {
      reservePool++
      // If anyone is waiting, dispatch immediately.
      const winner = popHighestPriority()
      if (winner) {
        reservePool--
        const wSeg = state[winner.m - 1].seg
        q.push({ t: ev.t + wSeg.Ttravel, type: 'arrival', m: winner.m, onTime: false })
      }
    }
  }

  // Close any open uncovered intervals at T_sim
  mark(P.T_sim)
  state.forEach((st) => {
    if (st.uncoveredStart !== null) {
      st.intervals.push([st.uncoveredStart, P.T_sim])
      st.uncoveredStart = null
    }
  })

  // Final metrics
  const U = state.map((st) =>
    (st.intervals.reduce((s, [a, b]) => s + (b - a), 0) / P.T_sim) * 100
  )
  const Uavg = U.length > 0 ? U.reduce((s, v) => s + v, 0) / U.length : 0
  const Umax = U.length > 0 ? Math.max(...U) : 0
  const Pfail = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0
  const PnoReserve = (noReserveTimeSum / P.T_sim) * 100
  const avgReserves = reserveAreaSum / P.T_sim

  return {
    M,
    rho,
    mode,
    N_reserve,
    params: P,
    segments: segments.map((seg, i) => ({ ...seg, U: U[i] })),
    metrics: { Uavg, Umax, Pfail, PnoReserve, avgReserves, replacements },
  }
}

// ---------------------------------------------------------------------------
// Sweep helper — both modes × list of ρ values
// ---------------------------------------------------------------------------

export const DEFAULT_RHO_LIST = [0, 0.1, 0.2, 0.3, 0.4, 0.5]

/**
 * Sweep ρ across both segmentation modes. Returns a flat array of rows
 * suitable for charting and CSV export.
 *
 *   M       — fleet size (M patrol segments)
 *   rhoList — array of reserve ratios to test (default: 0..0.5 by 0.1)
 *   modes   — array of segmentation modes (default: ['uniform','risk-aware'])
 *   params  — overrides for DEFAULT_PARAMS
 */
export function sweepReserveRatios({
  M,
  rhoList = DEFAULT_RHO_LIST,
  modes = ['uniform', 'risk-aware'],
  params = {},
} = {}) {
  const rows = []
  for (const rho of rhoList) {
    for (const mode of modes) {
      const res = simulateBatteryDocking({ M, rho, mode, params })
      rows.push({
        rho,
        mode,
        N_reserve: res.N_reserve,
        Uavg: res.metrics.Uavg,
        Umax: res.metrics.Umax,
        Pfail: res.metrics.Pfail,
        PnoReserve: res.metrics.PnoReserve,
        avgReserves: res.metrics.avgReserves,
        replacements: res.metrics.replacements,
      })
    }
  }
  return rows
}
