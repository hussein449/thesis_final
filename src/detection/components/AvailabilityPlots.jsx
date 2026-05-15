import { useMemo, useState } from 'react'
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
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { POLICIES } from '../lib/policies'
import { simulateBatteryTrace } from '../lib/detection-sim'
import { allocateDrones } from '../../partitioning/lib/roads'

const grid = '#1e293b'
const text = '#64748b'

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
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

function CustomTooltip({ active, payload, label, xLabel = 't (s)', decimals = 1, unit = '', formatLabel }) {
  if (!active || !payload?.length) return null
  const displayLabel = formatLabel ? formatLabel(label) : label
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-[var(--color-txt2)] mb-1">{xLabel}: {displayLabel}</div>
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
 * Pick the right time unit for the X-axis based on the trial duration.
 * 30-day trials make a "minutes" axis useless (43,200 minutes); 30-min
 * trials make a "days" axis useless. Returns { label, fmt } where fmt
 * takes seconds and returns a short string.
 */
function pickTimeAxis(maxSeconds) {
  if (maxSeconds <= 4 * 3600) {
    return { label: 'min', fmt: (v) => `${Math.round(v / 60)}m` }
  }
  if (maxSeconds <= 4 * 86400) {
    return { label: 'h', fmt: (v) => `${Math.round(v / 3600)}h` }
  }
  return { label: 'd', fmt: (v) => `${(v / 86400).toFixed(1)}d` }
}

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
      byN.get(pt.N)[`${p}_missedPct`] =
        pt.nTotal > 0 ? (pt.nMissed / pt.nTotal) * 100 : 0
    }
  }
  return [...byN.values()].sort((a, b) => a.N - b.N)
}

// ─── Battery Evolution Chart ──────────────────────────────────────────────────
const BATTERY_FLEET_OPTIONS = [5, 10, 20]

// Battery-cycle visualisation: only a few cycles needed to see the
// drain/dock/charge pattern. Capped at 4 simulated hours so the chart
// is dense and the trial finishes instantly, regardless of what the
// global DEFAULT_PARAMS.totalTime is set to (30 days for sweeps).
const BATTERY_TRACE_HOURS = 4

