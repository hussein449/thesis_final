import { useMemo } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import csvRaw from '../data/day_night_accidents.csv?raw'

// ── Styling tokens (mirror FleetAvailabilityPlots / DetectionCDFPlots) ───────
const grid = '#1e293b'
const textColor = '#64748b'

const DAY_COLOR = '#f97316'   // matches risk-aware orange
const NIGHT_COLOR = '#1D4ED8' // matches uniform blue

// Day window: 08:00 (inclusive) → 17:00 (exclusive). Night is everything else.
const DAY_START = 8
const DAY_END = 17

// ── CSV parsing & aggregation ────────────────────────────────────────────────
// Dataset columns: Timestamp, Emergency City, Source File, Accidents in Region.
// Each row is one recorded accident; hour comes from the timestamp.
function parseRows(raw) {
  const lines = raw.trim().split(/\r?\n/)
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',')
    if (parts.length < 4) continue
    const timestamp = parts[0]
    const region = parts[1]
    const hour = parseInt(timestamp.split(' ')[1], 10)
    if (!region || !Number.isFinite(hour)) continue
    rows.push({ region, hour, year: timestamp.slice(0, 4) })
  }
  return rows
}

function aggregateByRegion(rows) {
  const byRegion = new Map()
  for (const { region, hour } of rows) {
    if (!byRegion.has(region)) byRegion.set(region, { region, day: 0, night: 0 })
    const bucket = byRegion.get(region)
    if (hour >= DAY_START && hour < DAY_END) bucket.day++
    else bucket.night++
  }
  return [...byRegion.values()]
    .map((r) => ({ ...r, total: r.day + r.night }))
    .sort((a, b) => b.total - a.total)
}

// ── CSV export ───────────────────────────────────────────────────────────────
function downloadCSV(regions) {
  const lines = [
    'region,day_accidents,night_accidents,total_accidents',
    ...regions.map((r) => `${r.region},${r.day},${r.night},${r.total}`),
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'day_night_accidents_by_region.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function ExportCSVButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 text-[9.5px] font-bold rounded-md border transition-colors shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 cursor-pointer"
    >
      ⬇ Export CSV
    </button>
  )
}

// ── Tooltip (same card style as the other detection plots) ──────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-[var(--color-txt2)] mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          <span className="text-[var(--color-txt2)]">{p.name}:</span>
          <span className="font-bold font-mono" style={{ color: p.color ?? p.fill }}>
            {p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Reusable chart card ──────────────────────────────────────────────────────
function ChartCard({ title, description, onExport, children }) {
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
        {onExport && <ExportCSVButton onClick={onExport} />}
      </div>
      {children}
    </div>
  )
}

const AXIS_PROPS = {
  x: {
    dataKey: 'region',
    stroke: textColor,
    tick: { fontSize: 10 },
    interval: 0,
  },
  y: {
    stroke: textColor,
    tick: { fontSize: 10 },
    label: { value: 'Accidents', angle: -90, position: 'insideLeft', fill: textColor, fontSize: 10 },
  },
}

