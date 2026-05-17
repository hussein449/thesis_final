import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import {
  buildRoadPath,
  positionAt,
  unprojectMeters,
  DEFAULT_PARAMS,
  makeRng,
} from '../lib/detection-sim'
import { POLICIES } from '../lib/policies'
import { BEIRUT_CENTER, BEIRUT_ZOOM, computeRiskScore } from '../../partitioning/lib/roads'
import { buildSections, DEFAULT_SECTION_LENGTH_KM } from '../../partitioning/lib/sections'
import {
  defaultSectionScores,
  computeRiskMatrix,
  dailyAccidentRate,
  TIME_SLOTS,
  timeSlotForHour,
} from '../../partitioning/lib/risk-scoring'
import {
  computeSlotProbabilities,
  computeSectionTimeSlotRates,
} from '../../partitioning/lib/accident-generator'
import { buildPatrolSegments } from '../../partitioning/lib/uav-segments'
import { computeIotDetection, DEFAULT_R_IOT } from '../lib/iot-alert'

// Deep green → deep amber → deep red gradient — readable against the
// cream/taupe canvas without the washed-out pastel look of the original.
//   t = 0.0  →  #166534 (green-800)
//   t = 0.5  →  #B45309 (amber-700)
//   t = 1.0  →  #991B1B (red-800)
function heatColor(t) {
  const c = Math.max(0, Math.min(1, t))
  // 3-stop interpolation through dark, fully-saturated stops
  const stops = [
    { p: 0.0, r: 0x16, g: 0x65, b: 0x34 },
    { p: 0.5, r: 0xB4, g: 0x53, b: 0x09 },
    { p: 1.0, r: 0x99, g: 0x1B, b: 0x1B },
  ]
  // Find segment
  let a = stops[0], b = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (c >= stops[i].p && c <= stops[i + 1].p) {
      a = stops[i]; b = stops[i + 1]; break
    }
  }
  const span = b.p - a.p || 1
  const k = (c - a.p) / span
  const r = Math.round(a.r + (b.r - a.r) * k)
  const g = Math.round(a.g + (b.g - a.g) * k)
  const bl = Math.round(a.b + (b.b - a.b) * k)
  return `rgb(${r},${g},${bl})`
}

/**
 * Single-trial visualization. Drones move along their assigned segments,
 * accidents flash when they occur, detected accidents turn green and missed
 * accidents turn gray.
 *
 * Implementation note: this component uses Leaflet's imperative API
 * directly rather than react-leaflet, matching the style of
 * src/partitioning/components/PartitionMap.jsx. react-leaflet v5 has a
 * known Vite pre-bundling incompatibility with leaflet 1.9 in this stack.
 */

const TIME_SCALE = 30 // 1 second of wall time = 30 simulated seconds
// Visualisation-only multiplier so accidents arrive on a watchable cadence
// in the Live Trial. Tuned so the corridor's real ~200 accidents/yr produce
// an event every ~5 wall-seconds at TIME_SCALE = 30:
//   real rate ≈ 6.3 × 10⁻⁶ events/s; with boost × TIME_SCALE × dt this
//   gives ~0.2 events per wall-second.
// The Monte-Carlo sweep does NOT use this — it runs detection-sim.simulateOnce
// directly with the user's config (real rates, no boost).
const DEMO_RATE_BOOST = 1200
// Detected accidents linger for this many sim-seconds (≈2.7 wall-seconds at
// TIME_SCALE=30), fading over the last DETECTED_FADE_SIM, then are removed
// from the map. Missed accidents are left in place so the operator can see
// coverage gaps accumulate.
const DETECTED_LINGER_SIM = 35
const DETECTED_FADE_SIM = 15

// Reference segment length for the drain-rate scaling. A drone whose patrol
// segment matches this length drains at exactly params.batteryDrainRate;
// drones on longer segments drain proportionally faster (more travel per
// patrol cycle), drones on shorter segments slower. Clamped to [0.7, 1.6]
// to avoid pathological cases on extreme segments.
const REF_SEGMENT_LEN = 1500 // m

function segmentDrainFactor(segLen) {
  const raw = segLen / REF_SEGMENT_LEN
  return Math.max(0.7, Math.min(1.6, raw))
}

// Unit perpendicular to the path tangent at arc-length s (in meters).
// Uses a small finite difference; returns [nx, ny] perpendicular to motion.
function perpendicularAt(path, sM) {
  const eps = 5
  const a = Math.max(0, Math.min(path.totalLength, sM - eps))
  const b = Math.max(0, Math.min(path.totalLength, sM + eps))
  const [x1, y1] = positionAt(path, a)
  const [x2, y2] = positionAt(path, b)
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  return [-dy / len, dx / len]
}

// Draw the 1-km highway-section grid for one road as perpendicular ticks.
// Returns the list of leaflet layers it created so the caller can clean up.
function drawSectionGrid(map, rs, sectionLengthKm = DEFAULT_SECTION_LENGTH_KM) {
  const layers = []
  const sections = buildSections(rs.road.lengthKm, sectionLengthKm)
  // Tick positions: every section boundary, i.e. s = 0, 1, 2, ..., L km.
  const boundaries = [0, ...sections.map((s) => s.sEnd)]
  for (const sKm of boundaries) {
    const sM = Math.min(sKm * 1000, rs.path.totalLength)
    const [xc, yc] = positionAt(rs.path, sM)
    const [nx, ny] = perpendicularAt(rs.path, sM)
    const isMajor = Math.abs(sKm - Math.round(sKm / 5) * 5) < 1e-6
    const halfM = isMajor ? 140 : 70
    const [latA, lonA] = unprojectMeters(xc + nx * halfM, yc + ny * halfM, rs.path.refLat, rs.path.refLon)
    const [latB, lonB] = unprojectMeters(xc - nx * halfM, yc - ny * halfM, rs.path.refLat, rs.path.refLon)
    const tick = L.polyline([[latA, lonA], [latB, lonB]], {
      color: isMajor ? '#0E7490' : '#0891B2',
      weight: isMajor ? 3 : 1.5,
      opacity: isMajor ? 0.95 : 0.7,
      interactive: true,
    }).addTo(map)
    const idxAt = sections.find((s) => s.sStart <= sKm && sKm < s.sEnd)
    const labelKm = sKm.toFixed(0)
    tick.bindTooltip(
      `<div style="font-family:JetBrains Mono,monospace;font-size:10px;
        color:#0E7490;background:#0c101a;border:1px solid #0E7490;
        padding:3px 7px;border-radius:5px;white-space:nowrap">
        s = ${labelKm} km
        ${idxAt ? ` &middot; entering S<sub>${idxAt.index}</sub>` : ''}
      </div>`,
      { sticky: true }
    )
    layers.push(tick)

    if (isMajor) {
      const offsetM = halfM + 60
      const [latL, lonL] = unprojectMeters(xc + nx * offsetM, yc + ny * offsetM, rs.path.refLat, rs.path.refLon)
      const labelIcon = L.divIcon({
        html: `<div style="
          font: 600 10.5px 'JetBrains Mono', monospace;
          color: #0E7490;
          background: rgba(255,255,255,0.92);
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid #0E7490;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(0,0,0,0.15);
        ">${labelKm} km</div>`,
        className: '',
        iconSize: [44, 18],
        iconAnchor: [22, 9],
      })
      const label = L.marker([latL, lonL], { icon: labelIcon, interactive: false }).addTo(map)
      layers.push(label)
    }
  }
  return layers
}

