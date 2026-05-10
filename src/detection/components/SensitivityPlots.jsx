import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { simulateOnce, DEFAULT_PARAMS } from '../lib/detection-sim'
import { POLICIES } from '../lib/policies'

const FIXED_N = 10
const TRIALS = 10

// ── Parameter sweep definitions ──────────────────────────────────────────────
const SWEEPS = [
  {
    key: 'droneSpeed',
    label: 'Patrol speed',
    unit: 'm/s',
    values: [6, 8, 10, 12, 15, 18, 21],
    defaultVal: DEFAULT_PARAMS.droneSpeed,
    description:
      'Faster drones cover their segment more frequently, reducing the gap between patrols.',
  },
  {
    key: 'accidentRateMultiplier',
    label: 'Accident rate multiplier',
    unit: '×',
    values: [20, 40, 60, 80, 100, 120],
    defaultVal: DEFAULT_PARAMS.accidentRateMultiplier,
    description:
      'Higher multiplier → denser accident schedule. At low rates, chance dominates; at high rates, coverage gaps dominate.',
  },
  {
    key: 'lowBatteryThreshold',
    label: 'Dock threshold',
    unit: '%',
    values: [10, 15, 20, 25, 30, 35, 40],
    defaultVal: DEFAULT_PARAMS.lowBatteryThreshold,
    description:
      'Battery level at which a drone returns to dock. Higher threshold → drones dock sooner → more gaps.',
  },
  {
    key: 'sensingRange',
    label: 'Sensing radius',
    unit: 'm',
    values: [50, 100, 150, 200, 250, 300, 350],
    defaultVal: DEFAULT_PARAMS.sensingRange,
    description:
      'Optical detection radius. A wider cone reduces time-to-detect but depends on camera / altitude.',
  },
]

const grid = '#1e293b'
const textColor = '#64748b'

// Run sensitivity sweep synchronously (fast enough — ~500 simulateOnce calls)
function computeSweep(sweep) {
  const results = []
  for (const v of sweep.values) {
    const params = { ...DEFAULT_PARAMS, [sweep.key]: v, totalTime: 1800 }
    const row = { v }
    for (const pKey of ['uniform', 'riskAware']) {
      const allocation = POLICIES[pKey].allocate(FIXED_N)
      let totalDt = 0
      let count = 0
      for (let t = 0; t < TRIALS; t++) {
        const r = simulateOnce({ allocation, params, seed: 42 + t * 31 })
        r.detectionTimes.forEach((dt) => { totalDt += dt; count++ })
      }
      row[pKey] = count > 0 ? Math.round(totalDt / count) : null
    }
    results.push(row)
  }
  return results
}

