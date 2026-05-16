import { useEffect, useRef, useState } from 'react'
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

const FALLBACK_N = 10

// This page deliberately runs each trial for ONE simulated WEEK, not
// the Configure-page `totalTime`. Rationale:
//   - Sensitivity is about *relative* slopes between sweep points, not
//     absolute long-horizon predictions — a 7-day window is enough.
//   - 7 days gives ~3.8 accidents per trial on the real-rate corridor
//     (~200/yr), so with the Configure trials-per-point we get a
//     well-populated sample without paying the 30-day cost.
// Trials per point come from the Configure page. All other parameters
// (droneSpeed, sensingRange, simStartHour, battery thresholds, etc.)
// also come from Configure — only `totalTime` is overridden here.
const TRIAL_TIME = 7 * 86400 // s — 1 simulated week per trial

// ── Parameter sweep definitions ──────────────────────────────────────────────
// Each sweep declares a small grid of "interesting" values. The user's
// Configure value is inserted into the grid at render time so the amber
// reference line lands on a real, computed data point — not just between
// two samples. `defaultVal` is resolved per render from Configure params,
// with DEFAULT_PARAMS as fallback.
const SWEEPS = [
  {
    key: 'droneSpeed',
    label: 'Patrol speed',
    unit: 'm/s',
    baseValues: [6, 12, 18, 21],
    description: 'Faster drones cover their segment more frequently.',
  },
  {
    key: 'simStartHour',
    label: 'Trial start hour',
    unit: 'h',
    baseValues: [0, 8, 14, 20],
    description: 'Hour-of-day baseline. Different time slots reweight T / C / M.',
  },
  {
    key: 'lowBatteryThreshold',
    label: 'Dock threshold',
    unit: '%',
    baseValues: [10, 20, 30, 40],
    description: 'Battery % at which a drone returns to dock. Higher → docks sooner.',
  },
  {
    key: 'sensingRange',
    label: 'IoT range R_IoT',
    unit: 'm',
    baseValues: [100, 200, 300, 400],
    description: 'IoT comms range. Wider → drone enters the signal zone sooner.',
  },
]

const grid = '#1e293b'
const textColor = '#64748b'

const nextTick = () => new Promise((r) => setTimeout(r, 0))

// Insert the Configure value into the sweep grid if it isn't already
// there, keeping the grid sorted. Guarantees the amber reference line
// has a real data point on every chart.
function withConfigureValue(baseValues, configValue) {
  if (!Number.isFinite(configValue)) return baseValues
  if (baseValues.some((v) => Math.abs(v - configValue) < 1e-9)) return baseValues
  return [...baseValues, configValue].sort((a, b) => a - b)
}

// Async sweep runner. Honors Configure params verbatim (no clamping)
// and yields to the event loop between trials so the browser stays
// responsive on a 30-day × 20-trial config. Reports progress per trial
// and emits each chart's data as soon as it's ready, so charts paint
// progressively instead of all-at-once at the end.
async function runSweeps({
  sweepsWithDefaults,
  trialsPerPoint,
  totalTime,
  fixedN,
  baseParams,
  onTick,
  onChartReady,
  isCancelled,
}) {
  for (const sweep of sweepsWithDefaults) {
    const rows = []
    for (const v of sweep.values) {
      if (isCancelled()) return
      const params = {
        ...DEFAULT_PARAMS,
        ...baseParams,
        [sweep.key]: v,
        totalTime,
      }
      const row = { v }
      for (const pKey of ['uniform', 'riskAware']) {
        const allocation = POLICIES[pKey].allocate(fixedN)
        const trialParams = {
          ...params,
          patrolMode: POLICIES[pKey].patrolMode ?? 'uniform',
        }
        let totalDt = 0
        let count = 0
        for (let t = 0; t < trialsPerPoint; t++) {
          if (isCancelled()) return
          const r = simulateOnce({
            allocation,
            params: trialParams,
            seed: 42 + t * 31,
          })
          r.detectionTimes.forEach((dt) => {
            totalDt += dt
            count++
          })
          onTick()
          // Yield every 2 trials. Tight enough that a 30-day trial
          // never blocks the UI for more than a few hundred ms, but
          // loose enough that the setTimeout overhead is negligible.
          if (t % 2 === 1) await nextTick()
        }
        row[pKey] = count > 0 ? Math.round(totalDt / count) : null
      }
      rows.push(row)
    }
    if (!isCancelled()) onChartReady(sweep.key, rows)
  }
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
            type="number"
            domain={['dataMin', 'dataMax']}
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

function ChartPlaceholder({ sweep }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 h-[260px] flex flex-col">
      <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
        {sweep.label}
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="inline-flex items-center gap-2 text-[10.5px] text-[var(--color-txt3)]">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500/40 animate-pulse" />
          Computing {sweep.label.toLowerCase()}…
        </div>
      </div>
    </div>
  )
}