// Draw UAV patrol-segment boundaries as wide perpendicular markers, plus a
// "UAV m" label per segment. Distinct visual language (violet, thicker)
// from the cyan 1-km highway-section ticks so the two grids don't blur.
function drawPatrolSegments(map, rs) {
  const layers = []
  if (!rs.segments || rs.segments.length === 0) return layers
  const pathLen = rs.path.totalLength

  // Boundary fences at every segment edge: 0, B_1, B_2, ..., L.
  const boundaries = [0, ...rs.segments.map((s) => s.B)]
  for (const sM of boundaries) {
    const sClamped = Math.min(Math.max(sM, 0), pathLen)
    const [xc, yc] = positionAt(rs.path, sClamped)
    const [nx, ny] = perpendicularAt(rs.path, sClamped)
    const halfM = 260
    const [latA, lonA] = unprojectMeters(xc + nx * halfM, yc + ny * halfM, rs.path.refLat, rs.path.refLon)
    const [latB, lonB] = unprojectMeters(xc - nx * halfM, yc - ny * halfM, rs.path.refLat, rs.path.refLon)
    const fence = L.polyline([[latA, lonA], [latB, lonB]], {
      color: '#7C3AED',         // violet-600
      weight: 4,
      opacity: 0.7,
      dashArray: '6 6',
    }).addTo(map)
    layers.push(fence)
  }

  // "UAV m" labels centred on each segment. With Risk-aware stacking a
  // segment may carry multiple drones; suffix " ×k" so the operator
  // can see at a glance where the fleet is doubled up.
  for (const seg of rs.segments) {
    const midM = (seg.A + seg.B) / 2
    const [xc, yc] = positionAt(rs.path, Math.min(midM, pathLen))
    const [nx, ny] = perpendicularAt(rs.path, Math.min(midM, pathLen))
    const [latL, lonL] = unprojectMeters(xc + nx * 320, yc + ny * 320, rs.path.refLat, rs.path.refLon)
    const lengthKm = (seg.length / 1000).toFixed(1)
    const stackCount = seg.droneCount ?? 1
    const stackNote = stackCount > 1
      ? `<span style="color:#FBBF24"> · ×${stackCount}</span>`
      : ''
    const riskNote = seg.riskAverage != null
      ? `<span style="color:#A78BFA"> · R̄ ${seg.riskAverage.toFixed(2)}</span>`
      : ''
    const labelIcon = L.divIcon({
      html: `<div style="
        font: 600 11px 'JetBrains Mono', monospace;
        color: #fff;
        background: #7C3AED;
        padding: 2px 8px;
        border-radius: 9999px;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        border: 1.5px solid #ffffff66;
      ">UAV ${seg.index} · ${lengthKm} km${stackNote}${riskNote}</div>`,
      className: '',
      iconSize: [140, 22],
      iconAnchor: [70, 11],
    })
    const label = L.marker([latL, lonL], { icon: labelIcon, interactive: false }).addTo(map)
    layers.push(label)
  }
  return layers
}

function makeRoadState(allocation, params, rng, patrolMode) {
  return allocation.map(({ road, drones: nDrones }) => {
    const path = buildRoadPath(road)
    // Build the section-time-slot rate model for this road.
    const sections = buildSections(road.lengthKm)
    const scores = defaultSectionScores(road)
    const riskMatrix = computeRiskMatrix(scores)
    const slotProbs = computeSlotProbabilities(riskMatrix)
    const rateMatrix = computeSectionTimeSlotRates(dailyAccidentRate(road.accidents), slotProbs)

    // §6 patrol segments. Each UAV gets exactly one [A_m, B_m].
    const segments = nDrones > 0
      ? buildPatrolSegments({
          mode: patrolMode ?? 'uniform',
          corridorLengthM: path.totalLength,
          M: nDrones,
          sections,
          riskMatrix,
        })
      : []

    // Build drone states honouring seg.droneCount (Risk-aware can stack
    // hot-spot segments). Stacked drones get phase-offset start
    // positions and alternating directions so they don't move in
    // lockstep — that's what makes the 2nd drone actually add coverage.
    const droneStates = []
    let droneNum = 0
    for (const seg of segments) {
      const k = seg.droneCount ?? 1
      const segLen = seg.B - seg.A
      const segDrainFactor = segmentDrainFactor(segLen)
      for (let i = 0; i < k; i++) {
        // Per-drone drain jitter (±12 %) on top of the segment-length factor.
        const drainJitter = 0.88 + rng() * 0.24
        // Stagger initial battery across [35, 100] %, slightly offset
        // per stack slot so two drones in the same segment don't dock
        // together at t≈0.
        const initialBattery = 35 + rng() * 65
        const phaseFrac = k > 1 ? i / k : rng()
        const dir = k > 1
          ? (i % 2 === 0 ? 1 : -1)
          : (rng() < 0.5 ? 1 : -1)
        droneStates.push({
          id: `${road.id}-${droneNum++}`,
          s: seg.A + phaseFrac * segLen,
          dir,
          segStart: seg.A,
          segEnd: seg.B,
          segLen,
          patrolIdx: seg.index,
          stackIdx: i,
          drainFactor: segDrainFactor * drainJitter,
          battery: initialBattery,
          state: 'patrolling',
          phaseEnd: 0,
        })
      }
    }
    return {
      road,
      path,
      segments,
      droneStates,
      rateMatrix,
    }
  })
}

