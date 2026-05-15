import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from 'recharts'
import { POLICIES } from '../lib/policies'

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

function CustomTooltip({ active, payload, label, unit, decimals = 1 }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-[var(--color-txt2)] mb-1">N = {label} drones</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[var(--color-txt2)]">{p.name}:</span>
          <span className="font-bold font-mono" style={{ color: p.color }}>
            {typeof p.value === 'number' ? p.value.toFixed(decimals) : '—'}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Combine the per-policy result arrays into a single dataset keyed by N.
 *   [{ N, uniform_avg, riskAware_avg, uniform_p, riskAware_p, ΔT, ... }]
 *
 * ΔT(M) = T̄_alert (uniform) − T̄_alert (risk-aware)  (per §14 of the
 * simplified-model report). Positive means risk-aware is faster.
 */
function joinByN(results) {
  const byN = new Map()
  for (const [policy, pts] of Object.entries(results)) {
    for (const p of pts) {
      if (!byN.has(p.N)) byN.set(p.N, { N: p.N })
      const row = byN.get(p.N)
      row[`${policy}_avg`] = p.avgDetectionTime
      row[`${policy}_p`] = p.pUnder2Min * 100
      row[`${policy}_missed`] = p.nMissed
      row[`${policy}_total`] = p.nTotal
      row[`${policy}_rate`] = p.detectionRate * 100
    }
  }
  const rows = [...byN.values()].sort((a, b) => a.N - b.N)
  // ΔT(M) per fleet size — only meaningful when both policies have a
  // detection-time value for this N.
  for (const row of rows) {
    if (row.uniform_avg != null && row.riskAware_avg != null) {
      row.deltaT = row.uniform_avg - row.riskAware_avg
    } else {
      row.deltaT = null
    }
  }
  return rows
}

export default function PolicyResultsPlots({ results }) {
  const data = joinByN(results)
  if (data.length === 0) {
    return (
      <div className="text-[11px] text-[var(--color-txt2)] p-6 text-center">
        Run a sweep to see results.
      </div>
    )
  }

  const policies = Object.keys(results)
  const hasBothPolicies = policies.includes('uniform') && policies.includes('riskAware')
  const deltaData = hasBothPolicies ? data.filter((d) => d.deltaT != null) : []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── Average detection time ─────────────────────── */}
      <ChartCard
        title="Mean detection time T̄_alert vs fleet size M"
        subtitle="Lower is better. T̄ = (1/K) Σ T_alert,k from the closed-form IoT 5-case formula (§11), min over candidates {m−1, m, m+1}."
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
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
                value: 'seconds',
                angle: -90,
                position: 'insideLeft',
                fill: text,
                fontSize: 10,
              }}
            />
            <Tooltip content={<CustomTooltip unit="s" />} />
            <Legend wrapperStyle={{ fontSize: 10, color: text }} />
            <ReferenceLine y={120} stroke="#a855f7" strokeDasharray="4 4" label={{ value: '2 min', fontSize: 9, fill: '#a855f7', position: 'right' }} />
            {policies.map((p) => (
              <Line
                key={p}
                type="monotone"
                dataKey={`${p}_avg`}
                name={POLICIES[p]?.label ?? p}
                stroke={POLICIES[p]?.color ?? '#fff'}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── P(detection < 2 min) ───────────────────────── */}
      <ChartCard
        title="P(T_alert &lt; 2 min) vs fleet size M"
        subtitle="Higher is better. Fraction of all accidents whose IoT alert reaches a candidate UAV within 120 s."
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
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
              domain={[0, 100]}
              label={{
                value: '% of accidents',
                angle: -90,
                position: 'insideLeft',
                fill: text,
                fontSize: 10,
              }}
            />
            <Tooltip content={<CustomTooltip unit="%" />} />
            <Legend wrapperStyle={{ fontSize: 10, color: text }} />
            {policies.map((p) => (
              <Line
                key={p}
                type="monotone"
                dataKey={`${p}_p`}
                name={POLICIES[p]?.label ?? p}
                stroke={POLICIES[p]?.color ?? '#fff'}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── ΔT(M) improvement (risk-aware over uniform) ───── */}
      {hasBothPolicies && deltaData.length > 0 && (
        <div className="lg:col-span-2">
          <ChartCard
            title="ΔT(M) = T̄_uniform − T̄_risk-aware  (improvement of risk-aware patrol)"
            subtitle="Positive bars: risk-aware is faster than uniform at that fleet size. Negative: uniform wins. Both policies are evaluated on the SAME accident events per (trial, N), so the difference is attributable to patrol segmentation alone (§14)."
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={deltaData} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="N"
                  stroke={text}
                  tick={{ fontSize: 10 }}
                  label={{
                    value: 'Number of UAVs M',
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
                    value: 'ΔT (s)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: text,
                    fontSize: 10,
                  }}
                />
                <Tooltip content={<CustomTooltip unit="s" />} />
                <Legend wrapperStyle={{ fontSize: 10, color: text }} />
                <ReferenceLine y={0} stroke={text} />
                <Bar dataKey="deltaT" name="ΔT(M)">
                  {deltaData.map((row, i) => (
                    <Cell
                      key={`bar-${i}`}
                      fill={
                        row.deltaT == null ? '#64748b'
                        : row.deltaT > 0 ? POLICIES.riskAware.color
                        : POLICIES.uniform.color
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  )
}
