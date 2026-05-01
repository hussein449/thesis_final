import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet'
import {
  buildRoadPath,
  positionAt,
  unprojectMeters,
  baselineRoadRate,
  DEFAULT_PARAMS,
  makeRng,
} from '../lib/detection-sim'
import { POLICIES } from '../lib/policies'
import { ROADS, BEIRUT_CENTER, BEIRUT_ZOOM } from '../../partitioning/lib/roads'

/**
 * A single-trial visualization: drones move along their assigned road
 * segments, accidents flash when they occur, detected accidents turn green,
 * and missed accidents turn gray. This is the "watch one run" view that
 * supplements the Monte Carlo sweep.
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
    return { road, path, droneStates, baseRate: baselineRoadRate(road) * params.accidentRateMultiplier }
  })
}

export default function LiveMap({ N, policyKey }) {
  const [, force] = useState(0)
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const lastTsRef = useRef(0)
  const [running, setRunning] = useState(false)

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
  }

  useEffect(() => {
    init()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, policyKey])

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
        // Convert per-second rate to per-frame chance.
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

      // Cap accident list to keep render cheap
      if (st.accidents.length > 80) {
        st.accidents = st.accidents.slice(-80)
      }
    }

    force((x) => x + 1)
    rafRef.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    if (running) {
      lastTsRef.current = 0
      rafRef.current = requestAnimationFrame(step)
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

      <div style={{ height: 460 }}>
        <MapContainer
          center={BEIRUT_CENTER}
          zoom={BEIRUT_ZOOM}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution=""
          />

          {/* Roads */}
          {st?.roadStates.map((rs) => (
            <Polyline
              key={rs.road.id}
              positions={rs.road.polyline}
              color={rs.road.color}
              weight={5}
              opacity={0.85}
            />
          ))}

          {/* Drones */}
          {st?.roadStates.flatMap((rs) =>
            rs.droneStates.map((d) => {
              const [x, y] = positionAt(rs.path, d.s)
              const [lat, lon] = unprojectMeters(x, y, rs.path.refLat, rs.path.refLon)
              const color =
                d.state === 'patrolling' ? rs.road.color
                : d.state === 'returning' ? '#facc15'
                : '#64748b'
              return (
                <CircleMarker
                  key={d.id}
                  center={[lat, lon]}
                  radius={5}
                  pathOptions={{
                    color: '#0a0e1a',
                    weight: 1,
                    fillColor: color,
                    fillOpacity: 0.95,
                  }}
                >
                  <LeafletTooltip direction="top">
                    {d.id} · {d.state} · bat {d.battery.toFixed(0)}%
                  </LeafletTooltip>
                </CircleMarker>
              )
            })
          )}

          {/* Accidents */}
          {st?.accidents.map((acc) => {
            const rs = st.roadStates[acc.roadIdx]
            const [x, y] = positionAt(rs.path, acc.s)
            const [lat, lon] = unprojectMeters(x, y, rs.path.refLat, rs.path.refLon)
            const color = acc.detected ? '#10b981' : acc.missed ? '#64748b' : '#ef4444'
            return (
              <CircleMarker
                key={acc.id}
                center={[lat, lon]}
                radius={8}
                pathOptions={{
                  color,
                  weight: 2,
                  fillColor: color,
                  fillOpacity: 0.4,
                }}
              >
                <LeafletTooltip>
                  {acc.detected ? `Detected in ${acc.detectionTime.toFixed(0)}s`
                    : acc.missed ? 'Missed (timeout)'
                    : 'Pending'}
                </LeafletTooltip>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}