// Rotor positions (top-down quadcopter) within a 32×32 viewBox
const ROTOR_POS = [[7, 7], [25, 7], [7, 25], [25, 25]]

function droneIcon(color, state, headingDeg = 0) {
  const stateColor =
    state === 'patrolling' ? color
    : state === 'returning' ? '#B45309'
    : '#94a3b8'
  // Faster spin while patrolling, slow drift when returning, very slow when docked
  const rotorDur =
    state === 'patrolling' ? '0.10s'
    : state === 'returning' ? '0.22s'
    : '1.2s'
  const bodyOpacity = state === 'docked' ? 0.55 : 1

  const rotors = ROTOR_POS.map(([cx, cy]) => `
    <g transform="translate(${cx} ${cy})" opacity="${bodyOpacity}">
      <circle r="3.6" fill="${stateColor}" fill-opacity="0.16" stroke="${stateColor}" stroke-width="0.7"/>
      <g>
        <line x1="-3.2" y1="0" x2="3.2" y2="0" stroke="${stateColor}" stroke-width="1.2" stroke-linecap="round" opacity="0.95"/>
        <line x1="0" y1="-3.2" x2="0" y2="3.2" stroke="${stateColor}" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="${rotorDur}" repeatCount="indefinite"/>
      </g>
    </g>`).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" style="overflow:visible">
    <g transform="rotate(${headingDeg} 16 16)" opacity="${bodyOpacity}">
      <line x1="16" y1="16" x2="7"  y2="7"  stroke="#0a0e1a" stroke-width="2.4" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="25" y2="7"  stroke="#0a0e1a" stroke-width="2.4" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="7"  y2="25" stroke="#0a0e1a" stroke-width="2.4" stroke-linecap="round"/>
      <line x1="16" y1="16" x2="25" y2="25" stroke="#0a0e1a" stroke-width="2.4" stroke-linecap="round"/>
      ${rotors}
      <circle cx="16" cy="16" r="4.6" fill="${stateColor}" stroke="#0a0e1a" stroke-width="1.4"/>
      <path d="M16 8.5 L19 13.5 L13 13.5 Z" fill="${stateColor}" stroke="#0a0e1a" stroke-width="0.9" stroke-linejoin="round"/>
    </g>
  </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [32, 32], iconAnchor: [16, 16] })
}

