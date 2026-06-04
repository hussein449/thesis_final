import { useMemo, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  simulateBatteryDocking,
  sweepReserveRatios,
  DEFAULT_PARAMS,
  DEFAULT_RHO_LIST,
  CORRIDOR,
} from '../lib/batteryDocking'
import { POLICIES } from '../lib/policies'

// ── Styling tokens (mirror DetectionCDFPlots) ────────────────────────────────
const grid = '#1e293b'
const textColor = '#64748b'

// Use the same colors as the rest of the detection app.
const UNIFORM_COLOR = POLICIES.uniform.color      // #1D4ED8
const RISKAWARE_COLOR = POLICIES.riskAware.color  // #f97316

const MODES = [
  { key: 'uniform',    label: 'Uniform',    color: UNIFORM_COLOR },
  { key: 'risk-aware', label: 'Risk-aware', color: RISKAWARE_COLOR },
]

const M_CHOICES = [3, 5, 8, 10, 15, 20]

// ── CSV helpers ─────────────────────────────────────────────────────────────
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

// ── Reshape sweep rows into one row per ρ with both modes as columns ─────────
function pivotByRho(sweep, metricKey) {
  const byRho = new Map()
  for (const row of sweep) {
    if (!byRho.has(row.rho)) byRho.set(row.rho, { rho: row.rho })
    const key = row.mode === 'risk-aware' ? 'riskAware' : row.mode
    byRho.get(row.rho)[key] = +row[metricKey].toFixed(3)
  }
  return [...byRho.values()].sort((a, b) => a.rho - b.rho)
}

