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

// Hard caps for the per-tab sweep so the page stays responsive even if
// Configure has 100 trials × 30-day windows. These are the *upper* limits
// — smaller Configure values are respected verbatim.
const MAX_TOTAL_TIME = 7 * 86400   // 7 days
const MAX_TRIALS = 10
const FALLBACK_N = 10

// ── Parameter sweep definitions ──────────────────────────────────────────────
// `defaultVal` is intentionally OMITTED here — it's resolved per render
// from the user's Configure values, with DEFAULT_PARAMS as a fallback.
// That keeps the "default" reference line and the "(def. X)" label
// in sync with whatever the user set on the Configure page.
const SWEEPS = [
  {
    key: 'droneSpeed',
    label: 'Patrol speed',
    unit: 'm/s',
    values: [6, 8, 10, 12, 15, 18, 21],
    description:
      'Faster drones cover their segment more frequently, reducing the gap between patrols.',
  },
  {
    key: 'simStartHour',
    label: 'Trial start hour',
    unit: 'h',
    values: [0, 3, 6, 8, 10, 14, 18, 22],
    description:
      'Hour of day (0–23) at which the trial window begins. Different time slots (00–06, 06–10, 10–16, 16–20, 20–24) weight T / C / M differently and shift the spatial accident distribution.',
  },
  {
    key: 'lowBatteryThreshold',
    label: 'Dock threshold',
    unit: '%',
    values: [10, 15, 20, 25, 30, 35, 40],
    description:
      'Battery level at which a drone returns to dock. Higher threshold → drones dock sooner → more gaps.',
  },
  {
    key: 'sensingRange',
    label: 'IoT range R_IoT',
    unit: 'm',
    values: [50, 100, 150, 200, 250, 300, 350],
    description:
      'IoT communication range. The accident enters detection when a candidate UAV reaches the signal zone [s_k − R_IoT, s_k + R_IoT]. Wider range → smaller T_alert.',
  },
]

const grid = '#1e293b'
const textColor = '#64748b'

// Run sensitivity sweep synchronously. The Configure-page `params` are
// used as the baseline for every "held-fixed" parameter; only the swept
// variable overrides them. Trial count and trial length are clamped so
// the synchronous sweep can't choke the browser on a 100-trial × 30-day
// Configure setup.
function computeSweep(sweep, { trialsPerPoint, totalTime, fixedN, baseParams }) {
  const results = []
  for (const v of sweep.values) {
    // Baseline = DEFAULT_PARAMS + user's Configure params, then override
    // the swept variable and clamp totalTime for this view.
    const params = {
      ...DEFAULT_PARAMS,
      ...baseParams,
      [sweep.key]: v,
      totalTime,
    }
    const row = { v }
    for (const pKey of ['uniform', 'riskAware']) {
      const allocation = POLICIES[pKey].allocate(fixedN)
      const trialParams = { ...params, patrolMode: POLICIES[pKey].patrolMode ?? 'uniform' }
      let totalDt = 0
      let count = 0
      for (let t = 0; t < trialsPerPoint; t++) {
        const r = simulateOnce({ allocation, params: trialParams, seed: 42 + t * 31 })
        r.detectionTimes.forEach((dt) => { totalDt += dt; count++ })
      }
      row[pKey] = count > 0 ? Math.round(totalDt / count) : null
    }
    results.push(row)
  }
  return results
}

