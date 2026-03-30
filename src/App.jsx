import { useState, useRef, useEffect, useCallback } from 'react'
import { createSimulation } from './lib/simulation'
import { renderCanvas } from './lib/renderer'
import { SCENARIOS } from './lora/lib/lora'
import Controls from './components/Controls'
import SOSPanel from './components/SOSPanel'
import CommLog from './components/CommLog'
import FleetGrid from './components/FleetGrid'
import Settings from './components/Settings'
import Results from './components/ResultsPage'
import LoraApp from './lora/LoraApp'
import PartitionPage from './partitioning/PartitionPage'

// ─── Reusable icon ────────────────────────────────────────────────────────────
function GearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  )
}

// ─── Unified single-row application header ────────────────────────────────────
function AppHeader({
  page, setPage,
  // sim props
  simState, simMs, severity, primaryIdx, backupIdx, simDrones,
  paused, onTrigger, onPause, onReset, onSeverity, onOpenSimSettings, onNavigateResults,
  // lora props
  loraScenario, onLoraScenario, showLoraGraphs, onToggleLoraGraphs, onOpenLoraSettings,
  // partition props
  partitionDroneCount, onPartitionDroneCount,
}) {
  const tabs = [
    { key: 'sim',       label: 'Drone Simulation', icon: '◈' },
    { key: 'lora',      label: 'LoRa Analysis',    icon: '◉' },
    { key: 'partition', label: 'Partitioning',      icon: '⬡' },
  ]

  const simPhase =
    simState === 'broadcasting' ? 'SOS'
    : simState === 'evaluating' ? 'EVAL'
    : simState === 'flying'     ? 'DEPLOY'
    : simState === 'arrived'    ? 'DONE'
    : 'IDLE'

  const phaseColor =
    simPhase === 'SOS'    ? '#ef4444'
    : simPhase === 'EVAL' ? '#ec4899'
    : simPhase === 'DEPLOY' ? '#a855f7'
    : simPhase === 'DONE' ? '#10b981'
    : '#4e6080'

  return (
    <header className="flex items-center gap-0 h-[50px] shrink-0 bg-[#020508] border-b border-[var(--color-border)] px-4">

      {/* ── Branding ── */}
      <div className="flex items-center gap-2.5 shrink-0 pr-4 border-r border-[var(--color-border)]">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-cyan)] to-[var(--color-accent)] flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.25)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2L4 6v6c0 5 3.5 9.7 8 11 4.5-1.3 8-6 8-11V6L12 2z"/>
            <circle cx="12" cy="12" r="2" fill="white" stroke="none"/>
          </svg>
        </div>
        <div className="leading-none">
          <div className="text-[12px] font-extrabold text-[var(--color-white)] tracking-tight">Thesis Project</div>
          <div className="text-[8px] text-[var(--color-txt3)] uppercase tracking-[0.15em] mt-0.5">Drone Swarm · AUB</div>
        </div>
      </div>

      {/* ── Navigation tabs ── */}
      <nav className="flex items-center gap-0.5 px-3 shrink-0">
        {tabs.map(t => {
          const active = t.key === page || (t.key === 'sim' && page === 'results')
          return (
            <button
              key={t.key}
              onClick={() => setPage(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer border
                ${active
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/30 shadow-[0_0_12px_rgba(45,127,249,0.12)]'
                  : 'text-[var(--color-txt3)] border-transparent hover:text-[var(--color-txt2)] hover:bg-white/5'
                }`}
            >
              <span className="text-[10px]">{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* ── Vertical divider ── */}
      <div className="w-px h-5 bg-[var(--color-border)] shrink-0 mx-1" />

      {/* ── Page-specific right content ── */}
      <div className="flex items-center gap-2 flex-1 min-w-0 pl-2">

        {/* SIM page */}
        {(page === 'sim') && <>
          {/* Phase badge */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 border"
            style={{ color: phaseColor, borderColor: phaseColor + '44', background: phaseColor + '14' }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: phaseColor }} />
            {simPhase}
          </div>
          {/* Time */}
          <div className="shrink-0 text-center">
            <div className="text-[8px] text-[var(--color-txt3)] uppercase tracking-widest leading-none mb-0.5">Time</div>
            <div className="text-[11px] font-bold font-[var(--font-mono)] text-[var(--color-cyan)] leading-none">{Math.floor(simMs)}ms</div>
          </div>
          <div className="w-px h-4 bg-[var(--color-border)] shrink-0" />
          {/* Severity */}
          <div className="shrink-0 text-center">
            <div className="text-[8px] text-[var(--color-txt3)] uppercase tracking-widest leading-none mb-0.5">Sev</div>
            <div className={`text-[11px] font-bold font-[var(--font-mono)] leading-none ${severity === 1 ? 'text-[var(--color-danger)]' : 'text-[var(--color-warn)]'}`}>
              {severity === 0 ? 'MOD' : 'HIGH'}
            </div>
          </div>
          {/* Primary */}
          <div className="shrink-0 text-center">
            <div className="text-[8px] text-[var(--color-txt3)] uppercase tracking-widest leading-none mb-0.5">Primary</div>
            <div className="text-[11px] font-bold font-[var(--font-mono)] text-[var(--color-violet)] leading-none">
              {primaryIdx >= 0 ? `D${simDrones[primaryIdx]?.id ?? '—'}` : '—'}
            </div>
          </div>
          <div className="w-px h-4 bg-[var(--color-border)] shrink-0" />
          {/* Spacer */}
          <div className="flex-1" />
          {/* Actions */}
          <button
            onClick={onNavigateResults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#111827] transition-colors cursor-pointer shrink-0"
          >
            ⬡ Results
          </button>
          <button
            onClick={onOpenSimSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#111827] transition-colors cursor-pointer shrink-0"
          >
            <GearIcon /> Settings
          </button>
        </>}

        {/* RESULTS page */}
        {page === 'results' && <>
          <div className="flex-1" />
          <button
            onClick={() => setPage('sim')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#111827] transition-colors cursor-pointer"
          >
            ← Back to Simulation
          </button>
        </>}

        {/* LORA page */}
        {page === 'lora' && <>
          {Object.entries(SCENARIOS).map(([key, sc]) => (
            <button
              key={key}
              onClick={() => onLoraScenario(key)}
              className={`px-3 py-1.5 text-[10px] font-semibold rounded-md border transition-all cursor-pointer shrink-0
                ${loraScenario === key
                  ? 'bg-[var(--color-accent)] text-white border-transparent shadow-[0_0_12px_rgba(45,127,249,0.2)]'
                  : 'text-[var(--color-txt2)] border-[var(--color-border2)] hover:bg-[#111827]'}`}
            >
              {sc.name}
            </button>
          ))}
          <div className="w-px h-4 bg-[var(--color-border)] shrink-0 mx-1" />
          <div className="flex-1" />
          <button
            onClick={onToggleLoraGraphs}
            className={`px-3 py-1.5 text-[10px] font-semibold rounded-md border transition-all cursor-pointer shrink-0
              ${showLoraGraphs
                ? 'bg-[var(--color-violet)]/20 text-[var(--color-violet)] border-[var(--color-violet)]/40'
                : 'text-[var(--color-txt2)] border-[var(--color-border2)] hover:bg-[#111827]'}`}
          >
            {showLoraGraphs ? '✕ Graphs' : 'Graphs'}
          </button>
          <button
            onClick={onOpenLoraSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#111827] transition-colors cursor-pointer shrink-0"
          >
            <GearIcon /> Settings
          </button>
        </>}

        {/* PARTITION page */}
        {page === 'partition' && <>
          <span className="text-[10px] text-[var(--color-txt3)] shrink-0 uppercase tracking-widest font-semibold">Fleet size</span>
          <input
            type="range" min={3} max={20} step={1} value={partitionDroneCount}
            onChange={e => onPartitionDroneCount(parseInt(e.target.value))}
            className="w-28 shrink-0"
          />
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[18px] font-bold font-[var(--font-mono)] text-[var(--color-cyan)] leading-none">{partitionDroneCount}</span>
            <span className="text-[9px] text-[var(--color-txt3)]">drones</span>
          </div>
          <div className="flex-1" />
        </>}

      </div>
    </header>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
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
    const batSnap = { t: now }
    s.drones.forEach(d => { batSnap[`d${d.id}`] = d.battery })
    h.batterySnapshots.push(batSnap)
    h.trajectories.push({ t: now, drones: s.drones.map(d => ({ id: d.id, x: d.x, y: d.y })) })
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
    if (s.simState === 'broadcasting' && h._triggerT === null) h._triggerT = s.simMs
    if (s.simState === 'arrived' && h._triggerT !== null) {
      h._eventId++
      h.responseEvents.push({ id: h._eventId, triggerT: h._triggerT, arriveT: s.simMs, responseMs: s.simMs - h._triggerT, droneId: s.primaryIdx >= 0 ? s.drones[s.primaryIdx]?.id : null })
      h._triggerT = null
    }
    if (s.simState === 'idle' && h._triggerT !== null) h._triggerT = null
  }

  /* Sim config state */
  const [config, setConfig] = useState({ droneCount: 5, droneSpeed: 6, waveSpeed: 2, freq: 868, txPwr: 14, batDrain: 0.5, minBat: 25, lowBat: 30, reserveCount: 2 })
  const [severity, setSeverity] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showSimSettings, setShowSimSettings] = useState(false)

  /* Lifted LoRa state */
  const [loraScenario, setLoraScenario] = useState('urban')
  const [showLoraGraphs, setShowLoraGraphs] = useState(false)
  const [showLoraSettings, setShowLoraSettings] = useState(false)

  /* Lifted Partition state */
  const [partitionDroneCount, setPartitionDroneCount] = useState(8)

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

  /* Shared header props */
  const headerProps = {
    page, setPage,
    simState: s.simState, simMs: s.simMs, severity, primaryIdx: s.primaryIdx, backupIdx: s.backupIdx, simDrones: s.drones,
    paused, onTrigger: handleTrigger, onPause: handlePause, onReset: handleReset, onSeverity: setSeverity,
    onOpenSimSettings: () => setShowSimSettings(true),
    onNavigateResults: () => setPage('results'),
    loraScenario, onLoraScenario: setLoraScenario,
    showLoraGraphs, onToggleLoraGraphs: () => setShowLoraGraphs(g => !g),
    onOpenLoraSettings: () => setShowLoraSettings(true),
    partitionDroneCount, onPartitionDroneCount: setPartitionDroneCount,
  }

  if (page === 'results') {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
        <AppHeader {...headerProps} />
        <Results state={s} history={historyRef.current} onBack={() => setPage('sim')} />
      </div>
    )
  }

  if (page === 'lora') {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
        <AppHeader {...headerProps} />
        <LoraApp
          scenario={loraScenario}
          showGraphs={showLoraGraphs}
          showSettings={showLoraSettings}
          onCloseSettings={() => setShowLoraSettings(false)}
        />
      </div>
    )
  }

  if (page === 'partition') {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
        <AppHeader {...headerProps} />
        <PartitionPage droneCount={partitionDroneCount} onDroneCountChange={setPartitionDroneCount} />
      </div>
    )
  }

  /* Derived viewport info */
  const simPhaseLabel =
    s.simState === 'broadcasting' ? 'BROADCASTING'
    : s.simState === 'evaluating' ? 'EVALUATING'
    : s.simState === 'flying'     ? 'DEPLOYING'
    : s.simState === 'arrived'    ? 'ON SITE'
    : 'IDLE'
  const simPhaseColor =
    s.simState === 'broadcasting' ? '#ef4444'
    : s.simState === 'evaluating' ? '#ec4899'
    : s.simState === 'flying'     ? '#a855f7'
    : s.simState === 'arrived'    ? '#10b981'
    : '#2d3f5a'

  return (
    <div className="h-screen bg-[var(--color-bg)] flex flex-col overflow-hidden">
      <AppHeader {...headerProps} />
      <Controls
        state={s} severity={severity} paused={paused}
        onTrigger={handleTrigger} onPause={handlePause} onReset={handleReset}
        onSeverity={setSeverity}
      />

      {/* ── Main workspace ──────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Viewport column */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 border-r border-[var(--color-border)]">

          {/* Viewport info strip */}
          <div className="flex items-center gap-3 px-4 py-[6px] bg-[#030b14] border-b border-[var(--color-border)] shrink-0">
            <div className="flex items-center gap-2">
              <span
                className="w-[7px] h-[7px] rounded-full shrink-0 transition-all duration-300"
                style={{
                  background: simPhaseColor,
                  boxShadow: s.simState !== 'idle' ? `0 0 7px ${simPhaseColor}bb` : 'none',
                }}
              />
              <span className="text-[8.5px] font-bold text-[var(--color-txt3)] uppercase tracking-[0.15em]">
                Simulation Viewport
              </span>
              <span className="text-[var(--color-border2)] text-[9px]">·</span>
              <span className="text-[8.5px] text-[var(--color-txt3)]">Beirut, Lebanon</span>
            </div>

            <div className="w-px h-3 bg-[var(--color-border2)] shrink-0" />

            <div
              className="flex items-center gap-1.5 px-2 py-[2px] rounded-full border text-[8px] font-bold uppercase tracking-wide"
              style={{ color: simPhaseColor, borderColor: simPhaseColor + '44', background: simPhaseColor + '12' }}
            >
              {simPhaseLabel}
            </div>

            <div className="flex items-center gap-4 font-[var(--font-mono)] text-[8.5px]">
              <span className="text-[var(--color-txt3)]">
                Fleet <span className="text-[var(--color-cyan)] font-bold ml-0.5">{s.drones.length + s.reserveDrones.length}</span>
              </span>
              <span className="text-[var(--color-txt3)]">
                Sensors <span className="text-[var(--color-accent)] font-bold ml-0.5">4</span>
              </span>
              {s.simState !== 'idle' && (
                <span className="text-[var(--color-txt3)]">
                  Active <span className="font-bold ml-0.5" style={{ color: '#ef4444' }}>S{s.activeSensorIdx + 1}</span>
                </span>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1.5 font-[var(--font-mono)] text-[8.5px]">
              <span className="text-[var(--color-txt3)] uppercase tracking-wider">T+</span>
              <span className="text-[var(--color-white)] font-bold tabular-nums">
                {String(Math.floor(s.simMs)).padStart(6, '0')}<span className="text-[var(--color-txt3)] font-normal">ms</span>
              </span>
            </div>
          </div>

          {/* Canvas area */}
          <div className="flex-1 min-h-0 bg-[#02060f] p-3 overflow-hidden flex items-start">
            <canvas
              ref={canvasRef}
              width={1100} height={420}
              className="w-full rounded-lg border border-[var(--color-border)] block"
              style={{ boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}
            />
          </div>

        </div>

        {/* ── Right sidebar ──────────────────────────────── */}
        <div className="w-[390px] shrink-0 flex flex-col min-h-0 overflow-hidden bg-[var(--color-bg2)]">
          <FleetGrid drones={s.drones} reserves={s.reserveDrones} state={s} />
          <SOSPanel state={s} />
          <CommLog logs={s.logs} count={s.logCounter} />
        </div>

      </div>

      <Settings
        open={showSimSettings} onClose={() => setShowSimSettings(false)}
        config={config} onChange={handleConfigChange}
      />
    </div>
  )
}