function BatteryEvolutionChart({ params }) {
  const [fleetN, setFleetN] = useState(10)

  // Pass the user's config params through (drain rate, low/ready
  // thresholds, dock transit / charge time, drone speed) so changes to
  // any of them re-render this chart. The 4-hour window is the only
  // hard override — long enough to see several cycles, short enough to
  // run instantly regardless of Configure's totalTime.
  const paramsKey = JSON.stringify(params ?? {})
  const traces = useMemo(() => {
    const allocation = allocateDrones(fleetN)
    return simulateBatteryTrace({
      allocation,
      params: { ...(params ?? {}), totalTime: BATTERY_TRACE_HOURS * 3600 },
      seed: 42,
      sampleInterval: 60,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetN, paramsKey])

  const data = useMemo(() => {
    if (!traces.length) return []
    return traces[0].samples.map((s, i) => {
      const row = { t: Math.round(s.t * 10) / 10 }
      traces.forEach(tr => { row[tr.id] = Math.round(tr.samples[i].battery * 10) / 10 })
      return row
    })
  }, [traces])

  return (
    <ChartCard
      title="Battery evolution over time — per drone"
      subtitle={`One deterministic trial (seed 42), fleet N = ${fleetN}. Each line is one drone. Red dashed = dock threshold (25 %). Green dashed = redeploy threshold (80 %).`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[9px] text-[var(--color-txt3)] uppercase tracking-wider">Fleet N =</span>
        {BATTERY_FLEET_OPTIONS.map(n => (
          <button
            key={n}
            onClick={() => setFleetN(n)}
            className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors cursor-pointer
              ${n === fleetN
                ? 'bg-[var(--color-accent)]/20 border-[var(--color-accent)]/40 text-[var(--color-accent)]'
                : 'border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[var(--color-card)]'}`}
          >
            {n}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            stroke={text}
            tick={{ fontSize: 10 }}
            tickFormatter={v => `${v.toFixed(0)}m`}
            label={{ value: 'Simulation time (min)', position: 'insideBottom', offset: -10, fill: text, fontSize: 10 }}
          />
          <YAxis
            domain={[0, 100]}
            stroke={text}
            tick={{ fontSize: 10 }}
            tickFormatter={v => `${v}%`}
            label={{ value: 'Battery %', angle: -90, position: 'insideLeft', fill: text, fontSize: 10 }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl max-h-48 overflow-y-auto">
                  <div className="text-[10px] text-[var(--color-txt2)] mb-1">t = {label}m</div>
                  {payload.slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                      <span className="text-[var(--color-txt3)] truncate max-w-[90px]">{p.name}:</span>
                      <span className="font-bold font-mono" style={{ color: p.color }}>{p.value?.toFixed(1)}%</span>
                    </div>
                  ))}
                  {payload.length > 8 && (
                    <div className="text-[9px] text-[var(--color-txt3)] mt-1">+{payload.length - 8} more…</div>
                  )}
                </div>
              )
            }}
          />
          <ReferenceLine y={25} stroke="#ef4444" strokeDasharray="5 3" strokeWidth={1.5}
            label={{ value: 'Dock ≤25%', position: 'insideTopRight', fill: '#ef4444', fontSize: 9 }} />
          <ReferenceLine y={80} stroke="#10b981" strokeDasharray="5 3" strokeWidth={1.5}
            label={{ value: 'Redeploy ≥80%', position: 'insideBottomRight', fill: '#10b981', fontSize: 9 }} />
          {traces.map(tr => (
            <Line
              key={tr.id}
              type="monotone"
              dataKey={tr.id}
              name={tr.label}
              stroke={tr.color}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {traces.map(tr => (
          <div key={tr.id} className="flex items-center gap-1.5 text-[9.5px]">
            <span className="w-5 h-0.5 rounded-full shrink-0" style={{ background: tr.color }} />
            <span className="text-[var(--color-txt2)]">{tr.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[9px] text-[var(--color-txt3)] leading-relaxed">
        Model: B(t+Δt) = B(t) − r<sub>s</sub>·Δt while patrolling; B(t+Δt) = B(t) + r<sub>c</sub>·Δt while docked.
        Drain rate r<sub>s</sub> = 100/1500 %/s (≈25 min endurance). Charge rate r<sub>c</sub> = 100/240 %/s (4 min to full).
        Initial batteries staggered 40–95% to avoid simultaneous docking.
      </p>
    </ChartCard>
  )
}

export default function AvailabilityPlots({
  results,
  availabilityByPolicy,
  selectedN,
  onSelectN,
  params,
}) {
  const policies = Object.keys(availabilityByPolicy ?? {})
  const droneCounts = (results?.[policies[0]] ?? []).map((p) => p.N)

  const availData = buildAvailabilityData(availabilityByPolicy ?? {}, selectedN)
  const missedData = buildMissedData(results ?? {})
  const maxT = availData.length > 0 ? availData[availData.length - 1].t : 3600
  const timeAxis = pickTimeAxis(maxT)

  return (
    <div className="space-y-4">
      <BatteryEvolutionChart params={params} />

      {policies.length === 0 ? (
        <div className="text-[11px] text-[var(--color-txt2)] p-6 text-center rounded-xl border border-[var(--color-border)]">
          Run a sweep above to see availability &amp; missed-detection charts.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                        : 'border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[var(--color-card)]'}`}
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
                  tickFormatter={timeAxis.fmt}
                  label={{
                    value: `Simulated time (${timeAxis.label})`,
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
                <Tooltip content={<CustomTooltip xLabel={`t (${timeAxis.label})`} formatLabel={timeAxis.fmt} />} />
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
      )}
    </div>
  )
}
