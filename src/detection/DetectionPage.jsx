import { useState, useRef, useCallback } from 'react'
import SweepConfig from './components/SweepConfig'
import PolicyResultsPlots from './components/PolicyResultsPlots'
import AvailabilityPlots from './components/AvailabilityPlots'
import AllocationTable from './components/AllocationTable'
import SummaryCard from './components/SummaryCard'
import LiveMap from './components/LiveMap'
import { runSweep } from './lib/monteCarlo'
import { POLICIES } from './lib/policies'

const DEFAULT_CONFIG = {
  droneCountsText: '3, 5, 7, 10, 15, 20',
  trialsPerPoint: 20,
  params: {
    totalTime: 1800,             // 30 minutes per trial by default
    accidentRateMultiplier: 60,  // dense enough to give meaningful counts
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

export default function DetectionPage() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [results, setResults] = useState(null)
  const [availabilityByPolicy, setAvailabilityByPolicy] = useState(null)
  const [selectedN, setSelectedN] = useState(10)
  const [livePolicy, setLivePolicy] = useState('riskAware')
  const [activeTab, setActiveTab] = useState('detection')
  const cancelledRef = useRef(false)

  const handleRun = useCallback(async () => {
    cancelledRef.current = false
    const counts = parseCounts(config.droneCountsText)
    if (counts.length === 0) {
      alert('Please enter at least one drone count.')
      return
    }
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
        // Pick a sensible default selectedN
        if (!counts.includes(selectedN) && counts.length > 0) {
          setSelectedN(counts[Math.min(counts.length - 1, Math.floor(counts.length / 2))])
        }
      }
    } finally {
      setRunning(false)
    }
  }, [config, selectedN])

  const handleCancel = () => {
    cancelledRef.current = true
    setRunning(false)
  }

  const tabs = [
    { key: 'detection', label: 'Detection performance', step: 'Step 2' },
    { key: 'operational', label: 'Operational metrics', step: 'Step 3' },
    { key: 'allocation',  label: 'Allocation comparison', step: 'Step 4' },
    { key: 'live',        label: 'Live trial', step: 'Visual' },
  ]

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--color-bg)] p-4 space-y-4">
      {/* ── Top header strip ────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[15px] font-bold text-[var(--color-white)]">
            Detection-time evaluation
          </div>
          <div className="text-[11px] text-[var(--color-txt2)] mt-0.5 max-w-3xl leading-relaxed">
            Compares <span style={{ color: POLICIES.uniform.color }}>Uniform</span> versus{' '}
            <span style={{ color: POLICIES.riskAware.color }}>Risk-aware</span> drone allocation
            on Beirut roads using Poisson accident arrivals, back-and-forth patrol, and
            sensing-range detection. Each fleet size is evaluated over multiple Monte Carlo trials.
          </div>
        </div>
      </div>

      {/* ── Sweep configuration ─────────────────────────── */}
      <SweepConfig
        config={config}
        onChange={setConfig}
        onRun={handleRun}
        onCancel={handleCancel}
        isRunning={running}
        progress={progress}
      />

      {/* ── Result tabs ─────────────────────────────────── */}
      <div className="flex items-center gap-1.5 border-b border-[var(--color-border)] pb-2">
        {tabs.map((t) => {
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer
                ${active
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30'
                  : 'text-[var(--color-txt2)] border border-transparent hover:text-[var(--color-txt)] hover:bg-[#111827]'}`}
            >
              {t.label}
              <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-white/5 text-[var(--color-txt3)]">
                {t.step}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Results ──────────────────────────────────────── */}
      {activeTab === 'detection' && (
        <div className="space-y-4">
          {results ? <SummaryCard results={results} /> : null}
          <PolicyResultsPlots results={results ?? {}} />
        </div>
      )}

      {activeTab === 'operational' && (
        <AvailabilityPlots
          results={results ?? {}}
          availabilityByPolicy={availabilityByPolicy ?? {}}
          selectedN={selectedN}
          onSelectN={setSelectedN}
        />
      )}

      {activeTab === 'allocation' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-[var(--color-txt3)] uppercase tracking-wider font-semibold">
              Fleet size
            </span>
            {parseCounts(config.droneCountsText).map((n) => (
              <button
                key={n}
                onClick={() => setSelectedN(n)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded border transition-colors cursor-pointer
                  ${n === selectedN
                    ? 'bg-[var(--color-accent)]/20 border-[var(--color-accent)]/40 text-[var(--color-accent)]'
                    : 'border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#111827]'}`}
              >
                N = {n}
              </button>
            ))}
          </div>
          <AllocationTable N={selectedN} />
        </div>
      )}

      {activeTab === 'live' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-[var(--color-txt3)] uppercase tracking-wider font-semibold">
              Policy
            </span>
            {Object.values(POLICIES).map((p) => (
              <button
                key={p.key}
                onClick={() => setLivePolicy(p.key)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded border transition-colors cursor-pointer
                  ${p.key === livePolicy
                    ? 'border-current'
                    : 'border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#111827]'}`}
                style={{ color: p.key === livePolicy ? p.color : undefined }}
              >
                {p.label}
              </button>
            ))}
            <span className="text-[10px] text-[var(--color-txt3)] uppercase tracking-wider font-semibold ml-3">
              Fleet size
            </span>
            {parseCounts(config.droneCountsText).map((n) => (
              <button
                key={n}
                onClick={() => setSelectedN(n)}
                className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors cursor-pointer
                  ${n === selectedN
                    ? 'bg-[var(--color-accent)]/20 border-[var(--color-accent)]/40 text-[var(--color-accent)]'
                    : 'border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#111827]'}`}
              >
                {n}
              </button>
            ))}
          </div>
          <LiveMap N={selectedN} policyKey={livePolicy} />
        </div>
      )}
    </div>
  )
}
