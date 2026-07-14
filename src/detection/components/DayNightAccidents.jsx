import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
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
    rows.push({ region, hour })
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
    tick: { fontSize: 10, angle: -25, textAnchor: 'end' },
    interval: 0,
    height: 55,
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
  const regions = useMemo(() => aggregateByRegion(parseRows(csvRaw)), [])

  const totals = useMemo(() => {
    const day = regions.reduce((s, r) => s + r.day, 0)
    const night = regions.reduce((s, r) => s + r.night, 0)
    return { day, night, all: day + night }
  }, [regions])

  const pct = (n) => totals.all > 0 ? `${((n / totals.all) * 100).toFixed(1)}%` : '—'

  return (
    <div className="space-y-4">

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Total accidents" value={totals.all} sub={`${regions.length} regions · 2016–2017`} />
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

      {/* ── Total accidents per region (stacked day + night) ── */}
      <ChartCard
        title="Total accidents per region"
        description="Full-day totals per region; each bar stacks the day and night contributions."
        onExport={() => downloadCSV(regions)}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={regions} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis {...AXIS_PROPS.x} />
            <YAxis {...AXIS_PROPS.y} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100,116,139,0.08)' }} />
            <Legend verticalAlign="top" align="right" iconSize={9} wrapperStyle={{ fontSize: 10, color: textColor, paddingBottom: 6 }} />
            <Bar dataKey="day" name="Day (08:00–17:00)" stackId="dn" fill={DAY_COLOR} fillOpacity={0.85} maxBarSize={44} isAnimationActive={false} />
            <Bar dataKey="night" name="Night (17:00–08:00)" stackId="dn" fill={NIGHT_COLOR} fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={44} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

    </div>
  )
}