function CustomTooltip({ active, payload, label, xLabel = 'ρ', yUnit = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-[var(--color-txt2)] mb-1">
        {xLabel} = {label}
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

// ── Reusable sweep chart card (single top-level card, like the CDF page) ────
function SweepCard({ title, description, data, yLabel, yUnit = '%', onExport }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
            {title}
          </div>
          <div className="text-[9.5px] text-[var(--color-txt3)] mt-0.5 leading-relaxed">
            {description}
          </div>
        </div>
        {onExport && <ExportCSVButton onClick={onExport} disabled={!data?.length} />}
      </div>

      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 26 }}>
          <defs>
            <linearGradient id="faGradUniform" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={UNIFORM_COLOR} stopOpacity={0.18} />
              <stop offset="95%" stopColor={UNIFORM_COLOR} stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="faGradRiskAware" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={RISKAWARE_COLOR} stopOpacity={0.18} />
              <stop offset="95%" stopColor={RISKAWARE_COLOR} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="rho"
            stroke={textColor}
            tick={{ fontSize: 10 }}
            label={{ value: 'Reserve ratio ρ', position: 'insideBottom', offset: -10, fill: textColor, fontSize: 10 }}
          />
          <YAxis
            stroke={textColor}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${v}${yUnit}`}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: textColor, fontSize: 10 }}
          />
          <Tooltip content={<CustomTooltip yUnit={yUnit} />} />
          <Legend verticalAlign="top" align="right" iconSize={9} wrapperStyle={{ fontSize: 10, color: textColor, paddingBottom: 6 }} />
          <Area
            type="monotone"
            dataKey="uniform"
            name="Uniform"
            stroke={UNIFORM_COLOR}
            fill="url(#faGradUniform)"
            strokeWidth={2}
            dot={{ r: 3, fill: UNIFORM_COLOR }}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="riskAware"
            name="Risk-aware"
            stroke={RISKAWARE_COLOR}
            fill="url(#faGradRiskAware)"
            strokeWidth={2}
            dot={{ r: 3, fill: RISKAWARE_COLOR }}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Inline pill-group selector (no nested cards) ─────────────────────────────
function PillGroup({ label, options, value, onChange, activeColor }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-[var(--color-txt3)] uppercase tracking-wider font-semibold mr-1">
        {label}
      </span>
      {options.map((opt) => {
        const active = opt.value === value
        const color = opt.color ?? activeColor ?? '#1D4ED8'
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className="px-2.5 py-1 text-[10.5px] font-semibold rounded-md border transition-colors cursor-pointer"
            style={active
              ? { background: color + '20', borderColor: color + '66', color }
              : { borderColor: 'var(--color-border2)', color: 'var(--color-txt2)' }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function FleetAvailabilityPlots() {
  const [M, setM] = useState(10)
  const [rho, setRho] = useState(0.2)
  const [mode, setMode] = useState('risk-aware')

  // Full ρ sweep for both modes (fast — deterministic)
  const sweep = useMemo(() => sweepReserveRatios({ M }), [M])

  // Detailed single-run for the per-segment view
  const detail = useMemo(
    () => simulateBatteryDocking({ M, rho, mode }),
    [M, rho, mode]
  )

  const uavgData = useMemo(() => pivotByRho(sweep, 'Uavg'), [sweep])
  const umaxData = useMemo(() => pivotByRho(sweep, 'Umax'), [sweep])
  const pfailData = useMemo(() => pivotByRho(sweep, 'Pfail'), [sweep])
  const pnoresData = useMemo(() => pivotByRho(sweep, 'PnoReserve'), [sweep])

  // Per-segment U bar data
  const segData = detail.segments.map((s) => ({
    segment: `S${s.index}`,
    U: +s.U.toFixed(3),
  }))

  const activeColor = mode === 'risk-aware' ? RISKAWARE_COLOR : UNIFORM_COLOR

  function exportFullSweep() {
    downloadCSV(
      sweep.map((r) => ({
        M,
        rho: r.rho,
        mode: r.mode,
        N_reserve: r.N_reserve,
        Uavg_pct: +r.Uavg.toFixed(3),
        Umax_pct: +r.Umax.toFixed(3),
        Pfail_pct: +r.Pfail.toFixed(2),
        PnoReserve_pct: +r.PnoReserve.toFixed(2),
        avgReserves: +r.avgReserves.toFixed(2),
        replacements: r.replacements,
      })),
      `fleet-availability_sweep_M${M}.csv`
    )
  }

  function exportSegments() {
    downloadCSV(
      detail.segments.map((s) => ({
        segment: s.index,
        A_m: +s.A.toFixed(1),
        B_m: +s.B.toFixed(1),
        center_km: +s.sCenterKm.toFixed(3),
        dDock_km: +s.dDockKm.toFixed(3),
        Ttravel_min: +s.Ttravel.toFixed(3),
        Bcrit_pct: +s.Bcrit.toFixed(3),
        Bmin_pct: +s.Bmin.toFixed(3),
        U_pct: +s.U.toFixed(3),
      })),
      `fleet-availability_segments_M${M}_rho${rho}_${mode}.csv`
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header / intro / parameter selectors ── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">
          Fleet availability — event-based battery & docking
        </div>
        <div className="text-[11px] text-[var(--color-txt3)] leading-relaxed max-w-3xl">
          <span className="text-[var(--color-txt2)] font-semibold">What this tab answers:</span>{' '}
          given M patrol segments, one shared dock at the corridor midpoint, and a reserve
          pool of size <span className="font-mono">⌈ρ·M⌉</span>, how often is each segment
          left uncovered over a 24 h day? Deterministic event-based model — no accidents,
          no Monte-Carlo noise. Far segments use{' '}
          <span className="font-mono">B<sub>crit,m</sub> = r<sub>fly</sub>·T<sub>travel,m</sub> + B<sub>safety</sub></span>
          {' '}and request replacement at{' '}
          <span className="font-mono">B<sub>min,m</sub> = B<sub>crit,m</sub> + r<sub>fly</sub>·T<sub>travel,m</sub></span>
          {' '}(PDF §8).
        </div>

        {/* Inline parameter selectors (no nested cards) */}
        <div className="mt-4 space-y-2.5">
          <PillGroup
            label="Fleet size M"
            value={M}
            onChange={setM}
            options={M_CHOICES.map((n) => ({ value: n, label: String(n) }))}
            activeColor={UNIFORM_COLOR}
          />
          <PillGroup
            label="Reserve ratio ρ"
            value={rho}
            onChange={setRho}
            options={DEFAULT_RHO_LIST.map((r) => ({ value: r, label: String(r) }))}
            activeColor={activeColor}
          />
          <PillGroup
            label="Segmentation"
            value={mode}
            onChange={setMode}
            options={MODES.map((m) => ({ value: m.key, label: m.label, color: m.color }))}
          />
        </div>

        {/* PDF parameter readout */}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[9.5px] text-[var(--color-txt3)] font-mono">
          <span>L = <span className="text-[var(--color-txt2)]">{CORRIDOR.lengthKm.toFixed(1)} km</span></span>
          <span>s<sub>dock</sub> = <span className="text-[var(--color-txt2)]">{CORRIDOR.dockKm.toFixed(2)} km</span></span>
          <span>v = <span className="text-[var(--color-txt2)]">{DEFAULT_PARAMS.v.toFixed(2)} km/min</span></span>
          <span>r<sub>fly</sub> = <span className="text-[var(--color-txt2)]">{DEFAULT_PARAMS.r_fly} %/min</span></span>
          <span>r<sub>charge</sub> = <span className="text-[var(--color-txt2)]">{DEFAULT_PARAMS.r_charge} %/min</span></span>
          <span>B<sub>safety</sub> = <span className="text-[var(--color-txt2)]">{DEFAULT_PARAMS.B_safety} %</span></span>
          <span>B<sub>ready</sub> = <span className="text-[var(--color-txt2)]">{DEFAULT_PARAMS.B_ready} %</span></span>
          <span>T<sub>sim</sub> = <span className="text-[var(--color-txt2)]">{DEFAULT_PARAMS.T_sim} min</span></span>
        </div>
      </div>

      {/* ── Sweep charts — 4 separate top-level cards in a grid ── */}
      <SweepCard
        title={<>U<sub>avg</sub> — average uncovered fraction vs ρ <span className="ml-2 text-[var(--color-txt3)] normal-case tracking-normal font-normal">M = {M}</span></>}
        description="Average percentage of day each segment is uncovered. Lower is better. Curves shifted down mean more reliable coverage."
        data={uavgData}
        yLabel="U_avg (%)"
        onExport={exportFullSweep}
      />

      <SweepCard
        title={<>U<sub>max</sub> — worst-segment uncovered fraction vs ρ <span className="ml-2 text-[var(--color-txt3)] normal-case tracking-normal font-normal">M = {M}</span></>}
        description="The most-exposed segment in the fleet. This is the SLA-relevant figure."
        data={umaxData}
        yLabel="U_max (%)"
      />

      <SweepCard
        title={<>P<sub>fail</sub> — failed replacement requests vs ρ <span className="ml-2 text-[var(--color-txt3)] normal-case tracking-normal font-normal">M = {M}</span></>}
        description="Share of replacement requests with no reserve available. Goes to zero only when the charging pipeline keeps up with demand."
        data={pfailData}
        yLabel="P_fail (%)"
      />

      <SweepCard
        title={<>P<sub>no reserve</sub> — time with empty reserve pool vs ρ <span className="ml-2 text-[var(--color-txt3)] normal-case tracking-normal font-normal">M = {M}</span></>}
        description="Percentage of simulated day with zero reserves on standby. Indicates pipeline saturation."
        data={pnoresData}
        yLabel="P_no_reserve (%)"
      />

      {/* ── Per-segment bar chart (also a single top-level card) ── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
              Per-segment uncovered % — U<sub>m</sub>
              <span className="ml-2 text-[var(--color-txt3)] normal-case tracking-normal font-normal">
                M = {M}, ρ = {rho}, {mode === 'risk-aware' ? 'risk-aware' : 'uniform'}
              </span>
            </div>
            <div className="text-[9.5px] text-[var(--color-txt3)] mt-0.5 leading-relaxed">
              How uncovered time is distributed across the M segments. Segments far from the dock
              typically dominate because they take longer to swap and need a higher B<sub>min</sub>.
            </div>
          </div>
          <ExportCSVButton onClick={exportSegments} disabled={!segData.length} />
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={segData} margin={{ top: 10, right: 20, left: 0, bottom: 26 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="segment"
              stroke={textColor}
              tick={{ fontSize: 10 }}
              label={{ value: 'Segment', position: 'insideBottom', offset: -10, fill: textColor, fontSize: 10 }}
            />
            <YAxis
              stroke={textColor}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${v}%`}
              label={{ value: 'Uncovered %', angle: -90, position: 'insideLeft', fill: textColor, fontSize: 10 }}
            />
            <Tooltip content={<CustomTooltip xLabel="segment" yUnit="%" />} />
            <Bar dataKey="U" name="U_m" fill={activeColor} opacity={0.85} />
          </BarChart>
        </ResponsiveContainer>

        {/* Headline numbers — inline pills, no nested cards */}
        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          <Stat label="U_avg" value={`${detail.metrics.Uavg.toFixed(2)}%`} />
          <Stat label="U_max" value={`${detail.metrics.Umax.toFixed(2)}%`} />
          <Stat label="P_fail" value={`${detail.metrics.Pfail.toFixed(1)}%`} />
          <Stat label="P_no_reserve" value={`${detail.metrics.PnoReserve.toFixed(1)}%`} />
          <Stat label="Replacements/day" value={`${detail.metrics.replacements}`} />
          <Stat label="Avg reserves" value={detail.metrics.avgReserves.toFixed(2)} />
          <Stat label="N reserves" value={detail.N_reserve} />
          <Stat label="M segments" value={detail.M} />
        </div>
      </div>

      {/* ── Interpretation ── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-3">
        <div className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
          <span className="text-[var(--color-txt2)] font-semibold">Reading the curves: </span>
          U<sub>avg</sub> and U<sub>max</sub> fall as ρ grows — more reserves means more
          replacements arrive in time. P<sub>fail</sub> drops once ρ is large enough that the
          charging pipeline replenishes before the next request. Uniform vs. Risk-aware diverge
          because risk-aware places segment centres differently relative to the mid-corridor dock,
          changing T<sub>travel,m</sub> and therefore B<sub>min,m</sub>. The model is analytical
          and deterministic — same ρ always gives the same numbers.
        </div>
      </div>
    </div>
  )
}

// ── Stat pill (flat, no nested card) ─────────────────────────────────────────
function Stat({ label, value }) {
  return (
    <div className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-md border border-[var(--color-border2)]">
      <span className="text-[8.5px] text-[var(--color-txt3)] uppercase tracking-wider">{label}</span>
      <span className="font-mono font-bold text-[11px] text-[var(--color-txt2)]">{value}</span>
    </div>
  )
}