function RegionBarChart({ data, dataKey, name, color }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" />
        <XAxis {...AXIS_PROPS.x} />
        <YAxis {...AXIS_PROPS.y} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100,116,139,0.08)' }} />
        <Bar dataKey={dataKey} name={name} fill={color} fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={44} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({ label, value, sub, color }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
      <div className="text-[9px] text-[var(--color-txt3)] uppercase tracking-[0.16em] font-semibold">
        {label}
      </div>
      <div className="text-[20px] font-bold font-mono mt-1 leading-none" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[9.5px] text-[var(--color-txt3)] mt-1.5">{sub}</div>}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function DayNightAccidents() {
  const rows = useMemo(() => parseRows(csvRaw), [])
  const regions = useMemo(() => aggregateByRegion(rows), [rows])

  const totals = useMemo(() => {
    const day = regions.reduce((s, r) => s + r.day, 0)
    const night = regions.reduce((s, r) => s + r.night, 0)
    return { day, night, all: day + night }
  }, [regions])

  const yearCounts = useMemo(() => {
    const byYear = {}
    for (const { year } of rows) byYear[year] = (byYear[year] || 0) + 1
    return Object.entries(byYear).sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

  const pct = (n) => totals.all > 0 ? `${((n / totals.all) * 100).toFixed(1)}%` : '—'

  return (
    <div className="space-y-4">

      {/* ── About the data (mirrors the SensitivityPlots header card) ── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">
          About the data — regional accident records
        </div>
        <div className="mb-2 inline-flex items-center gap-2 px-2 py-0.5 rounded-md bg-amber-700/10 ring-1 ring-amber-700/30 text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
          {totals.all.toLocaleString()} records · 2016 – Jul 2018
        </div>
        <div className="text-[11px] text-[var(--color-txt3)] leading-relaxed max-w-3xl">
          <span className="text-[var(--color-txt2)] font-semibold">Where it comes from:</span>{' '}
          emergency accident reports compiled from yearly log files (2016, 2017, and a
          Beirut &amp; South file covering 2018), filtered to the {regions.length} regions along the
          M51 Khalde → Awali corridor. Each record is one reported accident with its
          timestamp and emergency region.
          <br />
          <span className="text-[var(--color-txt2)] font-semibold">Coverage:</span>{' '}
          2016 and 2017 are full years; 2018 covers January – July only.
          Day is defined as <span className="text-[var(--color-txt2)] font-semibold">08:00 – 17:00</span>;
          everything else counts as night.
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-[var(--color-txt3)]">
          {yearCounts.map(([year, count]) => (
            <div key={year} className="flex items-center gap-1.5">
              <span className="font-semibold text-[var(--color-txt2)]">{year}:</span>
              <span className="font-mono">{count} accidents</span>
              {year === '2018' && <span className="text-amber-700/70">(Jan – Jul)</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Total accidents" value={totals.all} sub={`${regions.length} regions · 2016 – Jul 2018`} />
        <StatTile label="Day (08:00–17:00)" value={totals.day} sub={`${pct(totals.day)} of all accidents`} color={DAY_COLOR} />
        <StatTile label="Night (17:00–08:00)" value={totals.night} sub={`${pct(totals.night)} of all accidents`} color={NIGHT_COLOR} />
        <StatTile
          label="Night / day ratio"
          value={totals.day > 0 ? (totals.night / totals.day).toFixed(2) : '—'}
          sub="Accidents skew toward night hours"
        />
      </div>

      {/* ── Graph 1: day accidents per region ── */}
      <ChartCard
        title="Day accidents per region"
        description="Accidents recorded between 08:00 and 17:00, per emergency region (M51 corridor dataset)."
      >
        <RegionBarChart data={regions} dataKey="day" name="Day (08:00–17:00)" color={DAY_COLOR} />
      </ChartCard>

      {/* ── Graph 2: night accidents per region ── */}
      <ChartCard
        title="Night accidents per region"
        description="Accidents recorded between 17:00 and 08:00, per emergency region."
      >
        <RegionBarChart data={regions} dataKey="night" name="Night (17:00–08:00)" color={NIGHT_COLOR} />
      </ChartCard>

      {/* ── Day vs night totals (all regions combined) ── */}
      <ChartCard
        title="Day vs night — all regions"
        description="Total accidents across all regions: day (08:00–17:00) versus night (17:00–08:00)."
        onExport={() => downloadCSV(regions)}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={[
              { label: 'Day (8am–5pm)', value: totals.day, color: DAY_COLOR },
              { label: 'Night (5pm–8am)', value: totals.night, color: NIGHT_COLOR },
            ]}
            margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={textColor} tick={{ fontSize: 10 }} interval={0} />
            <YAxis {...AXIS_PROPS.y} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100,116,139,0.08)' }} />
            <Bar dataKey="value" name="Accidents" fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={90} isAnimationActive={false}>
              <Cell fill={DAY_COLOR} />
              <Cell fill={NIGHT_COLOR} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

    </div>
  )
}
