import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import {
  buildRoadPath,
  positionAt,
  unprojectMeters,
  baselineRoadRate,
  DEFAULT_PARAMS,
  makeRng,
} from '../lib/detection-sim'
import { POLICIES } from '../lib/policies'
import { BEIRUT_CENTER, BEIRUT_ZOOM } from '../../partitioning/lib/roads'

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
// Visualisation-only multiplier on top of the user's accidentRateMultiplier
// so that accidents arrive frequently enough to actually be watched on screen.
// The Monte-Carlo sweep does NOT use this — it runs detection-sim.simulateOnce
// directly with the user's config, unaffected by this constant.
const DEMO_RATE_BOOST = 20
// Detected accidents linger for this many sim-seconds (≈2.7 wall-seconds at
// TIME_SCALE=30), fading over the last DETECTED_FADE_SIM, then are removed
// from the map. Missed accidents are left in place so the operator can see
// coverage gaps accumulate.
const DETECTED_LINGER_SIM = 80
const DETECTED_FADE_SIM = 30

function makeRoadState(allocation, params, rng) {
  return allocation.map(({ road, drones: nDrones }) => {
    const path = buildRoadPath(road)
    const droneStates = []
    if (nDrones > 0) {
      const segLen = path.totalLength / nDrones
      for (let i = 0; i < nDrones; i++) {
        const segStart = i * segLen
        const segEnd = (i + 1) * segLen
        droneStates.push({
          id: `${road.id}-${i}`,
          s: segStart + rng() * segLen,
          dir: rng() < 0.5 ? 1 : -1,
          segStart,
          segEnd,
          battery: 80 + rng() * 20,
          state: 'patrolling',
          phaseEnd: 0,
        })
      }
    }
    return {
      road,
      path,
      droneStates,
      baseRate: baselineRoadRate(road) * params.accidentRateMultiplier * DEMO_RATE_BOOST,
    }
  })
}

function droneIcon(color, state) {
  const stateColor =
    state === 'patrolling' ? color
    : state === 'returning' ? '#facc15'
    : '#64748b'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="5.5" fill="${stateColor}" stroke="#0a0e1a" stroke-width="1.5"/>
    <circle cx="7" cy="7" r="1.6" fill="#0a0e1a"/>
  </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [14, 14], iconAnchor: [7, 7] })
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

