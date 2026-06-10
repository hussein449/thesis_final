import { useState, useRef, useEffect, useCallback } from 'react'
import { createSimulation } from './lib/simulation'
import { renderCanvas } from './lib/renderer'
// import { SCENARIOS } from './lora/lib/lora'
import Controls from './components/Controls'
import SOSPanel from './components/SOSPanel'
import CommLog from './components/CommLog'
import FleetGrid from './components/FleetGrid'
import Settings from './components/Settings'
import Results from './components/ResultsPage'
// import LoraApp from './lora/LoraApp'
import DetectionPage from './detection/DetectionPage'
import HardwareEventsPage from './hardware/HardwareEventsPage'

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
  simState, simMs, severity, primaryIdx, simDrones,
  onOpenSimSettings, onNavigateResults,
  // lora props
  loraScenario, onLoraScenario, showLoraGraphs, onToggleLoraGraphs, onOpenLoraSettings,
  // partition props
  partitionDroneCount, onPartitionDroneCount,
}) {
  const tabs = [
    { key: 'detection', label: 'Operations',          icon: '◇' },
    { key: 'sim',       label: 'Dispatch Protocol',   icon: '◈' },
    { key: 'hardware',  label: 'Hardware Link',       icon: '⌬' },
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
    <header className="flex items-center gap-0 h-[52px] shrink-0 bg-[var(--color-bg2)] border-b border-[var(--color-border)] px-5 overflow-x-auto">

      {/* ── Branding ── */}
      <div className="flex items-center gap-3 shrink-0 pr-5 border-r border-[var(--color-border)]">
        <svg
          width="34"
          height="34"
          viewBox="0 0 40 40"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]"
          aria-label="Command Center Tool logo"
        >
          {/* Hexagon frame — forest gradient + subtle gold rim */}
          <defs>
            <linearGradient id="ccLogoBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor="#1E4D2B" />
              <stop offset="100%" stopColor="#0F2C18" />
            </linearGradient>
            <radialGradient id="ccLogoGlow" cx="50%" cy="42%" r="55%">
              <stop offset="0%"  stopColor="rgba(212,175,55,0.35)" />
              <stop offset="70%" stopColor="rgba(212,175,55,0.0)" />
            </radialGradient>
          </defs>

          {/* Hex outline (rotated flat-top hexagon) */}
          <path
            d="M20 2 L36 11 L36 29 L20 38 L4 29 L4 11 Z"
            fill="url(#ccLogoBg)"
            stroke="#D4AF37"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />

          {/* Inner glow */}
          <path
            d="M20 2 L36 11 L36 29 L20 38 L4 29 L4 11 Z"
            fill="url(#ccLogoGlow)"
          />

          {/* Crosshair / target ring */}
          <circle cx="20" cy="20" r="9" fill="none" stroke="#FAF9F6" strokeWidth="0.9" opacity="0.55" />
          <line x1="20" y1="9"  x2="20" y2="13" stroke="#FAF9F6" strokeWidth="0.9" opacity="0.55" />
          <line x1="20" y1="27" x2="20" y2="31" stroke="#FAF9F6" strokeWidth="0.9" opacity="0.55" />
          <line x1="9"  y1="20" x2="13" y2="20" stroke="#FAF9F6" strokeWidth="0.9" opacity="0.55" />
          <line x1="27" y1="20" x2="31" y2="20" stroke="#FAF9F6" strokeWidth="0.9" opacity="0.55" />

          {/* Quadcopter — top-down silhouette */}
          {/* Arms (X pattern) */}
          <line x1="14" y1="14" x2="26" y2="26" stroke="#FAF9F6" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="26" y1="14" x2="14" y2="26" stroke="#FAF9F6" strokeWidth="1.6" strokeLinecap="round" />
          {/* Rotor housings (4 corners) — gold accents */}
          <circle cx="14" cy="14" r="2.2" fill="#D4AF37" stroke="#FAF9F6" strokeWidth="0.6" />
          <circle cx="26" cy="14" r="2.2" fill="#D4AF37" stroke="#FAF9F6" strokeWidth="0.6" />
          <circle cx="14" cy="26" r="2.2" fill="#D4AF37" stroke="#FAF9F6" strokeWidth="0.6" />
          <circle cx="26" cy="26" r="2.2" fill="#D4AF37" stroke="#FAF9F6" strokeWidth="0.6" />
          {/* Central body */}
          <circle cx="20" cy="20" r="3" fill="#FAF9F6" />
          <circle cx="20" cy="20" r="1.4" fill="#1E4D2B" />
        </svg>
        <div className="leading-none">
          <div className="text-[13px] font-bold text-[var(--color-white)] tracking-tight">
            Command Center
          </div>
          <div className="text-[8.5px] uppercase tracking-[0.18em] text-[var(--color-sidebar-muted)] mt-1 font-semibold">
            UAV Dispatch · Risk Ops
          </div>
        </div>
      </div>

      {/* ── Navigation tabs ── */}
      <nav className="flex items-center gap-1 px-4 shrink-0">
        {tabs.map(t => {
          const active = t.key === page || (t.key === 'sim' && page === 'results')
          const onClick = () => {
            if (t.href) window.open(t.href, '_blank', 'noopener,noreferrer')
            else if (!t.soon) setPage(t.key)
          }
          return (
            <button
              key={t.key}
              onClick={onClick}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-colors
                ${active
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/30 cursor-pointer'
                  : t.soon
                    ? 'text-[var(--color-txt3)] cursor-not-allowed'
                    : 'text-[var(--color-txt2)] hover:text-[var(--color-white)] hover:bg-white/5 cursor-pointer'
                }`}
              title={t.soon ? 'Coming soon' : t.href ? `Open ${t.href}` : undefined}
            >
              <span className="text-[11px]">{t.icon}</span>
              {t.label}
              {t.soon && (
                <span className="ml-1 px-1.5 py-[1px] rounded text-[8.5px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 ring-1 ring-amber-700/30">
                  Soon
                </span>
              )}
              {t.href && (
                <span className="ml-0.5 text-[10px] opacity-70" aria-hidden="true">↗</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* ── Vertical divider ── */}
      <div className="w-px h-5 bg-[var(--color-border)] shrink-0 mx-1" />

      {/* ── Page-specific right content ── */}
      <div className="flex items-center gap-2 flex-1 min-w-0 pl-2">

        {/* DETECTION (operations) page */}
        {page === 'detection' && <>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-[var(--color-mint)]/15 text-[var(--color-mint)] uppercase tracking-wider">
              Primary
            </span>
            <span className="text-[10px] text-[var(--color-txt2)]">
              Detection-time evaluation, policy comparison, and operational metrics.
            </span>
          </div>
          <div className="flex-1" />
        </>}

        {/* SIM page */}
        {page === 'sim' && <>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 border"
            style={{ color: phaseColor, borderColor: phaseColor + '44', background: phaseColor + '14' }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: phaseColor }} />
            {simPhase}
          </div>
          <div className="shrink-0 text-center">
            <div className="text-[8px] text-[var(--color-txt3)] uppercase tracking-widest leading-none mb-0.5">Time</div>
            <div className="text-[11px] font-bold font-[var(--font-mono)] text-[var(--color-cyan)] leading-none">{Math.floor(simMs)}ms</div>
          </div>
          <div className="w-px h-4 bg-[var(--color-border)] shrink-0" />
          <div className="shrink-0 text-center">
            <div className="text-[8px] text-[var(--color-txt3)] uppercase tracking-widest leading-none mb-0.5">Sev</div>
            <div className={`text-[11px] font-bold font-[var(--font-mono)] leading-none ${severity === 1 ? 'text-[var(--color-danger)]' : 'text-[var(--color-warn)]'}`}>
              {severity === 0 ? 'MOD' : 'HIGH'}
            </div>
          </div>
          <div className="shrink-0 text-center">
            <div className="text-[8px] text-[var(--color-txt3)] uppercase tracking-widest leading-none mb-0.5">Primary</div>
            <div className="text-[11px] font-bold font-[var(--font-mono)] text-[var(--color-violet)] leading-none">
              {primaryIdx >= 0 ? `D${simDrones[primaryIdx]?.id ?? '—'}` : '—'}
            </div>
          </div>
          <div className="w-px h-4 bg-[var(--color-border)] shrink-0" />
          <div className="flex-1" />
          <button
            onClick={onNavigateResults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[var(--color-card)] transition-colors cursor-pointer shrink-0"
          >
            ⬡ Results
          </button>
          <button
            onClick={onOpenSimSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[var(--color-card)] transition-colors cursor-pointer shrink-0"
          >
            <GearIcon /> Settings
          </button>
        </>}

        {/* RESULTS page */}
        {page === 'results' && <>
          <div className="flex-1" />
          <button
            onClick={() => setPage('sim')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[var(--color-card)] transition-colors cursor-pointer"
          >
            ← Back to dispatch protocol
          </button>
        </>}

        {/* LORA page */}
        {/*
        {page === 'lora' && <>
          {Object.entries(SCENARIOS).map(([key, sc]) => (
            <button
              key={key}
              onClick={() => onLoraScenario(key)}
              className={`px-3 py-1.5 text-[10px] font-semibold rounded-md border transition-all cursor-pointer shrink-0
                ${loraScenario === key
                  ? 'bg-[var(--color-accent)] text-white border-transparent shadow-[0_0_12px_rgba(45,127,249,0.2)]'
                  : 'text-[var(--color-txt2)] border-[var(--color-border2)] hover:bg-[var(--color-card)]'}`}
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
                : 'text-[var(--color-txt2)] border-[var(--color-border2)] hover:bg-[var(--color-card)]'}`}
          >
            {showLoraGraphs ? '✕ Graphs' : 'Graphs'}
          </button>
          <button
            onClick={onOpenLoraSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[var(--color-card)] transition-colors cursor-pointer shrink-0"
          >
            <GearIcon /> Settings
          </button>
        </>}
        */}


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

  // Default landing page is the new operations dashboard.
  const [page, setPage] = useState('detection')

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
  // const [loraScenario, setLoraScenario] = useState('urban')
  // const [showLoraGraphs, setShowLoraGraphs] = useState(false)
  // const [showLoraSettings, setShowLoraSettings] = useState(false)

  /* Lifted Partition state */
  const [partitionDroneCount, setPartitionDroneCount] = useState(8)

  /* Dispatch protocol — fleet status popup toggle */
  const [showFleetModal, setShowFleetModal] = useState(false)

  useEffect(() => { sim.setConfig(config) }, [config])
  useEffect(() => { sim.setSeverity(severity) }, [severity])

  /* Animation loop — only runs when the dispatch protocol page is active. */
  useEffect(() => {
    if (page !== 'sim') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }
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
    simState: s.simState, simMs: s.simMs, severity, primaryIdx: s.primaryIdx, simDrones: s.drones,
    onOpenSimSettings: () => setShowSimSettings(true),
    onNavigateResults: () => setPage('results'),
    // loraScenario, onLoraScenario: setLoraScenario,
    // showLoraGraphs, onToggleLoraGraphs: () => setShowLoraGraphs(g => !g),
    // onOpenLoraSettings: () => setShowLoraSettings(true),
    partitionDroneCount, onPartitionDroneCount: setPartitionDroneCount,
  }

  if (page === 'detection') {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
        <AppHeader {...headerProps} />
        <DetectionPage />
      </div>
    )
  }

  if (page === 'hardware') {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
        <AppHeader {...headerProps} />
        <div className="flex-1 overflow-y-auto bg-slate-700/50 p-6">
          <HardwareEventsPage />
        </div>
      </div>
    )
  }

  if (page === 'results') {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
        <AppHeader {...headerProps} />
        <Results state={s} history={historyRef.current} onBack={() => setPage('sim')} />
      </div>
    )
  }

  /*
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
  */


  /* Dispatch protocol (legacy CNP simulator) */
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

      {/* ── Main workspace ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Viewport column */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 border-r border-[var(--color-border)]">

          {/* Viewport info strip */}
          <div className="flex items-center gap-4 px-5 py-2.5 bg-[var(--color-bg2)] border-b border-[var(--color-border)] shrink-0 overflow-x-auto">
            <div className="flex items-center gap-2.5 shrink-0">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300"
                style={{ background: simPhaseColor, boxShadow: s.simState !== 'idle' ? `0 0 8px ${simPhaseColor}cc` : 'none' }}
              />
              <span className="text-[11px] font-semibold text-slate-100 tracking-tight whitespace-nowrap">
                Dispatch Protocol
              </span>
              <span className="text-slate-700 text-[10px]">/</span>
              <span className="text-[10px] text-slate-500 whitespace-nowrap">CNP single-incident</span>
            </div>

            <span
              className="px-2.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-[0.14em] shrink-0 ring-1"
              style={{ color: simPhaseColor, borderColor: simPhaseColor + '44', background: simPhaseColor + '14', boxShadow: `inset 0 0 0 1px ${simPhaseColor}44` }}
            >
              {simPhaseLabel}
            </span>

            <div className="flex items-center gap-3 font-mono text-[10px] shrink-0">
              <span className="text-slate-500">
                Fleet <span className="text-cyan-800 font-bold tabular-nums ml-0.5">{s.drones.length + s.reserveDrones.length}</span>
              </span>
              <span className="text-slate-700">·</span>
              <span className="text-slate-500">
                Sensors <span className="text-purple-700 font-bold tabular-nums ml-0.5">4</span>
              </span>
              {s.simState !== 'idle' && (
                <>
                  <span className="text-slate-700">·</span>
                  <span className="text-slate-500">
                    Active <span className="font-bold ml-0.5 text-rose-700 tabular-nums">S{s.activeSensorIdx + 1}</span>
                  </span>
                </>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2 font-mono text-[10px] shrink-0">
              <span className="text-slate-500 uppercase tracking-wider text-[9px]">T+</span>
              <span className="text-slate-100 font-bold tabular-nums">
                {String(Math.floor(s.simMs)).padStart(6, '0')}
                <span className="text-slate-500 font-normal ml-0.5">ms</span>
              </span>
            </div>
          </div>

          {/* Canvas area */}
          <div className="flex-1 min-h-0 bg-[var(--color-bg)] p-3 overflow-hidden flex items-start">
            <canvas
              ref={canvasRef}
              width={1100} height={420}
              className="w-full rounded-lg border border-[var(--color-border)] block"
              style={{ boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}
            />
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="w-[340px] xl:w-[390px] shrink-0 flex flex-col min-h-0 overflow-hidden bg-[var(--color-bg)] border-l border-[var(--color-border)]">
          <button
            onClick={() => setShowFleetModal(true)}
            className="flex items-center gap-2.5 px-4 py-3 bg-[var(--color-card)] border-b border-[var(--color-border)] shrink-0 hover:bg-slate-700/50/50 transition-colors cursor-pointer text-left group"
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: s.drones.some(d => d.state !== 'idle') ? '#B45309' : '#14b8a6' }} />
            <span className="text-[11px] font-semibold text-slate-100 tracking-tight">Fleet status</span>
            <span className="text-slate-700 text-[10px]">/</span>
            <span className="text-[10px] text-slate-500 font-mono tabular-nums">
              {s.drones.filter(d => d.state !== 'idle').length}/{s.drones.length} active
            </span>
            <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-slate-400 group-hover:text-slate-200 transition-colors">
              View <span className="text-[11px] leading-none">›</span>
            </span>
          </button>
          <SOSPanel state={s} />
          <CommLog logs={s.logs} count={s.logCounter} />
        </div>
      </div>

      <Settings
        open={showSimSettings} onClose={() => setShowSimSettings(false)}
        config={config} onChange={handleConfigChange}
      />

      {showFleetModal && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            style={{ backdropFilter: 'blur(2px)' }}
            onClick={() => setShowFleetModal(false)}
          />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[860px] max-w-[92vw] h-[600px] max-h-[85vh] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg z-50 flex flex-col shadow-2xl overflow-hidden"
            style={{ animation: 'loraDrawerIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] shrink-0 bg-gradient-to-b from-[#0a0e1a] to-[var(--color-bg)]">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full"
                  style={{ background: s.drones.some(d => d.state !== 'idle') ? '#B45309' : '#14b8a6' }} />
                <span className="text-[12px] font-extrabold text-[var(--color-white)] tracking-tight">Fleet Status</span>
                <span className="text-[9px] text-[var(--color-txt3)] uppercase tracking-widest">Drone telemetry</span>
              </div>
              <button
                onClick={() => setShowFleetModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[var(--color-border2)] hover:text-white cursor-pointer transition-colors text-[13px] font-bold"
              >
                ✕
              </button>
            </div>
            <FleetGrid drones={s.drones} reserves={s.reserveDrones} state={s} wide />
          </div>
        </>
      )}
    </div>
  )
}