export default function SensitivityPlots({ fleetSizes, trialsPerPoint, params }) {
  // Hold N fixed at the median of the user's fleet sizes (falling back
  // to 10 if Configure hasn't been touched yet).
  const fixedN = (fleetSizes && fleetSizes.length > 0)
    ? fleetSizes[Math.floor(fleetSizes.length / 2)]
    : FALLBACK_N
  const trials = Math.max(1, trialsPerPoint ?? 5)
  const baseParams = params ?? {}
  // totalTime is fixed at 1 day on this page (see TRIAL_TIME above).
  // Every other parameter still flows from Configure.
  const totalTime = TRIAL_TIME

  // Per-sweep defaultVal comes from Configure first, DEFAULT_PARAMS
  // second. The `values` grid then inserts that defaultVal so the
  // reference line hits a real data point.
  const sweepsWithDefaults = SWEEPS.map((s) => {
    const defaultVal = baseParams[s.key] ?? DEFAULT_PARAMS[s.key]
    return { ...s, defaultVal, values: withConfigureValue(s.baseValues, defaultVal) }
  })

  const totalTrials = sweepsWithDefaults.reduce(
    (n, s) => n + s.values.length * 2 * trials,
    0,
  )

  const [chartData, setChartData] = useState({})
  const [done, setDone] = useState(0)
  const cancelRef = useRef(false)

  const depKey = `${fixedN}|${trials}|${totalTime}|${JSON.stringify(baseParams)}`

  useEffect(() => {
    cancelRef.current = false
    setChartData({})
    setDone(0)
    runSweeps({
      sweepsWithDefaults,
      trialsPerPoint: trials,
      totalTime,
      fixedN,
      baseParams,
      onTick: () => setDone((d) => d + 1),
      onChartReady: (k, rows) =>
        setChartData((prev) => ({ ...prev, [k]: rows })),
      isCancelled: () => cancelRef.current,
    })
    return () => {
      cancelRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey])

  const pct = totalTrials > 0 ? Math.min(100, Math.round((done / totalTrials) * 100)) : 0
  const allDone = Object.keys(chartData).length === sweepsWithDefaults.length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">
          Sensitivity Analysis — one parameter at a time
        </div>
        <div className="mb-2 inline-flex items-center gap-2 px-2 py-0.5 rounded-md bg-amber-700/10 ring-1 ring-amber-700/30 text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
          Fixed window: 1 simulated week per trial
        </div>
        <div className="text-[11px] text-[var(--color-txt3)] leading-relaxed max-w-3xl">
          <span className="text-[var(--color-txt2)] font-semibold">What this page does:</span>{' '}
          for each of the four parameters below, it varies that parameter alone — every other
          parameter is held at your Configure value — and plots mean detection time under
          both allocation policies. Steeper slope = more sensitive; the gap between the two
          curves shows where Risk-aware beats Uniform.
          <br />
          Run setup: N&nbsp;=&nbsp;{fixedN}, <span className="text-[var(--color-txt2)] font-semibold">{trials} trials per point</span> (from Configure),
          1-week window per trial (fixed on this page so the sweep stays fast).
          The amber dashed line on each chart marks the Configure value (also plotted as a
          data point so you can read off its predicted detection time).
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

        {!allDone && (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden ring-1 ring-slate-800">
              <div
                className="h-full bg-blue-700 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] text-[var(--color-txt3)] font-mono tabular-nums w-28 text-right">
              {done} / {totalTrials} trials · {pct}%
            </span>
          </div>
        )}
      </div>

      {/* 2×2 grid of charts (each paints as it completes) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sweepsWithDefaults.map((sweep) => (
          chartData[sweep.key] ? (
            <SweepChart
              key={sweep.key}
              sweep={sweep}
              data={chartData[sweep.key]}
              fixedN={fixedN}
              trials={trials}
              defaultVal={sweep.defaultVal}
            />
          ) : (
            <ChartPlaceholder key={sweep.key} sweep={sweep} />
          )
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
