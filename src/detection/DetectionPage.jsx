import { useState, useRef, useCallback } from 'react'
import SweepConfig from './components/SweepConfig'
import PolicyResultsPlots from './components/PolicyResultsPlots'
import AvailabilityPlots from './components/AvailabilityPlots'
import AllocationTable from './components/AllocationTable'
import SummaryCard from './components/SummaryCard'
import LiveMap from './components/LiveMap'
import SensitivityPlots from './components/SensitivityPlots'
import DetectionCDFPlots from './components/DetectionCDFPlots'
import DispatchComparison from './components/DispatchComparison'
import { DataSources } from '../partitioning/PartitionPage'
import { runSweep } from './lib/monteCarlo'
import { POLICIES } from './lib/policies'

const DEFAULT_CONFIG = {
  // §14 of the simplified-model report asks for the M = 1..20 saturation
  // curve. This default samples 1 and 20 plus enough intermediate points
  // to show the diminishing-returns knee (~5–10) without bloating the
  // total trial count.
  droneCountsText: '1, 2, 3, 5, 7, 10, 13, 16, 20',
  trialsPerPoint: 20,
  params: {
    // 30 days at the M51's real ~200 accidents/yr → ~16 events per trial.
    // No accidentRateMultiplier — events are generated at the historical
    // corridor rate (§2 of the model report).
    totalTime: 2592000,        // s — 30 days
    enableOperational: true,
  },
}

function parseCounts(text) {
  return text
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)
}

// ── Sidebar nav structure ─────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Setup',
    items: [
      { key: 'configure', label: 'Configure', icon: '⚙', desc: 'Fleet, time, multiplier' },
    ],
  },
  {
    label: 'Results',
    items: [
      { key: 'detection',   label: 'Detection performance', icon: '◇', desc: 'Mean time · P(det)' },
      { key: 'cdf',         label: 'P(Tₐ < τ) curves',     icon: '∿', desc: 'Empirical CDF' },
      { key: 'operational', label: 'Operational metrics',   icon: '◈', desc: 'Battery · availability' },
      { key: 'sensitivity', label: 'Sensitivity analysis',  icon: '⊕', desc: 'Parameter sweeps' },
    ],
  },
  {
    label: 'Comparison',
    items: [
      { key: 'allocation', label: 'Allocation table',    icon: '⬡', desc: 'Per-road drone counts' },
      { key: 'dispatch',   label: 'Dispatch strategies', icon: '⊗', desc: 'Nearest · battery · balanced' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { key: 'live',        label: 'Live trial',    icon: '◉', desc: 'Animated simulation · logs · export' },
      { key: 'datasources', label: 'Data Sources',  icon: '⊕', desc: 'Inputs · citations · provenance' },
    ],
  },
]

