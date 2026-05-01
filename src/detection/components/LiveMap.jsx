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
      baseRate: baselineRoadRate(road) * params.accidentRateMultiplier,
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
  const color =
    status === 'detected' ? '#10b981'
    : status === 'missed'  ? '#64748b'
    : '#ef4444'
  const pulse =
    status === 'pending'
      ? `<circle cx="11" cy="11" r="9" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.55">
           <animate attributeName="r" values="5;10;5" dur="1.4s" repeatCount="indefinite"/>
           <animate attributeName="opacity" values="0.6;0.05;0.6" dur="1.4s" repeatCount="indefinite"/>
         </circle>`
      : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
    ${pulse}
    <circle cx="11" cy="11" r="6" fill="${color}" fill-opacity="0.55" stroke="${color}" stroke-width="1.5"/>
    <circle cx="11" cy="11" r="2" fill="${color}"/>
  </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [22, 22], iconAnchor: [11, 11] })
}

function statusOf(acc) {
  if (acc.detected) return 'detected'
  if (acc.missed) return 'missed'
  return 'pending'
}

export default function LiveMap({ N, policyKey }) {
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
    stateRef.current = {
      simT: 0,
      params: { ...DEFAULT_PARAMS },
      allocation,
      roadStates: makeRoadState(allocation, DEFAULT_PARAMS, rng),
      accidents: [],
      rng,
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
        }
      }

      // Detection check
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
            break
          }
        }
        if (!acc.detected && st.simT - acc.time > st.params.maxDetectionWindow) {
          acc.missed = true
        }
      }

      // Cap accident list
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
  const detected = st?.accidents.filter((a) => a.detected).length ?? 0
  const missed = st?.accidents.filter((a) => a.missed).length ?? 0
  const pending = st ? st.accidents.length - detected - missed : 0

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[#0d1225] overflow-hidden">
      <div className="px-4 py-2 border-b border-[var(--color-border)] flex items-center gap-3">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
          Live trial · {POLICIES[policyKey]?.label ?? policyKey} · N = {N}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setRunning((r) => !r)}
            className="px-3 py-1 text-[10px] font-bold rounded-md border border-[var(--color-border2)] text-[var(--color-txt)] hover:bg-[#111827] cursor-pointer"
          >
            {running ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button
            onClick={() => { setRunning(false); init(); force((x) => x + 1) }}
            className="px-3 py-1 text-[10px] font-bold rounded-md border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#111827] cursor-pointer"
          >
            ↻ Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 py-2 border-b border-[var(--color-border)] text-[10px] font-mono">
        <div>
          <span className="text-[var(--color-txt3)]">t = </span>
          <span className="text-[var(--color-cyan)] font-bold">{Math.floor(st?.simT ?? 0)}s</span>
        </div>
        <div>
          <span className="text-[var(--color-txt3)]">detected </span>
          <span className="text-[var(--color-mint)] font-bold">{detected}</span>
          <span className="text-[var(--color-txt3)]"> · pending </span>
          <span className="text-[var(--color-warn)] font-bold">{pending}</span>
          <span className="text-[var(--color-txt3)]"> · missed </span>
          <span className="text-[var(--color-danger)] font-bold">{missed}</span>
        </div>
        <div className="text-right">
          <span className="text-[var(--color-txt3)]">×{TIME_SCALE} time</span>
        </div>
      </div>

      <div ref={mapElRef} style={{ height: 460 }} className="w-full" />
    </div>
  )
}
