import { useState } from 'react'

// ────────────────────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-1.5">
      {children}
    </div>
  )
}

function StatChip({ label, value, unit, color }) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-2 text-center">
      <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-widest font-bold mb-0.5">{label}</div>
      <div className={`text-[14px] font-bold font-[var(--font-mono)] ${color || 'text-[var(--color-cyan)]'}`}>
        {value}
        {unit && <span className="text-[9px] text-[var(--color-txt2)] ml-0.5 font-normal">{unit}</span>}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Road row in the allocation list
// ────────────────────────────────────────────────────────────────────────────
function RoadRow({ item, isSelected, onSelect }) {
  const { road, score, drones, percentage } = item
  const unpatrolled = drones === 0

  return (
    <button
      onClick={() => onSelect(road.id)}
      className="w-full text-left bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-2.5 mb-1.5 cursor-pointer transition-all hover:border-[var(--color-border2)] block"
      style={{ borderLeftWidth: 3, borderLeftColor: isSelected ? road.color : 'transparent' }}
    >
      {/* Row header */}
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-[11px] font-bold font-[var(--font-mono)] truncate" style={{ color: road.color }}>
          {road.shortName}
        </span>
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${unpatrolled ? 'text-[var(--color-danger)] bg-[#450a0a]' : ''}`}
          style={unpatrolled ? {} : { background: road.color + '22', color: road.color }}
        >
          {unpatrolled ? '✗ unpatrolled' : `${drones} drone${drones !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Quick stats */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-[var(--color-txt2)] mb-1.5">
        <span>{road.accidents} acc/yr</span>
        <span>{(road.aadt / 1000).toFixed(0)}k AADT</span>
        <span>{road.speedKmh} km/h</span>
        <span>{road.lengthKm} km</span>
        <span>{road.condition}/5 cond</span>
      </div>

      {/* Risk bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-[3px] rounded-full bg-[#0c1020] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(percentage, 100)}%`, background: road.color }}
          />
        </div>
        <span className="text-[9px] font-[var(--font-mono)] text-[var(--color-txt2)] shrink-0 min-w-[38px] text-right">
          {percentage.toFixed(1)}%
        </span>
      </div>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Score breakdown for the selected road
// ────────────────────────────────────────────────────────────────────────────
function ScoreBreakdown({ item }) {
  const { road, score, drones, exact } = item
  const accPerKm = road.accidents / road.lengthKm

  const terms = [
    {
      label: 'Accident Rate',
      color: 'var(--color-danger)',
      weight: 0.40,
      raw: `${accPerKm.toFixed(1)} acc/km`,
      contrib: 0.40 * (accPerKm / 20),
    },
    {
      label: 'Traffic Volume (AADT)',
      color: 'var(--color-warn)',
      weight: 0.25,
      raw: `${(road.aadt / 1000).toFixed(0)}k veh/day`,
      contrib: 0.25 * (road.aadt / 50000),
    },
    {
      label: 'Speed Limit',
      color: 'var(--color-accent)',
      weight: 0.20,
      raw: `${road.speedKmh} km/h`,
      contrib: 0.20 * (road.speedKmh / 120),
    },
    {
      label: 'Road Condition (inv.)',
      color: 'var(--color-violet)',
      weight: 0.15,
      raw: `${road.condition}/5`,
      contrib: 0.15 * ((5 - road.condition) / 4),
    },
  ]

  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-2.5 mb-2">
      {/* Road title + score */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--color-border)]">
        <span className="text-[11px] font-bold" style={{ color: road.color }}>{road.name}</span>
        <span className="text-[15px] font-bold font-[var(--font-mono)] text-[var(--color-cyan)]">
          {(score * 100).toFixed(2)}
        </span>
      </div>

      {/* Term-by-term breakdown */}
      {terms.map(t => (
        <div key={t.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.color }} />
            <span className="text-[9px] text-[var(--color-txt2)] truncate">{t.label}</span>
          </div>
          <span className="text-[8px] font-bold text-[var(--color-txt3)] shrink-0">{t.raw}</span>
          <span className="text-[9px] font-[var(--font-mono)] text-right shrink-0" style={{ color: t.color }}>
            +{t.contrib.toFixed(4)}
          </span>
        </div>
      ))}

      {/* Totals */}
      <div className="mt-2 pt-1.5 border-t border-[var(--color-border)] grid grid-cols-2 gap-2">
        <div className="text-center bg-[#0a0d16] rounded p-1.5">
          <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-widest mb-0.5">Score</div>
          <div className="text-[12px] font-bold font-[var(--font-mono)]" style={{ color: road.color }}>
            {(score * 100).toFixed(2)}
          </div>
        </div>
        <div className="text-center bg-[#0a0d16] rounded p-1.5">
          <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-widest mb-0.5">Exact Alloc.</div>
          <div className="text-[12px] font-bold font-[var(--font-mono)] text-[var(--color-cyan)]">
            {exact.toFixed(3)}
          </div>
        </div>
      </div>

      {/* Source */}
      <div className="mt-2 text-[8px] text-[var(--color-txt3)] italic leading-relaxed border-t border-[var(--color-border)] pt-1.5">
        <span className="font-bold not-italic text-[var(--color-txt3)]">Source: </span>
        {road.source}
      </div>
      <div className="mt-1 text-[8px] text-[var(--color-txt2)] leading-relaxed">{road.description}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Formula / algorithm info panel
// ────────────────────────────────────────────────────────────────────────────
function FormulaPanel() {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-t border-[var(--color-border)] shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-3 py-2 text-[10px] font-bold text-[var(--color-txt2)] uppercase tracking-widest bg-transparent hover:bg-[#111827] cursor-pointer transition-colors"
      >
        {open ? '▾' : '▸'} Partition Algorithm
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt3)] uppercase tracking-widest mb-2">
              Highway Safety Manual (HSM) — Adapted
            </div>

            <div className="font-[var(--font-mono)] text-[9px] leading-loose mb-3">
              <div className="text-[var(--color-txt2)] mb-0.5">score<sub>i</sub> =</div>
              <div className="pl-3">
                <span className="text-[var(--color-danger)]">0.40</span>
                <span className="text-[var(--color-txt3)]"> × (acc/km ÷ 20)</span>
              </div>
              <div className="pl-3">
                <span className="text-[var(--color-txt3)]">+ </span>
                <span className="text-[var(--color-warn)]">0.25</span>
                <span className="text-[var(--color-txt3)]"> × (AADT ÷ 50,000)</span>
              </div>
              <div className="pl-3">
                <span className="text-[var(--color-txt3)]">+ </span>
                <span className="text-[var(--color-accent)]">0.20</span>
                <span className="text-[var(--color-txt3)]"> × (speed km/h ÷ 120)</span>
              </div>
              <div className="pl-3">
                <span className="text-[var(--color-txt3)]">+ </span>
                <span className="text-[var(--color-violet)]">0.15</span>
                <span className="text-[var(--color-txt3)]"> × ((5 − condition) ÷ 4)</span>
              </div>
            </div>

            <div className="font-[var(--font-mono)] text-[9px] leading-loose text-[var(--color-txt2)]">
              <div className="text-[8px] font-bold text-[var(--color-txt3)] uppercase tracking-widest mb-1">Allocation (Largest Remainder)</div>
              <div className="pl-3">
                <span className="text-[var(--color-mint)]">alloc<sub>i</sub></span>
                <span className="text-[var(--color-txt3)]"> = floor(N × score<sub>i</sub> / Σscore)</span>
              </div>
              <div className="pl-3">
                <span className="text-[var(--color-txt3)]">remaining drones → highest fractional remainders</span>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-[var(--color-border)] text-[8px] text-[var(--color-txt3)] leading-relaxed">
              Weights sum to 1.0. Integer counts guaranteed to sum exactly to fleet size.
              Data: ISF Annual Report 2022, AUB Road Safety Observatory 2021.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────────────────
export default function StatsPanel({ allocations, selectedRoadId, onSelectRoad, droneCount }) {
  if (!allocations?.length) return null

  const selected = allocations.find(a => a.road.id === selectedRoadId)
  const totalScore = allocations.reduce((s, a) => s + a.score, 0)
  const unpatrolledCount = allocations.filter(a => a.drones === 0).length
  const maxRiskRoad = allocations[0]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Summary */}
      <div className="px-3 py-2.5 border-b border-[var(--color-border)] shrink-0">
        <div className="grid grid-cols-4 gap-1.5">
          <StatChip label="Fleet" value={droneCount} color="text-[var(--color-cyan)]" />
          <StatChip label="Roads" value={allocations.length} color="text-[var(--color-white)]" />
          <StatChip
            label="∑ Risk"
            value={(totalScore * 100).toFixed(1)}
            color="text-[var(--color-warn)]"
          />
          <StatChip
            label="Unpatrolled"
            value={unpatrolledCount}
            color={unpatrolledCount > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-mint)]'}
          />
        </div>

        {/* Highest risk callout */}
        <div className="mt-2 px-2.5 py-1.5 rounded-md border text-[9px] flex items-center justify-between"
             style={{ borderColor: maxRiskRoad.road.color + '55', background: maxRiskRoad.road.color + '0d' }}>
          <span className="text-[var(--color-txt2)]">Highest risk →</span>
          <span className="font-bold" style={{ color: maxRiskRoad.road.color }}>
            {maxRiskRoad.road.shortName}
          </span>
          <span className="font-[var(--font-mono)] text-[var(--color-cyan)]">
            {(maxRiskRoad.score * 100).toFixed(1)} / 100
          </span>
          <span style={{ color: maxRiskRoad.road.color }} className="font-bold">
            {maxRiskRoad.drones} drone{maxRiskRoad.drones !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto custom-scroll px-3 py-2 min-h-0">
        <Label>Allocation — click road to inspect</Label>
        {allocations.map(item => (
          <RoadRow
            key={item.road.id}
            item={item}
            isSelected={item.road.id === selectedRoadId}
            onSelect={onSelectRoad}
          />
        ))}

        {selected && (
          <>
            <Label>Score Breakdown — {selected.road.shortName}</Label>
            <ScoreBreakdown item={selected} />
          </>
        )}
      </div>

      <FormulaPanel />
    </div>
  )
}
