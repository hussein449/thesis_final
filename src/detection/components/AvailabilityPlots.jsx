import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { POLICIES } from '../lib/policies'

const grid = '#1e293b'
const text = '#64748b'

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[#0d1225] p-4">
      <div className="mb-3">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
          {title}
        </div>
        {subtitle && (
          <div className="text-[10px] text-[var(--color-txt3)] mt-0.5">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  )
}

function CustomTooltip({ active, payload, label, xLabel = 't (s)', decimals = 1, unit = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#111827] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-[var(--color-txt2)] mb-1">{xLabel}: {label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[var(--color-txt2)]">{p.name}:</span>
          <span className="font-bold font-mono" style={{ color: p.color }}>
            {typeof p.value === 'number' ? p.value.toFixed(decimals) : '—'}
            {unit}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Build a combined timeline dataset for a fixed N, showing avg available
 * drones over time for both policies.
 */
function buildAvailabilityData(availabilityByPolicy, selectedN) {
  const policies = Object.keys(availabilityByPolicy)
  const series = {}
  let times = []

  for (const p of policies) {
    const point = availabilityByPolicy[p].find((x) => x.N === selectedN)
    if (!point) continue
    series[p] = point.timeline
    if (point.timeline.length > times.length) {
      times = point.timeline.map((x) => x.t)
    }
  }

  return times.map((t, idx) => {
    const row = { t }
    for (const p of policies) {
      const ts = series[p]
      if (ts && ts[idx]) row[p] = ts[idx].avgAvailable
    }
    return row
  })
}

function buildMissedData(results) {
  const byN = new Map()
  for (const [p, pts] of Object.entries(results)) {
    for (const pt of pts) {
      if (!byN.has(pt.N)) byN.set(pt.N, { N: pt.N })
      // Express as a percentage of total accidents to remove run-length bias
      byN.get(pt.N)[`${p}_missedPct`] =
        pt.nTotal > 0 ? (pt.nMissed / pt.nTotal) * 100 : 0
    }
  }
  return [...byN.values()].sort((a, b) => a.N - b.N)
}

export default function AvailabilityPlots({
  results,
  availabilityByPolicy,
  selectedN,
  onSelectN,
}) {
  const policies = Object.keys(availabilityByPolicy ?? {})
  const droneCounts = (results?.[policies[0]] ?? []).map((p) => p.N)

  const availData = buildAvailabilityData(availabilityByPolicy ?? {}, selectedN)
  const missedData = buildMissedData(results ?? {})

  if (policies.length === 0) {
    return (
      <div className="text-[11px] text-[var(--color-txt2)] p-6 text-center">
        Run a sweep to see operational metrics.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── Availability over time ─────────────────────── */}
      <ChartCard
        title="Average available drones over time"
        subtitle={`At fleet size N = ${selectedN}. Drones drop below the assigned count when they return to dock for charging.`}
      >
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-[9px] text-[var(--color-txt3)] uppercase tracking-wider mr-1">N =</span>
          {droneCounts.map((n) => {
            const active = n === selectedN
            return (
              <button
                key={n}
                onClick={() => onSelectN(n)}
                className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer
                  ${active
                    ? 'bg-[var(--color-accent)]/20 border-[var(--color-accent)]/40 text-[var(--color-accent)]'
                    : 'border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#111827]'}`}
              >
                {n}
              </button>
            )
          })}
        </div>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={availData} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              stroke={text}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${Math.round(v / 60)}m`}
              label={{
                value: 'Simulated time',
                position: 'insideBottom',
                offset: -2,
                fill: text,
                fontSize: 10,
              }}
            />
            <YAxis
              stroke={text}
              tick={{ fontSize: 10 }}
              label={{
                value: 'drones',
                angle: -90,
                position: 'insideLeft',
                fill: text,
                fontSize: 10,
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, color: text }} />
            {policies.map((p) => (
              <Line
                key={p}
                type="monotone"
                dataKey={p}
                name={POLICIES[p]?.label ?? p}
                stroke={POLICIES[p]?.color ?? '#fff'}
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── Missed/delayed detections ──────────────────── */}
      <ChartCard
        title="Missed detections vs fleet size"
        subtitle="Accidents not detected within the maximum window, expressed as a percentage of all accidents in the trial."
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={missedData} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="N"
              stroke={text}
              tick={{ fontSize: 10 }}
              label={{
                value: 'Number of drones',
                position: 'insideBottom',
                offset: -2,
                fill: text,
                fontSize: 10,
              }}
            />
            <YAxis
              stroke={text}
              tick={{ fontSize: 10 }}
              label={{
                value: '% missed',
                angle: -90,
                position: 'insideLeft',
                fill: text,
                fontSize: 10,
              }}
            />
            <Tooltip content={<CustomTooltip xLabel="N" unit="%" />} />
            <Legend wrapperStyle={{ fontSize: 10, color: text }} />
            {policies.map((p) => (
              <Bar
                key={p}
                dataKey={`${p}_missedPct`}
                name={POLICIES[p]?.label ?? p}
                fill={POLICIES[p]?.color ?? '#fff'}
                opacity={0.85}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
