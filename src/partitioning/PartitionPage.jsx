import { useState, useMemo } from 'react'
import { allocateDrones, computeRiskBreakdown } from './lib/roads'
import PartitionMap from './components/PartitionMap'
import StatsPanel from './components/StatsPanel'

// ─── Summary KPI strip ──────────────────────────────────────────────────────
function SummaryStrip({ allocations, droneCount }) {
  const totalScore = allocations.reduce((s, a) => s + a.score, 0)
  const unpatrolled = allocations.filter((a) => a.drones === 0).length
  const top = allocations[0]
  const concentrationTop3 = (() => {
    const sorted = allocations.slice().sort((a, b) => b.drones - a.drones)
    const top3 = sorted.slice(0, 3).reduce((s, a) => s + a.drones, 0)
    return droneCount === 0 ? 0 : (top3 / droneCount) * 100
  })()

  const kpis = [
    { label: 'Fleet',         value: droneCount,                         hint: 'drones distributed',   dot: '#cbd5e1' },
    { label: 'Roads',         value: allocations.length,                 hint: 'corridors scored',     dot: '#94a3b8' },
    { label: '∑ Risk score',  value: totalScore.toFixed(2),              hint: 'sum across all roads', dot: '#B45309' },
    { label: 'Top corridor',  value: `×${top.drones}`,                   hint: top.road.shortName,     dot: top.road.color },
    { label: 'Top-3 share',   value: `${concentrationTop3.toFixed(0)}%`, hint: 'fleet on busiest 3',   dot: '#1D4ED8' },
    { label: 'Unpatrolled',   value: unpatrolled,                        hint: unpatrolled === 0 ? 'full coverage' : 'gap exists', dot: unpatrolled === 0 ? '#047857' : '#f87171' },
  ]

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">Fleet KPIs</div>
        <div className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed mb-3">
          Key metrics for the current N = {droneCount} allocation using the Hamilton / Largest-Remainder method.
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl ring-1 ring-slate-600/80 bg-slate-700/40 px-3.5 py-2.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] font-semibold text-slate-500">
              <span className="w-1 h-1 rounded-full" style={{ background: k.dot }} />
              {k.label}
            </div>
            <div className="font-mono font-semibold text-[18px] leading-snug tabular-nums text-slate-100 mt-0.5">
              {k.value}
            </div>
            <div className="text-[9px] text-slate-500 leading-none">{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Formula card */}
      <div className="rounded-xl ring-1 ring-slate-600/70 bg-slate-700/40 px-4 py-3">
        <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1.5">Allocation rule</div>
        <div className="font-mono text-[11px] text-slate-200 leading-relaxed">
          drones<sub>i</sub> = round( N · R<sub>i</sub> / Σ R )
        </div>
        <div className="font-mono text-[11px] text-slate-200 leading-relaxed mt-1">
          μ<sub>i</sub> = 0.40·A + 0.25·T + 0.20·S + 0.15·C
        </div>
        <div className="font-mono text-[11px] text-slate-200 leading-relaxed mt-1">
          R<sub>i</sub> = 1 − e<sup>−μ<sub>i</sub></sup> &nbsp;(Poisson P[N≥1])
        </div>
        <div className="text-[9px] text-slate-500 mt-1.5">Hamilton largest-remainder</div>
      </div>
    </div>
  )
}

