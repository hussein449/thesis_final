import { useMemo } from 'react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { simulateOnce, DEFAULT_PARAMS } from '../lib/detection-sim'
import { POLICIES } from '../lib/policies'

const grid = '#1e293b'
const textColor = '#64748b'

function toCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => {
        const v = r[h] ?? ''
        return String(v).includes(',') ? `"${v}"` : v
      }).join(',')
    ),
  ]
  return lines.join('\r\n')
}

function downloadCSV(rows, filename) {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ExportCSVButton({ onClick, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-bold rounded-md border transition-colors shrink-0
        ${disabled
          ? 'border-[var(--color-border2)] text-[var(--color-txt3)] opacity-50 cursor-not-allowed'
          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 cursor-pointer'}`}
    >
      ⬇ Export CSV
    </button>
  )
}

// ── P(T_d < 2 min) vs N from sweep results ───────────────────────────────────
function buildPUnder2MinData(results) {
  const policies = Object.keys(results)
  if (policies.length === 0) return []
  const byN = new Map()
  for (const pk of policies) {
    for (const pt of results[pk]) {
      if (!byN.has(pt.N)) byN.set(pt.N, { N: pt.N })
      byN.get(pt.N)[pk] = +(pt.pUnder2Min * 100).toFixed(1)
    }
  }
  return [...byN.values()].sort((a, b) => a.N - b.N)
}

// ── Empirical CDF of detection times at a fixed N ────────────────────────────
const CDF_N = 10
const CDF_TRIALS = 20
// 7 simulated days × CDF_TRIALS=20 × ~4 events/trial = ~80 detection
// samples per policy — enough to draw a smooth CDF at real corridor rates.
const CDF_TOTAL_TIME = 7 * 86400

function buildCDFData() {
  const allTimes = { uniform: [], riskAware: [] }
  const params = { ...DEFAULT_PARAMS, totalTime: CDF_TOTAL_TIME }

  for (const pk of ['uniform', 'riskAware']) {
    const allocation = POLICIES[pk].allocate(CDF_N)
    const trialParams = { ...params, patrolMode: POLICIES[pk].patrolMode ?? 'uniform' }
    for (let t = 0; t < CDF_TRIALS; t++) {
      const r = simulateOnce({ allocation, params: trialParams, seed: 7 + t * 53 })
      allTimes[pk].push(...r.detectionTimes)
    }
    allTimes[pk].sort((a, b) => a - b)
  }

  // Build CDF at regular tau steps (0 to maxDetectionWindow)
  const MAX_TAU = DEFAULT_PARAMS.maxDetectionWindow
  const STEPS = 60
  const data = []
  for (let i = 0; i <= STEPS; i++) {
    const tau = (i / STEPS) * MAX_TAU
    const row = { tau: Math.round(tau) }
    for (const pk of ['uniform', 'riskAware']) {
      const arr = allTimes[pk]
      const count = arr.filter((v) => v <= tau).length
      row[pk] = arr.length > 0 ? +(count / arr.length * 100).toFixed(1) : 0
    }
    data.push(row)
  }
  return data
}

function CustomTooltip({ active, payload, label, xLabel, xUnit = '', yUnit = '%' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-[var(--color-txt2)] mb-1">
        {xLabel}: {label}{xUnit}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[var(--color-txt2)]">{p.name}:</span>
          <span className="font-bold font-mono" style={{ color: p.color }}>
            {p.value != null ? `${p.value}${yUnit}` : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function DetectionCDFPlots({ results }) {
  const pUnder2MinData = useMemo(() => buildPUnder2MinData(results), [results])
  const cdfData = useMemo(() => buildCDFData(), [])

  const policies = Object.keys(results)
  const hasSweepResults = policies.length > 0

  return (
    <div className="space-y-4">
      {/* ── CDF curve: P(Td < τ) vs τ at fixed N ─────────── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
              P(T<sub>d</sub> &lt; τ) — empirical CDF of detection time
              <span className="ml-2 text-[var(--color-txt3)] normal-case tracking-normal font-normal">
                N = {CDF_N}, {CDF_TRIALS} trials, 30 min sim time
              </span>
            </div>
            <div className="text-[9.5px] text-[var(--color-txt3)] mt-0.5 leading-relaxed">
              Fraction of accidents detected within τ seconds. A curve shifted left means faster
              detection. The dashed lines mark τ = 120 s (2 min) — the key service-level threshold.
            </div>
          </div>
          <ExportCSVButton
            onClick={() => downloadCSV(cdfData, `cdf-detection-time_N${CDF_N}.csv`)}
            disabled={cdfData.length === 0}
          />
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={cdfData} margin={{ top: 10, right: 20, left: 0, bottom: 36 }}>
            <defs>
              <linearGradient id="gradUniform" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={POLICIES.uniform.color} stopOpacity={0.18} />
                <stop offset="95%" stopColor={POLICIES.uniform.color} stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="gradRiskAware" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={POLICIES.riskAware.color} stopOpacity={0.18} />
                <stop offset="95%" stopColor={POLICIES.riskAware.color} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="tau"
              stroke={textColor}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${v}s`}
              label={{
                value: 'Detection time threshold τ (s)',
                position: 'insideBottom',
                offset: -10,
                fill: textColor,
                fontSize: 10,
              }}
            />
            <YAxis
              domain={[0, 100]}
              stroke={textColor}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${v}%`}
              label={{
                value: 'P(Tₐ < τ)',
                angle: -90,
                position: 'insideLeft',
                fill: textColor,
                fontSize: 10,
              }}
            />
            <Tooltip content={<CustomTooltip xLabel="τ" xUnit="s" />} />
            <Legend verticalAlign="top" align="right" iconSize={9} wrapperStyle={{ fontSize: 10, color: textColor, paddingBottom: 6 }} />
            <ReferenceLine
              x={120}
              stroke="#B45309"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{ value: '2 min', position: 'top', fill: '#B45309', fontSize: 9 }}
            />
            <Area
              type="monotone"
              dataKey="uniform"
              name={POLICIES.uniform.label}
              stroke={POLICIES.uniform.color}
              fill="url(#gradUniform)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="riskAware"
              name={POLICIES.riskAware.label}
              stroke={POLICIES.riskAware.color}
              fill="url(#gradRiskAware)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── P(Td < 2 min) vs N from sweep (if available) ── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
              P(T<sub>d</sub> &lt; 2 min) vs fleet size N
              {!hasSweepResults && (
                <span className="ml-2 text-amber-700/70 normal-case tracking-normal font-normal">
                  — run a sweep on Step 1 to populate this chart
                </span>
              )}
            </div>
            <div className="text-[9.5px] text-[var(--color-txt3)] mt-0.5 leading-relaxed">
              Service-level metric: probability that any given accident is detected within 2 minutes,
              aggregated across all trials per fleet size.
            </div>
          </div>
          <ExportCSVButton
            onClick={() => downloadCSV(pUnder2MinData, 'p-under-2min_vs_N.csv')}
            disabled={!hasSweepResults || pUnder2MinData.length === 0}
          />
        </div>

        {hasSweepResults ? (
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={pUnder2MinData} margin={{ top: 10, right: 20, left: 0, bottom: 36 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="N"
                stroke={textColor}
                tick={{ fontSize: 10 }}
                label={{
                  value: 'Fleet size N',
                  position: 'insideBottom',
                  offset: -10,
                  fill: textColor,
                  fontSize: 10,
                }}
              />
              <YAxis
                domain={[0, 100]}
                stroke={textColor}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v}%`}
                label={{
                  value: 'P(Tₐ < 2 min)',
                  angle: -90,
                  position: 'insideLeft',
                  fill: textColor,
                  fontSize: 10,
                }}
              />
              <Tooltip content={<CustomTooltip xLabel="N" xUnit=" drones" />} />
              <Legend verticalAlign="top" align="right" iconSize={9} wrapperStyle={{ fontSize: 10, color: textColor, paddingBottom: 6 }} />
              <ReferenceLine
                y={80}
                stroke="#6366f1"
                strokeDasharray="5 3"
                strokeWidth={1}
                label={{ value: '80% SLA', position: 'insideTopRight', fill: '#6366f1', fontSize: 9 }}
              />
              {policies.map((pk) => (
                <Line
                  key={pk}
                  type="monotone"
                  dataKey={pk}
                  name={POLICIES[pk]?.label ?? pk}
                  stroke={POLICIES[pk]?.color ?? '#fff'}
                  strokeWidth={2}
                  dot={{ r: 3, fill: POLICIES[pk]?.color ?? '#fff' }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[230px] flex items-center justify-center text-[11px] text-[var(--color-txt3)] rounded-lg border border-dashed border-[var(--color-border2)]">
            Run a sweep above to populate this chart with your configured fleet sizes.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-3">
        <div className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
          <span className="text-[var(--color-txt2)] font-semibold">Interpretation: </span>
          The CDF chart (top) shows the full distribution — a curve rising steeply and early indicates
          reliable fast detection. The bottom chart shows how that 2-minute probability improves with
          more drones. The indigo dashed line marks an 80% service-level target.
          Risk-aware allocation should outperform Uniform by concentrating drones where accidents
          are most likely, yielding a higher P(T<sub>d</sub> &lt; τ) at the same fleet size.
        </div>
      </div>
    </div>
  )
}