function SweepChart({ sweep, data }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="mb-1">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
          {sweep.label}
          <span className="ml-2 text-[var(--color-txt3)] normal-case tracking-normal font-normal">
            — sensitivity at N = {FIXED_N}, {TRIALS} trials/point
          </span>
        </div>
        <div className="text-[9.5px] text-[var(--color-txt3)] mt-0.5 leading-relaxed">
          {sweep.description}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={data} margin={{ top: 12, right: 20, left: 0, bottom: 36 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="v"
            stroke={textColor}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${v}${sweep.unit}`}
            label={{
              value: `${sweep.label} (${sweep.unit})`,
              position: 'insideBottom',
              offset: -8,
              fill: textColor,
              fontSize: 10,
            }}
          />
          <YAxis
            stroke={textColor}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${Math.round(v)}s`}
            label={{
              value: 'Mean detect. time (s)',
              angle: -90,
              position: 'insideLeft',
              fill: textColor,
              fontSize: 10,
            }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl">
                  <div className="text-[10px] text-[var(--color-txt2)] mb-1">
                    {sweep.label} = {label}{sweep.unit}
                    {label === sweep.defaultVal && (
                      <span className="ml-1.5 text-amber-700/80">← default</span>
                    )}
                  </div>
                  {payload.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      <span className="text-[var(--color-txt2)]">{p.name}:</span>
                      <span className="font-bold font-mono" style={{ color: p.color }}>
                        {p.value != null ? `${Math.round(p.value)} s` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )
            }}
          />
          <Legend verticalAlign="top" align="right" iconSize={9} wrapperStyle={{ fontSize: 10, color: textColor, paddingBottom: 6 }} />
          <ReferenceLine
            x={sweep.defaultVal}
            stroke="#B45309"
            strokeDasharray="4 3"
            strokeWidth={1}
            label={{ value: 'default', position: 'top', fill: '#B45309', fontSize: 8 }}
          />
          <Line
            type="monotone"
            dataKey="uniform"
            name={POLICIES.uniform.label}
            stroke={POLICIES.uniform.color}
            strokeWidth={2}
            dot={{ r: 3, fill: POLICIES.uniform.color }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="riskAware"
            name={POLICIES.riskAware.label}
            stroke={POLICIES.riskAware.color}
            strokeWidth={2}
            dot={{ r: 3, fill: POLICIES.riskAware.color }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function SensitivityPlots() {
  const sweepData = useMemo(() => {
    return SWEEPS.map((sweep) => ({ sweep, data: computeSweep(sweep) }))
  }, [])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">
          Sensitivity Analysis — one parameter at a time
        </div>
        <div className="text-[11px] text-[var(--color-txt3)] leading-relaxed max-w-3xl">
          Each chart varies one operational parameter while holding all others at their default value
          (N&nbsp;=&nbsp;{FIXED_N}, {TRIALS} Monte Carlo trials per point, sim time 30 min).
          The amber dashed line marks the default value used in the main sweep.
          Both allocation policies are shown to reveal where Risk-aware outperforms Uniform.
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-[var(--color-txt3)]">
          {SWEEPS.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="font-semibold text-[var(--color-txt2)]">{s.label}:</span>
              <span className="font-mono">{s.values.join(', ')} {s.unit}</span>
              <span className="text-amber-700/70">(def. {s.defaultVal})</span>
            </div>
          ))}
        </div>
      </div>

      {/* What is plotted & params explainer */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-2">
          What is plotted &amp; how to read it
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10.5px] leading-relaxed">
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
              Axes
            </div>
            <div className="text-[var(--color-txt3)]">
              <span className="text-slate-300 font-mono">x</span> — value of the swept parameter.
              <span className="text-slate-300 font-mono ml-2">y</span> — mean detection time (s),
              averaged over {TRIALS} Monte Carlo trials × all detected accidents.
            </div>
            <div className="text-[var(--color-txt3)] mt-2">
              Two curves per chart: <span style={{ color: POLICIES.uniform.color }} className="font-semibold">Uniform</span> and
              <span style={{ color: POLICIES.riskAware.color }} className="font-semibold ml-1">Risk-aware</span>.
              The amber dashed vertical line marks the default value held fixed in every other sweep.
            </div>
          </div>
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
              Held-fixed parameters
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-300">
              <span className="text-slate-500">N</span><span>{FIXED_N} drones</span>
              <span className="text-slate-500">trials/point</span><span>{TRIALS}</span>
              <span className="text-slate-500">sim time</span><span>1800 s (30 min)</span>
              <span className="text-slate-500">seed base</span><span>42 (deterministic)</span>
              <span className="text-slate-500">accident model</span><span>Poisson per road</span>
            </div>
          </div>
        </div>
        <div className="mt-3 text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
          <span className="text-[var(--color-txt2)] font-semibold">Swept parameters: </span>
          <span className="font-mono text-slate-300">droneSpeed</span> (patrol speed),
          <span className="font-mono text-slate-300 ml-1">accidentRateMultiplier</span> (incident density),
          <span className="font-mono text-slate-300 ml-1">lowBatteryThreshold</span> (return-to-dock trigger),
          <span className="font-mono text-slate-300 ml-1">sensingRange</span> (optical detection radius).
          Each is varied independently while the other three stay at their defaults — so each chart
          isolates the effect of a single parameter.
        </div>
      </div>

      {/* 2×2 grid of charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sweepData.map(({ sweep, data }) => (
          <SweepChart key={sweep.key} sweep={sweep} data={data} />
        ))}
      </div>

      {/* Interpretation note */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-3">
        <div className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
          <span className="text-[var(--color-txt2)] font-semibold">Reading the charts: </span>
          A steeper slope indicates that the metric is more sensitive to that parameter — a small
          change causes a large shift in mean detection time. Flat regions show where the system is
          robust (further investment in that dimension yields diminishing returns). The gap between
          the two policy curves reflects how much Risk-aware allocation improves over Uniform
          for that configuration.
        </div>
      </div>
    </div>
  )
}
