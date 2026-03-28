import { useState, useRef, useEffect, useCallback } from 'react'
import { createSimulation } from './lib/simulation'
import { renderCanvas } from './lib/renderer'
import Header from './components/Header'
import Controls from './components/Controls'
import SOSPanel from './components/SOSPanel'
import CommLog from './components/CommLog'
import FleetGrid from './components/FleetGrid'
import Settings from './components/Settings'
import Results from './components/ResultsPage'

export default function App() {
  const simRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const prevTsRef = useRef(null)
  const pausedRef = useRef(false)
  const [, forceUpdate] = useState(0)
  const rerender = useCallback(() => forceUpdate(n => n + 1), [])

  const [page, setPage] = useState('sim')

  /* Init simulation once */
  if (!simRef.current) simRef.current = createSimulation()
  const sim = simRef.current

  /* ── History collector ── */
  const historyRef = useRef({
    batterySnapshots: [],
    responseEvents: [],
    messageCounts: [],
    trajectories: [],
    _lastSample: 0,
    _eventId: 0,
    _triggerT: null,
    _msgTotals: { sos: 0, ack: 0, propose: 0, reject: 0, deploy: 0 },
    _lastLogCount: 0,
  })

  function sampleHistory(s) {
    const h = historyRef.current
    const now = s.simMs

    if (now - h._lastSample < 200) return
    h._lastSample = now

    // Battery snapshot
    const batSnap = { t: now }
    s.drones.forEach(d => { batSnap[`d${d.id}`] = d.battery })
    h.batterySnapshots.push(batSnap)

    // Trajectories
    h.trajectories.push({
      t: now,
      drones: s.drones.map(d => ({ id: d.id, x: d.x, y: d.y }))
    })

    // Message counts — only count NEW logs since last sample
    const prevCount = h._lastLogCount || 0
    const newLogs = s.logs.slice(0, s.logCounter - prevCount)
    h._lastLogCount = s.logCounter

    const newMsgs = { ...h._msgTotals }
    newLogs.forEach(log => {
      const msg = log.msg?.toLowerCase() || ''
      if (msg.includes('sos') || msg.includes('accident')) newMsgs.sos++
      if (msg.includes('ack')) newMsgs.ack++
      if (msg.includes('cfp') || msg.includes('bid')) newMsgs.propose++
      if (msg.includes('reject')) newMsgs.reject++
      if (msg.includes('deploy') || msg.includes('dispatch')) newMsgs.deploy++
    })
    h.messageCounts.push({ t: now, ...newMsgs })
    h._msgTotals = newMsgs
  }

  function trackResponseEvent(s) {
    const h = historyRef.current

    if (s.simState === 'broadcasting' && h._triggerT === null) {
      h._triggerT = s.simMs
    }

    if (s.simState === 'arrived' && h._triggerT !== null) {
      h._eventId++
      h.responseEvents.push({
        id: h._eventId,
        triggerT: h._triggerT,
        arriveT: s.simMs,
        responseMs: s.simMs - h._triggerT,
        droneId: s.primaryIdx >= 0 ? s.drones[s.primaryIdx]?.id : null,
      })
      h._triggerT = null
    }

    if (s.simState === 'idle' && h._triggerT !== null) {
      h._triggerT = null
    }
  }

  /* Config state */
  const [config, setConfig] = useState({
    droneCount: 5, droneSpeed: 6, waveSpeed: 2,
    freq: 868, txPwr: 14, batDrain: 0.5,
    minBat: 25, lowBat: 30, reserveCount: 2
  })
  const [severity, setSeverity] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => { sim.setConfig(config) }, [config])
  useEffect(() => { sim.setSeverity(severity) }, [severity])

  /* Animation loop */
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const cx = cv.getContext('2d')

    function loop(ts) {
      if (!prevTsRef.current) prevTsRef.current = ts
      const raw = Math.min((ts - prevTsRef.current) / 1000, 0.05)
      prevTsRef.current = ts
      if (!pausedRef.current) {
        sim.tick(raw)
        const snap = sim.getState()
        sampleHistory(snap)
        trackResponseEvent(snap)
      }
      renderCanvas(cx, sim.getState())
      rerender()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [page])

  useEffect(() => { pausedRef.current = paused }, [paused])

  const s = sim.getState()

  function handleTrigger() { sim.triggerAccident(); prevTsRef.current = null; rerender() }
  function handleReset() {
    sim.reset(); sim.setConfig(config); prevTsRef.current = null; setPaused(false)
    const h = historyRef.current
    h.batterySnapshots = []; h.responseEvents = []; h.messageCounts = []; h.trajectories = []
    h._lastSample = 0; h._eventId = 0; h._triggerT = null
    h._msgTotals = { sos: 0, ack: 0, propose: 0, reject: 0, deploy: 0 }
    h._lastLogCount = 0
    rerender()
  }
  function handlePause() { setPaused(p => !p) }
  function handleConfigChange(key, val) {
    setConfig(prev => {
      const next = { ...prev, [key]: val }
      sim.setConfig(next)
      if ((key === 'droneCount' || key === 'reserveCount') && s.simState === 'idle') sim.rebuildAll()
      return next
    })
  }

  if (page === 'results') {
    return (
      <Results
        state={s}
        history={historyRef.current}
        onBack={() => setPage('sim')}
      />
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <Header state={s} onNavigateResults={() => setPage('results')} />
      <Controls
        state={s} severity={severity} paused={paused}
        onTrigger={handleTrigger} onPause={handlePause} onReset={handleReset}
        onSeverity={setSeverity}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-[420px]">
        <div className="p-3 border-r border-[var(--color-border)]">
          <canvas
            ref={canvasRef}
            width={1100} height={420}
            className="w-full rounded-lg border border-[var(--color-border)]"
          />
        </div>
        <div className="flex flex-col bg-[var(--color-bg2)] border-b border-[var(--color-border)] overflow-hidden">
          <SOSPanel state={s} />
          <CommLog logs={s.logs} count={s.logCounter} />
        </div>
      </div>
      <FleetGrid drones={s.drones} reserves={s.reserveDrones} state={s} />
      <Settings config={config} onChange={handleConfigChange} />
    </div>
  )
}