// ─── Risk score full table ────────────────────────────────────────────────────
function RiskScoreTable({ allocations }) {
  const maxScore = Math.max(...allocations.map(a => a.score))
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">Risk Score Breakdown</div>
        <div className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
          Full decomposition of the Poisson mean μ = 0.40·A + 0.25·T + 0.20·S + 0.15·C, with risk R = 1 − e<sup>−μ</sup> (probability of ≥1 accident). Normalised to [0,1].
        </div>
      </div>
      <div className="rounded-xl ring-1 ring-slate-600/80 bg-slate-700/40 px-5 py-4">
        <div className="overflow-x-auto">
          <table className="w-full text-[10.5px] font-mono">
            <thead>
              <tr className="text-[9px] text-slate-500 uppercase tracking-wider border-b border-slate-600">
                <th className="text-left py-2 pr-3">Corridor</th>
                <th className="text-right py-2 px-2">A norm.</th>
                <th className="text-right py-2 px-2">×0.40</th>
                <th className="text-right py-2 px-2">T norm.</th>
                <th className="text-right py-2 px-2">×0.25</th>
                <th className="text-right py-2 px-2">S norm.</th>
                <th className="text-right py-2 px-2">×0.20</th>
                <th className="text-right py-2 px-2">C norm.</th>
                <th className="text-right py-2 px-2">×0.15</th>
                <th className="text-right py-2 pl-2">R total</th>
                <th className="text-right py-2 pl-3">Drones</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map(({ road, score, drones }) => {
                const bd = computeRiskBreakdown(road)
                const [tA, tT, tS, tC] = bd.terms
                const barW = (score / maxScore) * 100
                return (
                  <tr key={road.id} className="border-b border-slate-600/50 hover:bg-slate-700/50/30">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: road.color }} />
                        <span className="text-slate-200">{road.shortName}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 px-2 text-slate-400">{tA.norm.toFixed(3)}</td>
                    <td className="text-right py-2 px-2 text-red-800">{tA.contrib.toFixed(3)}</td>
                    <td className="text-right py-2 px-2 text-slate-400">{tT.norm.toFixed(3)}</td>
                    <td className="text-right py-2 px-2 text-amber-700">{tT.contrib.toFixed(3)}</td>
                    <td className="text-right py-2 px-2 text-slate-400">{tS.norm.toFixed(3)}</td>
                    <td className="text-right py-2 px-2 text-blue-800">{tS.contrib.toFixed(3)}</td>
                    <td className="text-right py-2 px-2 text-slate-400">{tC.norm.toFixed(3)}</td>
                    <td className="text-right py-2 px-2 text-emerald-800">{tC.contrib.toFixed(3)}</td>
                    <td className="text-right py-2 pl-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-16 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${barW}%`, background: road.color }} />
                        </div>
                        <span className="font-bold tabular-nums" style={{ color: road.color }}>{score.toFixed(3)}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 pl-3 font-bold text-slate-200">{drones}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2 text-[9px]">
          {[
            { label: 'A — Accident history', color: 'text-red-800', note: 'accidents / 20 (ref)' },
            { label: 'T — Traffic intensity', color: 'text-amber-700', note: 'AADT / 50 000 (ref)' },
            { label: 'S — Speed contribution', color: 'text-blue-800', note: 'speed / 120 km/h (ref)' },
            { label: 'C — Pavement condition', color: 'text-emerald-800', note: '(5 − cond) / 4 · inverted' },
          ].map(({ label, color, note }) => (
            <div key={label} className="rounded-lg ring-1 ring-slate-800 bg-slate-700/40 px-2.5 py-2">
              <div className={`font-semibold ${color} mb-0.5`}>{label}</div>
              <div className="text-slate-500">{note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export { RiskScoreTable }

// ─── Multi-fleet allocation table ────────────────────────────────────────────
const FLEET_SIZES = [10, 20, 30, 50]

function MultiFleetTable() {
  const fleetAllocations = useMemo(
    () => FLEET_SIZES.map(n => ({ n, rows: allocateDrones(n) })),
    []
  )
  const roads = fleetAllocations[0].rows

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">Multi-fleet Allocation</div>
        <div className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
          Hamilton method for N = 10 / 20 / 30 / 50. Higher-risk corridors consistently receive the most drones.
          <span className="text-emerald-800 font-bold ml-1">+</span> = largest-remainder rounding.
        </div>
      </div>
      <div className="rounded-xl ring-1 ring-slate-600/80 bg-slate-700/40 px-5 py-4">
        <div className="overflow-x-auto">
          <table className="w-full text-[10.5px] font-mono">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2.5 pr-4 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Corridor</th>
                <th className="text-right py-2.5 px-3 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Risk R</th>
                <th className="text-right py-2.5 px-3 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Share</th>
                {FLEET_SIZES.map(n => (
                  <th key={n} className="text-center py-2.5 px-3 text-[9px] font-semibold uppercase tracking-wider text-blue-800">
                    N = {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roads.map(({ road, score, percentage }) => (
                <tr key={road.id} className="border-b border-slate-600/60 hover:bg-slate-700/50/30 transition-colors">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: road.color }} />
                      <span className="text-slate-200 font-medium">{road.shortName}</span>
                    </div>
                  </td>
                  <td className="text-right py-2.5 px-3 tabular-nums" style={{ color: road.color }}>{score.toFixed(3)}</td>
                  <td className="text-right py-2.5 px-3 tabular-nums text-slate-400">{percentage.toFixed(1)}%</td>
                  {FLEET_SIZES.map(n => {
                    const fleetRow = fleetAllocations.find(f => f.n === n)
                    const item = fleetRow.rows.find(r => r.road.id === road.id)
                    const exact = (n * score / fleetAllocations[0].rows.reduce((s, r) => s + r.score, 0))
                    const isRemainder = item.drones > Math.floor(exact)
                    return (
                      <td key={n} className="text-center py-2.5 px-3">
                        <span className="inline-flex flex-col items-center gap-0.5">
                          <span className="text-[13px] font-bold tabular-nums" style={{ color: road.color }}>
                            {item.drones}
                            {isRemainder && <span className="text-emerald-800 text-[9px] ml-0.5">+</span>}
                          </span>
                          <span className="text-[8.5px] text-slate-600 tabular-nums">({exact.toFixed(2)})</span>
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700 bg-slate-700/50">
                <td className="py-2.5 pr-4 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Total</td>
                <td className="py-2.5 px-3 text-right text-slate-400 font-mono text-[10px]">
                  {roads.reduce((s, r) => s + r.score, 0).toFixed(3)}
                </td>
                <td className="py-2.5 px-3 text-right text-slate-400 text-[10px]">100%</td>
                {FLEET_SIZES.map(n => (
                  <td key={n} className="py-2.5 px-3 text-center font-bold text-slate-200 text-[13px]">{n}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Data Sources ────────────────────────────────────────────────────────────
export function DataSources() {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">Data Sources</div>
        <div className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
          Citation status for each numeric input.{' '}
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-800 inline-block" /><span className="text-emerald-800/90">REAL</span></span>{' '}
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-800 inline-block" /><span className="text-blue-800/90">DERIVED</span></span>{' '}
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-700 inline-block" /><span className="text-amber-700/90">ESTIMATE</span></span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10.5px] text-slate-300 leading-relaxed">
        <div className="rounded-xl ring-1 ring-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-800/90">Speed limits — real</span>
          </div>
          Lebanese Traffic Law no. 243 (22 Oct 2012), Article 84. Cross-checked against OpenStreetMap <code className="text-emerald-800/80">maxspeed</code> tags.
        </div>
        <div className="rounded-xl ring-1 ring-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-800/90">Road geometry — real</span>
          </div>
          Polylines hand-traced from OpenStreetMap (© OSM contributors, ODbL).
        </div>
        <div className="rounded-xl ring-1 ring-blue-500/20 bg-blue-500/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-800" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-blue-800/90">AADT — real (range)</span>
          </div>
          World Bank Lebanon GBPTP PAD P160224 (2017) + Choueiri et al. 2010, Procedia SBS 48: 451–461.
        </div>
        <div className="rounded-xl ring-1 ring-blue-500/20 bg-blue-500/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-800" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-blue-800/90">Annual accidents — derived SPF</span>
          </div>
          Exposure-based SPF: E[crashes] = k·L·AADT. ISF national ~3,500–4,500 RTAs/yr. WHO 2018 Lebanon profile.
          <span className="block mt-1 text-amber-700/80 text-[9px]">Per-road exact counts are not measurements.</span>
        </div>
        <div className="rounded-xl ring-1 ring-amber-700/25 bg-amber-500/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-700" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-700/90">Pavement condition — estimate</span>
          </div>
          IRI-equivalent visual rating (1–5) by modeller from street-level imagery. Contributes lowest weight (15%).
        </div>
        <div className="rounded-xl ring-1 ring-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-800/90">Allocation algorithm — real</span>
          </div>
          Hamilton / Largest-Remainder (Hamilton 1792; Balinski & Young, <em>Fair Representation</em>, Yale 1982).
        </div>
      </div>
    </div>
  )
}

// ─── Nav item ────────────────────────────────────────────────────────────────
function NavItem({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all cursor-pointer text-[10.5px] font-medium
        ${active
          ? 'bg-purple-500/10 text-purple-800 border-l-2 border-purple-400'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50/50 border-l-2 border-transparent'
        }`}
    >
      <span className="text-[11px]">{icon}</span>
      {label}
    </button>
  )
}

// ─── Section header ──────────────────────────────────────────────────────────
function SectionHeader({ icon, title, description }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[13px]">{icon}</span>
        <h2 className="text-[13px] font-bold text-slate-100 tracking-tight">{title}</h2>
      </div>
      {description && (
        <p className="text-[10.5px] text-slate-400 leading-relaxed max-w-2xl">{description}</p>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'overview',   label: 'Overview & KPIs',      icon: '◇', group: 'Summary' },
  { key: 'map',        label: 'Map & Corridors',       icon: '⬡', group: 'Allocation' },
  { key: 'multifleet', label: 'Multi-fleet Table',     icon: '⊞', group: 'Analysis' },
]

export default function PartitionPage({ droneCount, onDroneCountChange }) {
  const allocations = useMemo(() => allocateDrones(droneCount), [droneCount])
  const [selectedRoadId, setSelectedRoadId] = useState(() => allocateDrones(8)[0].road.id)
  const [heatmap, setHeatmap] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const top = allocations[0]

  const groups = [...new Set(NAV_ITEMS.map(i => i.group))]

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-700/50">

      {/* ── Left sidebar ── */}
      <aside className={`${sidebarOpen ? 'w-52' : 'w-10'} shrink-0 flex flex-col border-r border-slate-600/70 bg-[var(--color-bg2)] transition-all duration-200 overflow-hidden`}>

        {/* Sidebar header */}
        <div className="px-3 pt-3 pb-3 border-b border-slate-600/70 shrink-0 flex items-start justify-between gap-2">
          {sidebarOpen && (
            <div className="min-w-0">
              <div className="text-[9px] text-purple-800/70 uppercase tracking-widest font-semibold mb-0.5 truncate">
                Risk partitioning
              </div>
              <div className="text-[12px] font-bold text-slate-100 leading-tight truncate">Allocation System</div>
              <div className="text-[9px] text-slate-500 mt-0.5 truncate">Hamilton · composite risk</div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 cursor-pointer transition-colors text-[11px] mt-0.5"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '‹' : '›'}
          </button>
        </div>

        {/* Fleet size control */}
        <div className={`px-4 py-3 border-b border-slate-600/70 shrink-0 ${sidebarOpen ? '' : 'hidden'}`}>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-2">Fleet size</div>
          <div className="flex items-center gap-2">
            <input
              type="range" min={3} max={20} step={1} value={droneCount}
              onChange={(e) => onDroneCountChange(parseInt(e.target.value, 10))}
              className="flex-1 accent-purple-400 h-[3px]"
            />
            <span className="text-[20px] font-bold font-mono text-slate-100 leading-none w-7 text-right tabular-nums">{droneCount}</span>
          </div>
          <div className="text-[9px] text-slate-500 mt-1">drones to allocate</div>
        </div>

        {/* Navigation — scrollable */}
        <nav className={`flex-1 overflow-y-auto py-2 px-2 ${sidebarOpen ? '' : 'hidden'}`}>
          {groups.map((group) => (
            <div key={group} className="mb-3">
              <div className="px-3 py-1 text-[8.5px] text-slate-600 uppercase tracking-widest font-semibold">
                {group}
              </div>
              {NAV_ITEMS.filter(i => i.group === group).map((item) => (
                <NavItem
                  key={item.key}
                  label={item.label}
                  icon={item.icon}
                  active={activeSection === item.key}
                  onClick={() => setActiveSection(item.key)}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom: top corridor stat */}
        <div className={`px-4 py-3 border-t border-slate-600/70 shrink-0 ${sidebarOpen ? '' : 'hidden'}`}>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Top corridor</div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: top.road.color }} />
            <span className="text-[11px] font-bold" style={{ color: top.road.color }}>{top.road.shortName}</span>
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">
            R = {top.score.toFixed(3)} · {top.drones} drone{top.drones !== 1 ? 's' : ''}
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeSection === 'overview' && (
          <>
            <SectionHeader
              icon="◇"
              title="Overview & KPIs"
              description="Key allocation metrics for the current fleet size. Adjust the slider in the sidebar to see how drones are redistributed across corridors."
            />
            <SummaryStrip allocations={allocations} droneCount={droneCount} />
          </>
        )}

        {activeSection === 'map' && (
          <>
            <SectionHeader
              icon="⬡"
              title="Map & Corridors"
              description="Beirut road network with drone allocation visualised as line width. Toggle heatmap mode to colour corridors by risk score."
            />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-5">
              <div className="rounded-2xl ring-1 ring-slate-600/80 bg-slate-700/40 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2.5 px-5 py-3 border-b border-slate-600/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-800" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">Beirut corridors</span>
                  <span className="text-slate-700 text-[10px]">/</span>
                  <span className="text-[10px] text-slate-500">
                    {heatmap ? 'Heatmap — colour = risk (green → red)' : 'Identity — colour = road · width = drones'}
                  </span>
                  <button
                    onClick={() => setHeatmap(h => !h)}
                    className={`ml-auto text-[9.5px] font-semibold px-2.5 py-1 rounded-lg ring-1 cursor-pointer transition-colors ${
                      heatmap
                        ? 'bg-orange-500/15 ring-orange-500/40 text-orange-800 hover:bg-orange-500/25'
                        : 'bg-slate-700/50 ring-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {heatmap ? '🌡 Heatmap ON' : '🌡 Heatmap'}
                  </button>
                  <span className="text-[10px] text-slate-500">Click road to focus</span>
                </div>
                <div style={{ height: 500, isolation: 'isolate' }}>
                  <PartitionMap
                    allocations={allocations}
                    selectedRoadId={selectedRoadId}
                    onSelectRoad={setSelectedRoadId}
                    heatmap={heatmap}
                  />
                </div>
              </div>
              <div className="rounded-2xl ring-1 ring-slate-600/80 bg-slate-700/40 overflow-hidden flex flex-col">
                <StatsPanel
                  allocations={allocations}
                  selectedRoadId={selectedRoadId}
                  onSelectRoad={setSelectedRoadId}
                  droneCount={droneCount}
                />
              </div>
            </div>
          </>
        )}

        {activeSection === 'multifleet' && (
          <>
            <SectionHeader
              icon="⊞"
              title="Multi-fleet Allocation"
              description="Hamilton / Largest-Remainder allocation for N = 10, 20, 30, 50 drones. Risk share and ordering remain stable as fleet grows."
            />
            <MultiFleetTable />
          </>
        )}

      </main>

    </div>
  )
}