// ── Sidebar item ──────────────────────────────────────────────────────────────
function NavItem({ item, active, onClick, hasResults, running }) {
  const locked = item.key !== 'configure' && item.key !== 'live' &&
    item.key !== 'dispatch' && item.key !== 'sensitivity' &&
    item.key !== 'cdf' && item.key !== 'datasources' &&
    !hasResults && !running

  return (
    <button
      onClick={() => !locked && onClick(item.key)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer group relative
        ${active
          ? 'bg-slate-700/50 text-slate-100'
          : locked
            ? 'opacity-40 cursor-not-allowed'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50/50'}`}
    >
      {/* Active indicator */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-800 rounded-r" />
      )}
      <span className={`text-[13px] shrink-0 w-4 text-center leading-none
        ${active ? 'text-blue-800' : 'text-slate-500 group-hover:text-slate-400'}`}>
        {item.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-[11px] font-medium leading-tight truncate
          ${active ? 'text-slate-100' : ''}`}>
          {item.label}
        </div>
        <div className="text-[9px] text-slate-600 mt-0.5 truncate leading-tight">
          {item.desc}
        </div>
      </div>
    </button>
  )
}

// ── Main content header ───────────────────────────────────────────────────────
function ContentHeader({ item }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700/50 text-blue-800 text-[14px] shrink-0">
        {item.icon}
      </span>
      <div>
        <div className="text-[18px] font-semibold text-slate-100 tracking-tight leading-tight">
          {item.label}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">{item.desc}</div>
      </div>
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ progress }) {
  if (!progress) return null
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[9px] text-slate-500 mb-1">
        <span>Running sweep…</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[8.5px] text-slate-600 mt-1">
        {progress.done} / {progress.total} trials
      </div>
    </div>
  )
}

export default function DetectionPage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState(null)
  const [availabilityByPolicy, setAvailabilityByPolicy] = useState(null)
  const [selectedN, setSelectedN] = useState(10)
  const [livePolicy, setLivePolicy] = useState('riskAware')
  const [activeSection, setActiveSection] = useState('configure')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const cancelledRef = useRef(false)

  const handleRun = useCallback(async () => {
    cancelledRef.current = false
    const counts = parseCounts(config.droneCountsText)
    if (counts.length === 0) { alert('Please enter at least one drone count.'); return }
    setRunning(true)
    setResults(null)
    setAvailabilityByPolicy(null)
    setProgress({ done: 0, total: 0 })
    try {
      const { results, availabilityByPolicy } = await runSweep({
        droneCounts: counts,
        trialsPerPoint: config.trialsPerPoint,
        params: config.params,
        onProgress: (done, total) => {
          if (cancelledRef.current) return
          setProgress({ done, total })
        },
      })
      if (!cancelledRef.current) {
        setResults(results)
        setAvailabilityByPolicy(availabilityByPolicy)
        if (!counts.includes(selectedN) && counts.length > 0)
          setSelectedN(counts[Math.min(counts.length - 1, Math.floor(counts.length / 2))])
        setActiveSection('detection')
      }
    } finally {
      setRunning(false)
    }
  }, [config, selectedN])

  const handleCancel = () => { cancelledRef.current = true; setRunning(false) }

  // Flat list for lookup
  const allItems = NAV_GROUPS.flatMap((g) => g.items)
  const activeItem = allItems.find((i) => i.key === activeSection) ?? allItems[0]
  const counts = parseCounts(config.droneCountsText)

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-700/50">

      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside className={`${sidebarOpen ? 'w-52' : 'w-10'} shrink-0 flex flex-col border-r border-slate-600/80 bg-[var(--color-bg2)] transition-all duration-200 overflow-hidden`}>

        {/* Sidebar header */}
        <div className="px-3 py-3 border-b border-slate-600/60 flex items-start justify-between gap-2">
          {sidebarOpen && (
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-blue-800/80 mb-0.5 truncate">
                Operations
              </div>
              <div className="text-[13px] font-semibold text-slate-200 leading-tight truncate">
                Detection engine
              </div>
              <div className="text-[9px] text-slate-600 mt-0.5 truncate">M51 · Khalde → Awali</div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 cursor-pointer transition-colors text-[11px] mt-0.5"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '‹' : '›'}
          </button>
        </div>

        {/* Status pill */}
        <div className={`px-4 py-2.5 border-b border-slate-600/60 ${sidebarOpen ? '' : 'hidden'}`}>
          {running ? (
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-700 animate-pulse shrink-0" />
              <span className="text-[10px] text-amber-700 font-medium">Sweep running</span>
            </div>
          ) : results ? (
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-800 shrink-0" />
              <span className="text-[10px] text-emerald-800 font-medium">Results ready</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
              <span className="text-[10px] text-slate-500">No sweep run yet</span>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav className={`flex-1 overflow-y-auto px-2 py-3 space-y-4 ${sidebarOpen ? '' : 'hidden'}`}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-1 text-[8.5px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItem
                    key={item.key}
                    item={item}
                    active={activeSection === item.key}
                    onClick={setActiveSection}
                    hasResults={!!results}
                    running={running}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Run / cancel button at sidebar bottom */}
        <div className={`px-3 py-3 border-t border-slate-600/60 space-y-2 ${sidebarOpen ? '' : 'hidden'}`}>
          {running ? (
            <>
              <ProgressBar progress={progress} />
              <button
                onClick={handleCancel}
                className="w-full py-2 text-[10px] font-semibold rounded-lg border border-red-500/40 text-red-700 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                ✕ Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleRun}
              className="w-full py-2.5 text-[11px] font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer shadow-[0_0_16px_rgba(59,130,246,0.25)] flex items-center justify-center gap-2"
            >
              <span>▶</span> Run sweep
            </button>
          )}
          {results && !running && (
            <div className="text-[8.5px] text-slate-600 text-center">
              {counts.length} fleet sizes · {config.trialsPerPoint} trials each
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto p-6 flex flex-col items-center">
        <div className="w-full max-w-5xl">

        {/* Section header */}
        <ContentHeader item={activeItem} />

        {/* ── Configure ── */}
        {activeSection === 'configure' && (
          <div className="space-y-4 max-w-3xl">
            <div className="rounded-xl border border-slate-600/80 bg-slate-700/40 px-5 py-4">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">
                About this module
              </div>
              <p className="text-[11.5px] text-slate-400 leading-relaxed">
                Compares{' '}
                <span style={{ color: POLICIES.uniform.color }} className="font-semibold">Uniform</span>
                {' '}versus{' '}
                <span style={{ color: POLICIES.riskAware.color }} className="font-semibold">Risk-aware</span>
                {' '}drone allocation on the M51 Khalde→Awali corridor using Poisson accident arrivals,
                back-and-forth patrol, and sensing-range detection.
                Configure the sweep below, then click <strong className="text-slate-300">Run sweep</strong> in the sidebar.
                Results populate the analysis sections automatically.
              </p>
            </div>
            <SweepConfig
              config={config}
              onChange={setConfig}
              onRun={handleRun}
              onCancel={handleCancel}
              isRunning={running}
              progress={progress}
            />
          </div>
        )}

        {/* ── Detection performance ── */}
        {activeSection === 'detection' && (
          <div className="space-y-4">
            {results ? <SummaryCard results={results} /> : (
              <EmptyState label="Run a sweep to see detection performance results." />
            )}
            <PolicyResultsPlots results={results ?? {}} />
          </div>
        )}

        {/* ── P(Td < τ) CDF ── */}
        {activeSection === 'cdf' && (
          <DetectionCDFPlots results={results ?? {}} />
        )}

        {/* ── Operational metrics ── */}
        {activeSection === 'operational' && (
          <AvailabilityPlots
            results={results ?? {}}
            availabilityByPolicy={availabilityByPolicy ?? {}}
            selectedN={selectedN}
            onSelectN={setSelectedN}
          />
        )}

        {/* ── Sensitivity analysis ── */}
        {activeSection === 'sensitivity' && (
          <SensitivityPlots />
        )}

        {/* ── Allocation table ── */}
        {activeSection === 'allocation' && (
          <div className="space-y-4">
            {/* Fleet picker */}
            <div className="rounded-xl border border-slate-600/80 bg-slate-700/40 px-5 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Fleet size</span>
              {counts.map((n) => (
                <button
                  key={n}
                  onClick={() => setSelectedN(n)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-lg border transition-colors cursor-pointer
                    ${n === selectedN
                      ? 'bg-blue-500/20 border-blue-400/40 text-blue-800'
                      : 'border-slate-700 text-slate-400 hover:bg-slate-700/50'}`}
                >
                  N = {n}
                </button>
              ))}
              {counts.length === 0 && (
                <span className="text-[10px] text-slate-600">Configure fleet sizes in Setup → Configure.</span>
              )}
            </div>
            <AllocationTable N={selectedN} />
          </div>
        )}

        {/* ── Dispatch comparison ── */}
        {activeSection === 'dispatch' && (
          <DispatchComparison
            fleetSizes={counts}
            trialsPerPoint={config.trialsPerPoint}
            params={config.params}
          />
        )}

        {/* ── Data Sources ── */}
        {activeSection === 'datasources' && (
          <DataSources />
        )}

        {/* ── Live trial ── */}
        {activeSection === 'live' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-600/80 bg-slate-700/40 px-5 py-4">
                <div className="text-[9px] text-slate-500 uppercase tracking-[0.16em] font-semibold mb-2.5">
                  Allocation policy
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.values(POLICIES).map((p) => {
                    const active = p.key === livePolicy
                    return (
                      <button
                        key={p.key}
                        onClick={() => setLivePolicy(p.key)}
                        className={`flex items-center gap-2 px-3.5 py-1.5 text-[11px] font-medium rounded-lg transition-all cursor-pointer ring-1
                          ${active ? '' : 'ring-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50/50'}`}
                        style={active ? {
                          background: p.color + '18',
                          color: p.color,
                          boxShadow: `inset 0 0 0 1px ${p.color}55`,
                        } : undefined}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-slate-600/80 bg-slate-700/40 px-5 py-4">
                <div className="text-[9px] text-slate-500 uppercase tracking-[0.16em] font-semibold mb-2.5">
                  Fleet size
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {counts.map((n) => {
                    const active = n === selectedN
                    return (
                      <button
                        key={n}
                        onClick={() => setSelectedN(n)}
                        className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors cursor-pointer min-w-[48px] ring-1
                          ${active
                            ? 'bg-blue-500/15 ring-blue-700/40 text-blue-800'
                            : 'ring-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50/50'}`}
                      >
                        N&nbsp;=&nbsp;{n}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <LiveMap N={selectedN} policyKey={livePolicy} params={config.params} />
          </div>
        )}
        </div>
      </main>
    </div>
  )
}

function EmptyState({ label }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-600 px-6 py-8 text-center">
      <div className="text-[11px] text-slate-600">{label}</div>
    </div>
  )
}