function accidentIcon(status) {
  if (status === 'pending') {
    // Bright red warning triangle with strong pulsing ring — very visible.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r="15" fill="none" stroke="#ef4444" stroke-width="2" opacity="0.7">
        <animate attributeName="r" values="8;15;8" dur="1.1s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.85;0;0.85" dur="1.1s" repeatCount="indefinite"/>
      </circle>
      <circle cx="17" cy="17" r="11" fill="#ef4444" fill-opacity="0.18" stroke="#ef4444" stroke-width="1"/>
      <path d="M17 6 L28 24 L6 24 Z" fill="#ef4444" stroke="#0a0e1a" stroke-width="1.5" stroke-linejoin="round"/>
      <text x="17" y="22" font-family="Arial,sans-serif" font-size="13" font-weight="900" fill="#fff" text-anchor="middle">!</text>
    </svg>`
    return L.divIcon({ html: svg, className: '', iconSize: [34, 34], iconAnchor: [17, 17] })
  }
  if (status === 'detected') {
    // Green checkmark badge with a one-shot expanding "burst" ring on creation.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r="11" fill="none" stroke="#10b981" stroke-width="2.5" opacity="1">
        <animate attributeName="r" values="9;22;22" dur="0.9s" begin="0s" fill="freeze"/>
        <animate attributeName="opacity" values="1;0;0" dur="0.9s" begin="0s" fill="freeze"/>
      </circle>
      <circle cx="17" cy="17" r="11" fill="#10b981" stroke="#0a0e1a" stroke-width="1.5"/>
      <path d="M11 17 L15 21 L23 12" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
    return L.divIcon({ html: svg, className: '', iconSize: [34, 34], iconAnchor: [17, 17] })
  }
  // missed — clearly washed-out, dashed X
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
    <circle cx="13" cy="13" r="10" fill="#1e293b" stroke="#64748b" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.85"/>
    <path d="M9 9 L17 17 M17 9 L9 17" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [26, 26], iconAnchor: [13, 13] })
}

function statusOf(acc) {
  if (acc.detected) return 'detected'
  if (acc.missed) return 'missed'
  return 'pending'
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function LiveMap({ N, policyKey, params: paramsProp }) {
  const [, force] = useState(0)
  const [running, setRunning] = useState(false)
  const [heatmap, setHeatmap] = useState(false)
  const [showSections, setShowSections] = useState(true)
  const [showPatrol, setShowPatrol] = useState(true)

  // Map + Leaflet refs
  const mapElRef = useRef(null)
  const mapRef = useRef(null)
  const polylineLayerRef = useRef([])
  const sectionLayerRef = useRef([])
  const patrolLayerRef = useRef([])
  const droneLayerRef = useRef(new Map())     // id -> { marker, prevState }
  const accidentLayerRef = useRef(new Map())  // id -> { marker, ring, prevStatus }

  // Simulation state
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const lastTsRef = useRef(0)

  function init() {
    const policy = POLICIES[policyKey] ?? POLICIES.riskAware
    const allocation = policy.allocate(N)
    const rng = makeRng(Date.now() & 0x7fffffff)
    const params = { ...DEFAULT_PARAMS, ...(paramsProp ?? {}) }
    const patrolMode = policy.patrolMode ?? 'uniform'
    stateRef.current = {
      simT: 0,
      params,
      patrolMode,
      allocation,
      roadStates: makeRoadState(allocation, params, rng, patrolMode),
      accidents: [],
      rng,
      // Cumulative counters — survive the accident-list cap.
      totalGenerated: 0,
      totalDetected: 0,
      totalMissed: 0,
      // Event log — every accident generation/detection/miss is recorded
      // here for the live log panel and CSV/JSON export.
      events: [],
      nextAccidentSeq: 1,
    }
    // Reset markers
    droneLayerRef.current.forEach(({ marker }) => marker.remove())
    droneLayerRef.current.clear()
    accidentLayerRef.current.forEach(({ marker }) => marker.remove())
    accidentLayerRef.current.clear()
  }

  // Initialize map once
  useEffect(() => {
    if (mapRef.current) return
    const m = L.map(mapElRef.current, {
      center: BEIRUT_CENTER,
      zoom: BEIRUT_ZOOM,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m)
    mapRef.current = m
    return () => {
      m.remove()
      mapRef.current = null
    }
  }, [])

  // Reset simulation state and redraw polylines when N or policy changes
  useEffect(() => {
    init()
    const map = mapRef.current
    if (!map) return

    polylineLayerRef.current.forEach((pl) => pl.remove())
    polylineLayerRef.current = []
    const scores = stateRef.current.roadStates.map((rs) => computeRiskScore(rs.road))
    const maxScore = Math.max(...scores, 1e-9)
    for (let i = 0; i < stateRef.current.roadStates.length; i++) {
      const rs = stateRef.current.roadStates[i]
      const score = scores[i]
      const color = heatmap ? heatColor(score / maxScore) : rs.road.color
      const pl = L.polyline(rs.road.polyline, {
        color,
        weight: 5,
        opacity: 0.85,
      }).addTo(map)
      pl.bindTooltip(
        `<div style="font-family:Outfit,sans-serif;font-size:11px;
          color:#e8edf5;background:#0c101a;border:1px solid ${color}88;
          padding:5px 10px;border-radius:7px;white-space:nowrap">
          <strong style="color:${color}">${rs.road.name}</strong><br/>
          <span style="color:#4e6080">Risk R&nbsp;</span>
          <span style="color:#0E7490;font-family:JetBrains Mono,monospace">${score.toFixed(3)}</span>
          <span style="color:#4e6080"> &nbsp;·&nbsp; Drones&nbsp;</span>
          <span style="color:#0E7490;font-family:JetBrains Mono,monospace">${rs.droneStates.length}</span>
        </div>`,
        { sticky: true, className: '' }
      )
      polylineLayerRef.current.push(pl)
    }
    force((x) => x + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, policyKey, heatmap])

  // Section grid (1-km highway sections, perpendicular ticks + 5-km labels).
  // Listens to N/policyKey because those trigger init() which rebuilds
  // roadStates; without that dep the grid would not redraw on top of the
  // new polylines after a sweep configuration change.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    sectionLayerRef.current.forEach((layer) => layer.remove())
    sectionLayerRef.current = []
    if (!showSections) return
    const st = stateRef.current
    if (!st) return
    for (const rs of st.roadStates) {
      const layers = drawSectionGrid(map, rs)
      sectionLayerRef.current.push(...layers)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSections, N, policyKey, heatmap])

  // Patrol-segment boundaries (one band per UAV; uniform vs risk-aware).
  // Rebuilds on N/policy change (and via init's roadStates rebuild).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    patrolLayerRef.current.forEach((layer) => layer.remove())
    patrolLayerRef.current = []
    if (!showPatrol) return
    const st = stateRef.current
    if (!st) return
    for (const rs of st.roadStates) {
      const layers = drawPatrolSegments(map, rs)
      patrolLayerRef.current.push(...layers)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPatrol, N, policyKey, heatmap])

  // Render drone + accident markers reactively (called every frame)
  function syncMarkers() {
    const map = mapRef.current
    const st = stateRef.current
    if (!map || !st) return

    // Drones
    for (const rs of st.roadStates) {
      for (const d of rs.droneStates) {
        const [x, y] = positionAt(rs.path, d.s)
        const [lat, lon] = unprojectMeters(x, y, rs.path.refLat, rs.path.refLon)
        // Compute heading: sample a point a few metres ahead along travel
        // direction and convert the local-meters delta to a clockwise-from-
        // north angle. Snap to 5° to avoid spamming setIcon every frame.
        const aheadS = Math.max(0, Math.min(rs.path.totalLength, d.s + d.dir * 8))
        const [x2, y2] = positionAt(rs.path, aheadS)
        const dx = x2 - x
        const dy = y2 - y
        const headingDeg = (dx === 0 && dy === 0)
          ? 0
          : Math.atan2(dx, dy) * 180 / Math.PI
        const headingSnap = Math.round(headingDeg / 5) * 5

        let entry = droneLayerRef.current.get(d.id)
        if (!entry) {
          const marker = L.marker([lat, lon], {
            icon: droneIcon(rs.road.color, d.state, headingSnap),
            interactive: true,
          }).addTo(map)
          marker.bindTooltip(
            `<div style="font-family:JetBrains Mono,monospace;font-size:10px;
              color:#e8edf5;background:#0c101a;border:1px solid #1a2540;
              padding:4px 8px;border-radius:6px;white-space:nowrap">
              ${d.id} · ${d.state} · bat ${d.battery.toFixed(0)}%
            </div>`,
            { className: '', direction: 'top' }
          )
          entry = { marker, prevState: d.state, prevHeading: headingSnap, color: rs.road.color }
          droneLayerRef.current.set(d.id, entry)
        } else {
          entry.marker.setLatLng([lat, lon])
          if (entry.prevState !== d.state || entry.prevHeading !== headingSnap) {
            entry.marker.setIcon(droneIcon(entry.color, d.state, headingSnap))
            entry.prevState = d.state
            entry.prevHeading = headingSnap
          }
          entry.marker.setTooltipContent(
            `<div style="font-family:JetBrains Mono,monospace;font-size:10px;
              color:#e8edf5;background:#0c101a;border:1px solid #1a2540;
              padding:4px 8px;border-radius:6px;white-space:nowrap">
              ${d.id} · ${d.state} · bat ${d.battery.toFixed(0)}%
            </div>`
          )
        }

      }
    }

    // Accidents
    const seen = new Set()
    for (const acc of st.accidents) {
      seen.add(acc.id)
      const rs = st.roadStates[acc.roadIdx]
      const [x, y] = positionAt(rs.path, acc.s)
      const [lat, lon] = unprojectMeters(x, y, rs.path.refLat, rs.path.refLon)
      const status = statusOf(acc)
      let entry = accidentLayerRef.current.get(acc.id)
      const tooltipFor = (s) =>
        s === 'detected'
          ? `Detected in ${(acc.detectionTime ?? 0).toFixed(0)}s${acc.responderPatrolIdx ? ` · UAV-${acc.responderPatrolIdx}` : ''}`
          : s === 'missed' ? 'Missed (no IoT overlap or timeout)'
          : acc.predictedTAlert != null
              ? `Pending · ETA ${acc.predictedTAlert.toFixed(0)}s via UAV-${acc.responderPatrolIdx}`
              : 'Pending · no IoT overlap'
      if (!entry) {
        const marker = L.marker([lat, lon], {
          icon: accidentIcon(status),
          interactive: true,
        }).addTo(map)
        marker.bindTooltip(tooltipFor(status), { direction: 'top' })
        // §9 IoT signal zone — ring of radius R_IoT around the accident.
        // Drawn only while pending so it doesn't clutter resolved events.
        const ring = (status === 'pending' && acc.R_IoT)
          ? L.circle([lat, lon], {
              radius: acc.R_IoT,
              color: '#ef4444',
              weight: 1.2,
              opacity: 0.7,
              fillColor: '#ef4444',
              fillOpacity: 0.06,
              interactive: false,
            }).addTo(map)
          : null
        entry = { marker, ring, prevStatus: status }
        accidentLayerRef.current.set(acc.id, entry)
      } else if (entry.prevStatus !== status) {
        entry.marker.setIcon(accidentIcon(status))
        entry.marker.setTooltipContent(tooltipFor(status))
        entry.prevStatus = status
        if (status !== 'pending' && entry.ring) {
          entry.ring.remove()
          entry.ring = null
        }
      }

      // Fade detected markers over the last DETECTED_FADE_SIM seconds of
      // their linger window so removal isn't abrupt.
      if (status === 'detected' && acc.detectedAt != null) {
        const age = st.simT - acc.detectedAt
        const fadeStart = DETECTED_LINGER_SIM - DETECTED_FADE_SIM
        const opacity = age <= fadeStart
          ? 1
          : Math.max(0, 1 - (age - fadeStart) / DETECTED_FADE_SIM)
        entry.marker.setOpacity(opacity)
      }
    }
    // Drop accident markers that no longer exist (we cap the list above)
    for (const [id, { marker, ring }] of accidentLayerRef.current) {
      if (!seen.has(id)) {
        marker.remove()
        if (ring) ring.remove()
        accidentLayerRef.current.delete(id)
      }
    }
  }

  function step(ts) {
    if (!stateRef.current) return
    if (!lastTsRef.current) lastTsRef.current = ts
    const wallDt = (ts - lastTsRef.current) / 1000
    lastTsRef.current = ts

    if (running) {
      const st = stateRef.current
      const dt = wallDt * TIME_SCALE
      st.simT += dt

      // Move drones
      for (const rs of st.roadStates) {
        for (const d of rs.droneStates) {
          if (d.state === 'patrolling') {
            d.s += d.dir * st.params.droneSpeed * dt
            if (d.s >= d.segEnd) { d.s = d.segEnd; d.dir = -1 }
            if (d.s <= d.segStart) { d.s = d.segStart; d.dir = 1 }
            d.battery -= st.params.batteryDrainRate * d.drainFactor * dt
            if (d.battery <= st.params.lowBatteryThreshold) {
              d.state = 'returning'
              d.phaseEnd = st.simT + st.params.dockTransitTime
            }
          } else if (d.state === 'returning') {
            if (st.simT >= d.phaseEnd) {
              d.state = 'docked'
              d.phaseEnd = st.simT + st.params.dockChargeTime
            }
          } else if (d.state === 'docked') {
            d.battery = Math.min(100, d.battery + st.params.chargeRate * dt)
            if (d.battery >= st.params.readyThreshold && st.simT >= d.phaseEnd) {
              d.state = 'patrolling'
            }
          }
        }
      }

      // Generate accidents using the section-time-slot Poisson model.
      // Current hour-of-day = simStartHour + simT/3600 (mod 24).
      // When forceTimeSlot is set, override the slot lookup to the
      // forced slot and scale rates by B=5 so the daily total stays
      // consistent (matches the simulateOnce path).
      const forcedSlotIdx = Number.isInteger(st.params.forceTimeSlot)
        && st.params.forceTimeSlot >= 1 && st.params.forceTimeSlot <= 5
        ? st.params.forceTimeSlot - 1
        : null
      const simHour = ((st.params.simStartHour ?? 0) + st.simT / 3600) % 24
      const slot = forcedSlotIdx != null
        ? TIME_SLOTS[forcedSlotIdx]
        : timeSlotForHour(simHour)
      const slotIdx = slot.index - 1
      // For the forced regime, treat the daily rate as if spread across
      // all 24 h (so scale by B / 24h instead of by 1 / slotDurationSec).
      // Net effect: same daily total as Auto mode, but with the forced
      // slot's section-distribution P(i|b).
      const slotDurationSec = forcedSlotIdx != null
        ? 24 * 3600 / TIME_SLOTS.length  // = (24h)/B = ~4.8h per slot equivalent
        : (slot.endHour - slot.startHour) * 3600
      // DEMO_RATE_BOOST accelerates the demo beyond the corridor's real
      // rate so events arrive on a watchable cadence. Monte-Carlo metrics
      // are unaffected — that path uses simulateOnce() with no boost.
      const boost = DEMO_RATE_BOOST
      const R_IoT = st.params.sensingRange ?? DEFAULT_R_IOT
      const v = st.params.droneSpeed
      for (let r = 0; r < st.roadStates.length; r++) {
        const rs = st.roadStates[r]
        for (const row of rs.rateMatrix) {
          // λ_{i,b}/day → per-second within the slot:
          const lambdaPerSec = row.lambda[slotIdx] / slotDurationSec
          const expected = lambdaPerSec * boost * dt
          if (st.rng() < expected) {
            // Uniform position within the section:
            const sKm = row.sStart + st.rng() * (row.sEnd - row.sStart)
            const s = sKm * 1000
            const seq = st.nextAccidentSeq++
            const accId = `A${String(seq).padStart(4, '0')}`
            // IoT alert: closed-form T_alert from §11 + 3-candidate rule.
            // With Risk-aware stacking a segment can host multiple drones,
            // so uavStates is a map of patrolIdx → list of drone snapshots.
            const uavStates = {}
            for (const d of rs.droneStates) {
              if (d.state === 'patrolling') {
                if (!uavStates[d.patrolIdx]) uavStates[d.patrolIdx] = []
                uavStates[d.patrolIdx].push({ sj: d.s, dj: d.dir })
              }
            }
            const detection = computeIotDetection({
              segments: rs.segments,
              uavStates,
              sk: s,
              R_IoT,
              v,
            })
            // Pick the specific drone inside the responder's segment that
            // won — stackIdx tells us which of the stacked drones it is.
            const responderCandidates = detection.responder != null
              ? rs.droneStates.filter((d) => d.patrolIdx === detection.responder)
              : []
            const responderDrone = responderCandidates.length > 0
              ? (responderCandidates[detection.responderStackIdx ?? 0] ?? responderCandidates[0])
              : null
            const willDetect = detection.tAlert != null && detection.tAlert <= st.params.maxDetectionWindow
            st.accidents.push({
              id: accId,
              seq,
              roadIdx: r,
              s,
              sectionIndex: row.sectionIndex,
              timeSlot: slot.index,
              tau: simHour,
              time: st.simT,
              detected: false,
              missed: false,
              R_IoT,
              predictedTAlert: detection.tAlert,
              detectAt: willDetect ? st.simT + detection.tAlert : null,
              responderPatrolIdx: detection.responder,
              responderId: responderDrone?.id ?? null,
            })
            st.totalGenerated++
            st.events.push({
              time_s: +st.simT.toFixed(1),
              kind: 'accident',
              accident_id: accId,
              corridor: rs.road.name,
              section: `S${row.sectionIndex}`,
              slot: `${slot.index} (${slot.label})`,
              uav_id: '',
              detection_time_s: detection.tAlert != null ? +detection.tAlert.toFixed(1) : '',
              note: detection.tAlert != null
                ? `S${row.sectionIndex} slot ${slot.index} · ETA ${detection.tAlert.toFixed(0)}s via UAV-${detection.responder}`
                : `S${row.sectionIndex} slot ${slot.index} · no IoT overlap (all 3 candidates returning/docked)`,
            })
          }
        }
      }

      // Detection check — flip accident states based on the IoT-predicted
      // alert time. No per-frame distance check; the closed-form T_alert
      // computed at admission is the source of truth.
      for (const acc of st.accidents) {
        if (acc.detected || acc.missed) continue
        if (acc.detectAt != null && st.simT >= acc.detectAt) {
          acc.detected = true
          acc.detectionTime = acc.predictedTAlert
          acc.detectedAt = st.simT
          st.totalDetected++
          const rs = st.roadStates[acc.roadIdx]
          st.events.push({
            time_s: +st.simT.toFixed(1),
            kind: 'detected',
            accident_id: acc.id,
            corridor: rs.road.name,
            uav_id: acc.responderId ?? '',
            detection_time_s: +acc.detectionTime.toFixed(1),
            note: `IoT alert received by UAV-${acc.responderPatrolIdx}`,
          })
        } else if (st.simT - acc.time > st.params.maxDetectionWindow) {
          acc.missed = true
          st.totalMissed++
          const rs = st.roadStates[acc.roadIdx]
          st.events.push({
            time_s: +st.simT.toFixed(1),
            kind: 'missed',
            accident_id: acc.id,
            corridor: rs.road.name,
            uav_id: '',
            detection_time_s: '',
            note: `Timeout after ${st.params.maxDetectionWindow}s`,
          })
        }
      }

      // Drop detected accidents that have lingered past their fade window —
      // keeps the map clear. Missed accidents stay so coverage gaps remain
      // visible.
      st.accidents = st.accidents.filter(
        (a) => !(a.detected && st.simT - a.detectedAt > DETECTED_LINGER_SIM)
      )

      // Cap accident list. Cumulative totals (totalDetected/totalMissed)
      // are tracked separately above so they don't drift when this fires.
      if (st.accidents.length > 80) {
        st.accidents = st.accidents.slice(-80)
      }
    }

    syncMarkers()
    force((x) => x + 1)
    rafRef.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    if (running) {
      lastTsRef.current = 0
      rafRef.current = requestAnimationFrame(step)
    } else {
      // Still sync once so the new state is reflected when paused.
      syncMarkers()
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const st = stateRef.current
  const pending = st?.accidents.filter((a) => !a.detected && !a.missed).length ?? 0
  const totalDetected = st?.totalDetected ?? 0
  const totalMissed = st?.totalMissed ?? 0
  const totalGenerated = st?.totalGenerated ?? 0
  const resolved = totalDetected + totalMissed
  const detectionRate = resolved > 0 ? (totalDetected / resolved) * 100 : null

  const policyMeta = POLICIES[policyKey]
  const policyColor = policyMeta?.color ?? '#94a3b8'

  // Current hour-of-day and time slot, derived from simStartHour + elapsed.
  const startHour = (paramsProp?.simStartHour ?? DEFAULT_PARAMS.simStartHour) ?? 0
  const currentHour = ((startHour + (st?.simT ?? 0) / 3600) % 24 + 24) % 24
  const currentHourLabel = `${String(Math.floor(currentHour)).padStart(2, '0')}:${String(
    Math.floor((currentHour - Math.floor(currentHour)) * 60)
  ).padStart(2, '0')}`
  // When forceTimeSlot is set, the displayed slot reflects the forced
  // regime — not the wall-clock slot. The hour label still ticks so
  // operators can see sim time elapsing.
  const forcedSlot = Number.isInteger(paramsProp?.forceTimeSlot)
    && paramsProp.forceTimeSlot >= 1 && paramsProp.forceTimeSlot <= 5
    ? TIME_SLOTS[paramsProp.forceTimeSlot - 1]
    : null
  const currentSlot = forcedSlot
    ?? TIME_SLOTS.find((s) => currentHour >= s.startHour && currentHour < s.endHour)
    ?? TIME_SLOTS[TIME_SLOTS.length - 1]

  // Refined, calmer palette for the KPI cards. Each entry uses a soft
  // background tint and a slate-leaning value colour rather than full
  // saturation, so the strip reads as a unified chart instead of six
  // competing neon badges.
  const kpis = [
    { label: 'Sim time', value: `${Math.floor(st?.simT ?? 0)}s`, hint: `×${TIME_SCALE} real-time`, dot: '#94a3b8', tint: 'rgba(148, 163, 184, 0.10)' },
    { label: 'Total',    value: totalGenerated,                  hint: 'accidents generated',     dot: '#cbd5e1', tint: 'rgba(203, 213, 225, 0.08)' },
    { label: 'Active',   value: pending,                         hint: 'awaiting detection',      dot: '#B45309', tint: 'rgba(245, 158, 11, 0.10)' },
    { label: 'Detected', value: totalDetected,                   hint: 'within window',           dot: '#047857', tint: 'rgba(52, 211, 153, 0.10)' },
    { label: 'Missed',   value: totalMissed,                     hint: 'timeout exceeded',        dot: '#f87171', tint: 'rgba(248, 113, 113, 0.10)' },
    { label: 'Rate',     value: detectionRate !== null ? `${detectionRate.toFixed(0)}%` : '—', hint: 'detected / resolved', dot: '#1D4ED8', tint: 'rgba(96, 165, 250, 0.10)' },
  ]

  return (
    <div className="rounded-2xl border border-slate-600/80 bg-slate-700/40 backdrop-blur-sm overflow-hidden shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">

      {/* Title strip + actions */}
      <div className="px-5 py-3 border-b border-slate-600/70 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: policyColor }} />
          <span className="text-[12px] font-semibold text-slate-100 tracking-tight">Live trial</span>
          <span className="text-slate-600 text-[10px]">/</span>
          <span className="text-[10.5px] font-medium" style={{ color: policyColor }}>
            {policyMeta?.label ?? policyKey}
          </span>
          <span className="text-slate-600 text-[10px]">/</span>
          <span className="text-[10.5px] font-mono text-slate-400">N = {N}</span>
          <span className="text-slate-600 text-[10px]">/</span>
          <span
            className={`text-[10.5px] font-mono ${forcedSlot ? 'text-amber-700' : 'text-cyan-700'}`}
            title={forcedSlot
              ? `Time-of-day LOCKED to slot ${currentSlot.index}: ${currentSlot.label} (${String(currentSlot.startHour).padStart(2, '0')}:00–${String(currentSlot.endHour).padStart(2, '0')}:00). All accidents use this slot's P(i | b) regardless of wall-clock hour.`
              : `Time-of-day clock — slot ${currentSlot.index}: ${currentSlot.label} (${String(currentSlot.startHour).padStart(2, '0')}:00–${String(currentSlot.endHour).padStart(2, '0')}:00). Rate distribution per section follows P(i | b) for this slot.`
            }
          >
            {forcedSlot ? `🔒 slot ${currentSlot.index} (${currentSlot.label})` : `${currentHourLabel} · slot ${currentSlot.index}`}
          </span>
          <span className="text-slate-600 text-[10px]">/</span>
          <span
            className="text-[10.5px] font-mono text-violet-700"
            title={`Patrol mode — ${st?.patrolMode === 'risk-aware' ? 'sections grouped by equal cumulative risk per UAV' : 'corridor split into M equal-length segments'}`}
          >
            {st?.patrolMode === 'risk-aware' ? 'risk-aware patrol' : 'uniform patrol'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setShowPatrol((s) => !s)}
            className={`px-3 py-1.5 text-[10.5px] font-semibold rounded-md cursor-pointer ring-1 transition-colors ${
              showPatrol
                ? 'bg-violet-500/15 text-violet-800 hover:bg-violet-500/25 ring-violet-500/40'
                : 'bg-slate-700/50 text-slate-400 hover:text-slate-200 ring-slate-700/50'
            }`}
            title={`Show UAV patrol segments [A_m, B_m] (${stateRef.current?.patrolMode === 'risk-aware' ? 'equal cumulative risk' : 'equal length'})`}
          >
            ╳ Patrol {showPatrol ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setShowSections((s) => !s)}
            className={`px-3 py-1.5 text-[10.5px] font-semibold rounded-md cursor-pointer ring-1 transition-colors ${
              showSections
                ? 'bg-cyan-500/15 text-cyan-800 hover:bg-cyan-500/25 ring-cyan-500/40'
                : 'bg-slate-700/50 text-slate-400 hover:text-slate-200 ring-slate-700/50'
            }`}
            title="Show 1-km highway-section boundaries (with 5-km labels)"
          >
            ┃ Sections {showSections ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setHeatmap((h) => !h)}
            className={`px-3 py-1.5 text-[10.5px] font-semibold rounded-md cursor-pointer ring-1 transition-colors ${
              heatmap
                ? 'bg-orange-500/15 text-orange-800 hover:bg-orange-500/25 ring-orange-500/40'
                : 'bg-slate-700/50 text-slate-400 hover:text-slate-200 ring-slate-700/50'
            }`}
            title="Color roads by risk score (green → red)"
          >
            🌡 Heatmap {heatmap ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setRunning((r) => !r)}
            className={`px-3.5 py-1.5 text-[10.5px] font-semibold rounded-md transition-colors cursor-pointer
              ${running
                ? 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 ring-1 ring-amber-700/30'
                : 'bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 ring-1 ring-emerald-500/30'}`}
          >
            {running ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button
            onClick={() => { setRunning(false); init(); force((x) => x + 1) }}
            className="px-3.5 py-1.5 text-[10.5px] font-semibold rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 ring-1 ring-slate-700/50 cursor-pointer"
          >
            ↻ Reset
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 px-5 py-3 border-b border-slate-600/70">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-lg ring-1 ring-slate-600/70 px-3 py-2 transition-colors hover:ring-slate-700"
            style={{ background: k.tint }}
          >
            <div className="flex items-center gap-1.5 text-[8.5px] uppercase tracking-[0.14em] font-semibold text-slate-400">
              <span className="w-1 h-1 rounded-full" style={{ background: k.dot }} />
              {k.label}
            </div>
            <div className="font-mono font-semibold text-[17px] leading-snug tabular-nums text-slate-100 mt-0.5">
              {k.value}
            </div>
            <div className="text-[8.5px] text-slate-500 leading-none">{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 px-5 py-2 border-b border-slate-600/70 text-[10.5px] flex-wrap">
        <span className="text-[8.5px] text-slate-500 uppercase tracking-[0.16em] font-semibold">Legend</span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <svg width="16" height="16" viewBox="0 0 34 34">
            <path d="M17 6 L28 24 L6 24 Z" fill="#ef4444" stroke="#0a0e1a" strokeWidth="1.5" strokeLinejoin="round"/>
            <text x="17" y="22" fontFamily="Arial" fontSize="13" fontWeight="900" fill="#fff" textAnchor="middle">!</text>
          </svg>
          Active <span className="text-slate-500">— pulsing</span>
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <svg width="16" height="16" viewBox="0 0 34 34">
            <circle cx="17" cy="17" r="11" fill="#10b981" stroke="#0a0e1a" strokeWidth="1.5"/>
            <path d="M11 17 L15 21 L23 12" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Detected <span className="text-slate-500">— burst, then fades</span>
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <svg width="16" height="16" viewBox="0 0 26 26">
            <circle cx="13" cy="13" r="10" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.85"/>
            <path d="M9 9 L17 17 M17 9 L9 17" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          Missed <span className="text-slate-500">— timeout {DEFAULT_PARAMS.maxDetectionWindow}s</span>
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <svg width="22" height="16" viewBox="0 0 22 16">
            <line x1="11" y1="2" x2="11" y2="14" stroke="#0E7490" strokeWidth="2.5"/>
            <line x1="5"  y1="5" x2="5"  y2="11" stroke="#0891B2" strokeWidth="1.5" opacity="0.7"/>
            <line x1="17" y1="5" x2="17" y2="11" stroke="#0891B2" strokeWidth="1.5" opacity="0.7"/>
          </svg>
          Sections <span className="text-slate-500">— 1-km ticks, labels every 5 km</span>
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <svg width="22" height="16" viewBox="0 0 22 16">
            <line x1="6" y1="2" x2="6" y2="14" stroke="#7C3AED" strokeWidth="3" strokeDasharray="3 2"/>
            <line x1="16" y1="2" x2="16" y2="14" stroke="#7C3AED" strokeWidth="3" strokeDasharray="3 2"/>
            <rect x="7" y="6" width="8" height="4" rx="2" fill="#7C3AED" />
          </svg>
          Patrol <span className="text-slate-500">— UAV segments [A_m, B_m]</span>
        </span>
        <span className="flex items-center gap-1.5 text-slate-300">
          <svg width="22" height="16" viewBox="0 0 22 16">
            <circle cx="11" cy="8" r="6" fill="#ef4444" fillOpacity="0.10" stroke="#ef4444" strokeWidth="1.1"/>
            <circle cx="11" cy="8" r="1.6" fill="#ef4444"/>
          </svg>
          IoT zone <span className="text-slate-500">— R<sub>IoT</sub> around active accidents</span>
        </span>
        <span className="ml-auto text-[9px] text-slate-500 italic">
          Drone colour matches its assigned road
        </span>
      </div>

      <div ref={mapElRef} style={{ height: 460 }} className="w-full" />

      {/* ── Event log + export ── */}
      <EventLogPanel st={st} policyKey={policyKey} N={N} />
    </div>
  )
}

function EventLogPanel({ st, policyKey, N }) {
  const events = st?.events ?? []
  const summary = events.reduce(
    (acc, e) => {
      acc[e.kind] = (acc[e.kind] ?? 0) + 1
      return acc
    },
    { accident: 0, detected: 0, missed: 0 }
  )
  // Show most-recent first, cap displayed rows.
  const view = events.slice(-150).slice().reverse()

  function exportSummary() {
    if (!st) return
    const summaryDoc = {
      policy: policyKey,
      fleet_size: N,
      sim_time_s: +(st.simT ?? 0).toFixed(1),
      total_generated: st.totalGenerated,
      total_detected: st.totalDetected,
      total_missed: st.totalMissed,
      detection_rate: st.totalDetected + st.totalMissed > 0
        ? +(st.totalDetected / (st.totalDetected + st.totalMissed)).toFixed(3)
        : null,
      params: st.params,
    }
    const stem = `live-trial_summary_${policyKey}_N${N}_t${Math.floor(st.simT)}s`
    downloadBlob(JSON.stringify(summaryDoc, null, 2), `${stem}.json`, 'application/json')
  }

  const kindStyle = {
    accident: { color: '#f87171', label: 'ACCIDENT' },
    detected: { color: '#047857', label: 'DETECTED' },
    missed:   { color: '#94a3b8', label: 'MISSED' },
  }

  return (
    <div className="border-t border-slate-600/70">
      <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-slate-600/70">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-800" />
          <span className="text-[12px] font-semibold text-slate-100 tracking-tight">Event log</span>
          <span className="text-slate-600 text-[10px]">/</span>
          <span className="text-[10.5px] font-mono text-slate-400">
            {events.length} events
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span><span className="text-rose-700">●</span> {summary.accident} acc</span>
          <span><span className="text-emerald-800">●</span> {summary.detected} det</span>
          <span><span className="text-slate-400">●</span> {summary.missed} miss</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={exportSummary}
            className="px-2.5 py-1 text-[10px] font-semibold rounded-md text-slate-300 hover:text-slate-100 hover:bg-slate-700/50 ring-1 ring-slate-700/50 cursor-pointer">
            ⬇ Export summary (JSON)
          </button>
        </div>
      </div>
      <div className="max-h-[260px] overflow-y-auto bg-slate-700/50/50">
        {view.length === 0 ? (
          <div className="px-5 py-6 text-center text-[10.5px] text-slate-500">
            No events yet — press Play to start the simulation.
          </div>
        ) : (
          <table className="w-full text-[10.5px] font-mono">
            <thead className="bg-slate-700/40/70 sticky top-0">
              <tr className="text-[9px] uppercase tracking-[0.12em] text-slate-500">
                <th className="text-left py-1.5 px-3 font-semibold">t (s)</th>
                <th className="text-left py-1.5 px-3 font-semibold">Kind</th>
                <th className="text-left py-1.5 px-3 font-semibold">ID</th>
                <th className="text-left py-1.5 px-3 font-semibold">Corridor</th>
                <th className="text-left py-1.5 px-3 font-semibold">UAV</th>
                <th className="text-right py-1.5 px-3 font-semibold">Δt det (s)</th>
                <th className="text-left py-1.5 px-3 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {view.map((e, i) => {
                const ks = kindStyle[e.kind] ?? { color: '#94a3b8', label: e.kind.toUpperCase() }
                return (
                  <tr key={`${e.accident_id}-${e.kind}-${i}`} className="border-t border-slate-600/50 hover:bg-slate-700/40">
                    <td className="py-1 px-3 text-slate-400 tabular-nums">{e.time_s}</td>
                    <td className="py-1 px-3 font-semibold" style={{ color: ks.color }}>{ks.label}</td>
                    <td className="py-1 px-3 text-slate-300">{e.accident_id}</td>
                    <td className="py-1 px-3 text-slate-300">{e.corridor}</td>
                    <td className="py-1 px-3 text-slate-400">{e.uav_id || '—'}</td>
                    <td className="py-1 px-3 text-right text-slate-300 tabular-nums">{e.detection_time_s === '' ? '—' : e.detection_time_s}</td>
                    <td className="py-1 px-3 text-slate-500">{e.note}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