function SweepChart({ sweep, data, fixedN, trials, defaultVal }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="mb-1">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
          {sweep.label}
          <span className="ml-2 text-[var(--color-txt3)] normal-case tracking-normal font-normal">
            — sensitivity at N = {fixedN}, {trials} trials/point
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
                    {label === defaultVal && (
                      <span className="ml-1.5 text-amber-700/80">← Configure value</span>
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
            x={defaultVal}
            stroke="#B45309"
            strokeDasharray="4 3"
            strokeWidth={1}
            label={{ value: 'Configure', position: 'top', fill: '#B45309', fontSize: 8 }}
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

export default function SensitivityPlots({ fleetSizes, trialsPerPoint, params }) {
  // Use the median of the user's fleet sizes as the held-fixed N, falling
  // back to 10 if none provided.
  const fixedN = (fleetSizes && fleetSizes.length > 0)
    ? fleetSizes[Math.floor(fleetSizes.length / 2)]
    : FALLBACK_N
  const safeTrials = Math.min(Math.max(1, trialsPerPoint ?? MAX_TRIALS), MAX_TRIALS)
  const safeTotalTime = Math.min(params?.totalTime ?? MAX_TOTAL_TIME, MAX_TOTAL_TIME)
  const baseParams = params ?? {}

  // Per-sweep defaultVal comes from the user's Configure params first,
  // then falls back to DEFAULT_PARAMS. This is what drives the amber
  // "Configure" reference line on each chart and the "(def. X)" label.
  const sweepsWithDefaults = SWEEPS.map((s) => ({
    ...s,
    defaultVal: baseParams[s.key] ?? DEFAULT_PARAMS[s.key],
  }))

  const depKey = `${fixedN}|${safeTrials}|${safeTotalTime}|${JSON.stringify(baseParams)}`

  const sweepData = useMemo(() => {
    const opts = {
      trialsPerPoint: safeTrials,
      totalTime: safeTotalTime,
      fixedN,
      baseParams,
    }
    return sweepsWithDefaults.map((sweep) => ({ sweep, data: computeSweep(sweep, opts) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">
          Sensitivity Analysis — one parameter at a time
        </div>
        <div className="text-[11px] text-[var(--color-txt3)] leading-relaxed max-w-3xl">
          Each chart varies one parameter while holding the others at the Configure values
          (N&nbsp;=&nbsp;{fixedN}, {safeTrials} trials per point,&nbsp;
          {(safeTotalTime / 86400).toFixed(1)}-day window).
          The amber dashed line marks each parameter's reference value.
          Both allocation policies are shown to reveal where Risk-aware outperforms Uniform.
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-[var(--color-txt3)]">
          {sweepsWithDefaults.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="font-semibold text-[var(--color-txt2)]">{s.label}:</span>
              <span className="font-mono">{s.values.join(', ')} {s.unit}</span>
              <span className="text-amber-700/70">(Configure: {s.defaultVal})</span>
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
              averaged over {safeTrials} Monte Carlo trials × all detected accidents.
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
              <span className="text-slate-500">N</span><span>{fixedN} drones</span>
              <span className="text-slate-500">trials/point</span><span>{safeTrials}</span>
              <span className="text-slate-500">sim time</span><span>{(safeTotalTime / 86400).toFixed(1)} days</span>
              <span className="text-slate-500">seed base</span><span>42 (deterministic)</span>
              <span className="text-slate-500">accident model</span><span>section-time Poisson (real rate)</span>
            </div>
          </div>
        </div>
        <div className="mt-3 text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
          <span className="text-[var(--color-txt2)] font-semibold">Swept parameters: </span>
          <span className="font-mono text-slate-300">droneSpeed</span> (patrol speed),
          <span className="font-mono text-slate-300 ml-1">simStartHour</span> (time-of-day slot),
          <span className="font-mono text-slate-300 ml-1">lowBatteryThreshold</span> (return-to-dock trigger),
          <span className="font-mono text-slate-300 ml-1">sensingRange</span> (IoT communication range R<sub>IoT</sub>).
          Each is varied independently while the other three stay at their defaults — so each chart
          isolates the effect of a single parameter.
        </div>
      </div>

      {/* 2×2 grid of charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sweepData.map(({ sweep, data }) => (
          <SweepChart
            key={sweep.key}
            sweep={sweep}
            data={data}
            fixedN={fixedN}
            trials={safeTrials}
            defaultVal={sweep.defaultVal}
          />
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