export default function LiveMap({ N, policyKey, params: paramsProp }) {
  const [, force] = useState(0)
  const [running, setRunning] = useState(false)

  // Map + Leaflet refs
  const mapElRef = useRef(null)
  const mapRef = useRef(null)
  const polylineLayerRef = useRef([])
  const droneLayerRef = useRef(new Map())     // id -> { marker, prevState }
  const accidentLayerRef = useRef(new Map())  // id -> { marker, prevStatus }

  // Simulation state
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const lastTsRef = useRef(0)

  function init() {
    const policy = POLICIES[policyKey] ?? POLICIES.riskAware
    const allocation = policy.allocate(N)
    const rng = makeRng(Date.now() & 0x7fffffff)
    const params = { ...DEFAULT_PARAMS, ...(paramsProp ?? {}) }
    stateRef.current = {
      simT: 0,
      params,
      allocation,
      roadStates: makeRoadState(allocation, params, rng),
      accidents: [],
      rng,
      // Cumulative counters — survive the accident-list cap.
      totalGenerated: 0,
      totalDetected: 0,
      totalMissed: 0,
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
    for (const rs of stateRef.current.roadStates) {
      const pl = L.polyline(rs.road.polyline, {
        color: rs.road.color,
        weight: 5,
        opacity: 0.85,
      }).addTo(map)
      pl.bindTooltip(
        `<div style="font-family:Outfit,sans-serif;font-size:11px;
          color:#e8edf5;background:#0c101a;border:1px solid ${rs.road.color}55;
          padding:5px 10px;border-radius:7px;white-space:nowrap">
          <strong style="color:${rs.road.color}">${rs.road.name}</strong><br/>
          <span style="color:#4e6080">Drones&nbsp;</span>
          <span style="color:#22d3ee;font-family:JetBrains Mono,monospace">${rs.droneStates.length}</span>
        </div>`,
        { sticky: true, className: '' }
      )
      polylineLayerRef.current.push(pl)
    }
    force((x) => x + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, policyKey])

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
        let entry = droneLayerRef.current.get(d.id)
        if (!entry) {
          const marker = L.marker([lat, lon], {
            icon: droneIcon(rs.road.color, d.state),
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
          entry = { marker, prevState: d.state, color: rs.road.color }
          droneLayerRef.current.set(d.id, entry)
        } else {
          entry.marker.setLatLng([lat, lon])
          if (entry.prevState !== d.state) {
            entry.marker.setIcon(droneIcon(entry.color, d.state))
            entry.prevState = d.state
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
      if (!entry) {
        const marker = L.marker([lat, lon], {
          icon: accidentIcon(status),
          interactive: true,
        }).addTo(map)
        marker.bindTooltip(
          status === 'detected'
            ? `Detected in ${(acc.detectionTime ?? 0).toFixed(0)}s`
            : status === 'missed' ? 'Missed (timeout)' : 'Pending',
          { direction: 'top' }
        )
        entry = { marker, prevStatus: status }
        accidentLayerRef.current.set(acc.id, entry)
      } else if (entry.prevStatus !== status) {
        entry.marker.setIcon(accidentIcon(status))
        entry.marker.setTooltipContent(
          status === 'detected'
            ? `Detected in ${(acc.detectionTime ?? 0).toFixed(0)}s`
            : status === 'missed' ? 'Missed (timeout)' : 'Pending'
        )
        entry.prevStatus = status
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
    for (const [id, { marker }] of accidentLayerRef.current) {
      if (!seen.has(id)) {
        marker.remove()
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
            d.battery -= st.params.batteryDrainRate * dt
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

      // Generate accidents (Poisson) per road
      for (let r = 0; r < st.roadStates.length; r++) {
        const rs = st.roadStates[r]
        const expected = rs.baseRate * dt
        if (st.rng() < expected) {
          const s = st.rng() * rs.path.totalLength
          st.accidents.push({
            id: Math.random().toString(36).slice(2),
            roadIdx: r,
            s,
            time: st.simT,
            detected: false,
            missed: false,
          })
          st.totalGenerated++
        }
      }

      // Detection check — increment cumulative counters on the transition
      // (so totals survive the accident-list cap below).
      for (const acc of st.accidents) {
        if (acc.detected || acc.missed) continue
        const rs = st.roadStates[acc.roadIdx]
        const accPos = positionAt(rs.path, acc.s)
        for (const d of rs.droneStates) {
          if (d.state !== 'patrolling') continue
          const dPos = positionAt(rs.path, d.s)
          const dist = Math.hypot(accPos[0] - dPos[0], accPos[1] - dPos[1])
          if (dist <= st.params.sensingRange) {
            acc.detected = true
            acc.detectionTime = st.simT - acc.time
            acc.detectedAt = st.simT
            st.totalDetected++
            break
          }
        }
        if (!acc.detected && st.simT - acc.time > st.params.maxDetectionWindow) {
          acc.missed = true
          st.totalMissed++
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

  // Refined, calmer palette for the KPI cards. Each entry uses a soft
  // background tint and a slate-leaning value colour rather than full
  // saturation, so the strip reads as a unified chart instead of six
  // competing neon badges.
  const kpis = [
    { label: 'Sim time', value: `${Math.floor(st?.simT ?? 0)}s`, hint: `×${TIME_SCALE} real-time`, dot: '#94a3b8', tint: 'rgba(148, 163, 184, 0.10)' },
    { label: 'Total',    value: totalGenerated,                  hint: 'accidents generated',     dot: '#cbd5e1', tint: 'rgba(203, 213, 225, 0.08)' },
    { label: 'Active',   value: pending,                         hint: 'awaiting detection',      dot: '#f59e0b', tint: 'rgba(245, 158, 11, 0.10)' },
    { label: 'Detected', value: totalDetected,                   hint: 'within window',           dot: '#34d399', tint: 'rgba(52, 211, 153, 0.10)' },
    { label: 'Missed',   value: totalMissed,                     hint: 'timeout exceeded',        dot: '#f87171', tint: 'rgba(248, 113, 113, 0.10)' },
    { label: 'Rate',     value: detectionRate !== null ? `${detectionRate.toFixed(0)}%` : '—', hint: 'detected / resolved', dot: '#60a5fa', tint: 'rgba(96, 165, 250, 0.10)' },
  ]

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 backdrop-blur-sm overflow-hidden shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">

      {/* Title strip + actions */}
      <div className="px-5 py-3 border-b border-slate-800/70 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: policyColor }} />
          <span className="text-[12px] font-semibold text-slate-100 tracking-tight">Live trial</span>
          <span className="text-slate-600 text-[10px]">/</span>
          <span className="text-[10.5px] font-medium" style={{ color: policyColor }}>
            {policyMeta?.label ?? policyKey}
          </span>
          <span className="text-slate-600 text-[10px]">/</span>
          <span className="text-[10.5px] font-mono text-slate-400">N = {N}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setRunning((r) => !r)}
            className={`px-3.5 py-1.5 text-[10.5px] font-semibold rounded-md transition-colors cursor-pointer
              ${running
                ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 ring-1 ring-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 ring-1 ring-emerald-500/30'}`}
          >
            {running ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button
            onClick={() => { setRunning(false); init(); force((x) => x + 1) }}
            className="px-3.5 py-1.5 text-[10.5px] font-semibold rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 ring-1 ring-slate-700/50 cursor-pointer"
          >
            ↻ Reset
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 px-5 py-3 border-b border-slate-800/70">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-lg ring-1 ring-slate-800/70 px-3 py-2 transition-colors hover:ring-slate-700"
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
      <div className="flex items-center gap-5 px-5 py-2 border-b border-slate-800/70 text-[10.5px] flex-wrap">
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
        <span className="ml-auto text-[9px] text-slate-500 italic">
          Drone colour matches its assigned road
        </span>
      </div>

      <div ref={mapElRef} style={{ height: 460 }} className="w-full" />
    </div>
  )
}
