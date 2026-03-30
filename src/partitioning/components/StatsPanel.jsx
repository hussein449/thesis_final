import { useState } from 'react'

// ─── Small helpers ────────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-1.5">
      {children}
    </div>
  )
}

function StatChip({ label, value, color }) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-2 text-center">
      <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-widest font-bold mb-0.5">{label}</div>
      <div className={`text-[14px] font-bold font-[var(--font-mono)] ${color || 'text-[var(--color-cyan)]'}`}>{value}</div>
    </div>
  )
}

// ─── Road detail popup ────────────────────────────────────────────────────────
function RoadDetailPopup({ item, onClose }) {
  const { road, score, drones, exact, percentage } = item
  const accPerKm = road.accidents / road.lengthKm

  const terms = [
    { label: 'Accident Rate',        color: 'var(--color-danger)', weight: '40%', raw: `${accPerKm.toFixed(1)} acc/km`,          contrib: 0.40 * (accPerKm / 20) },
    { label: 'Traffic Volume (AADT)',color: 'var(--color-warn)',   weight: '25%', raw: `${(road.aadt/1000).toFixed(0)}k veh/day`, contrib: 0.25 * (road.aadt / 50000) },
    { label: 'Speed Limit',          color: 'var(--color-accent)', weight: '20%', raw: `${road.speedKmh} km/h`,                  contrib: 0.20 * (road.speedKmh / 120) },
    { label: 'Road Condition (inv)', color: 'var(--color-violet)', weight: '15%', raw: `${road.condition} / 5`,                  contrib: 0.15 * ((5 - road.condition) / 4) },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        style={{ backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />

      {/* Card */}
      <div
        className="fixed z-50 w-[460px] max-h-[88vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#0b1020',
          borderColor: road.color + '55',
          boxShadow: `0 0 40px ${road.color}22, 0 25px 60px rgba(0,0,0,0.7)`,
          animation: 'loraDrawerIn 0.18s cubic-bezier(0.16,1,0.3,1)',
        }}
      >

        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5 shrink-0 border-b"
          style={{ borderBottomColor: road.color + '33', background: road.color + '0d' }}
        >
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: road.color, boxShadow: `0 0 8px ${road.color}` }} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold text-[var(--color-white)] tracking-tight">{road.name}</div>
            <div className="text-[9px] text-[var(--color-txt3)] uppercase tracking-widest mt-0.5">Road Detail · Risk Analysis</div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#1a2540] hover:text-white cursor-pointer transition-colors text-[12px] font-bold shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto custom-scroll px-5 py-4 space-y-4">

          {/* Quick stats row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Accidents/yr', value: road.accidents, color: 'text-[var(--color-danger)]' },
              { label: 'AADT',         value: `${(road.aadt/1000).toFixed(0)}k`, color: 'text-[var(--color-warn)]' },
              { label: 'Speed',        value: `${road.speedKmh}`, color: 'text-[var(--color-accent)]' },
              { label: 'Condition',    value: `${road.condition}/5`, color: 'text-[var(--color-mint)]' },
            ].map(s => (
              <div key={s.label} className="bg-[#0d1630] border border-[var(--color-border)] rounded-lg p-2 text-center">
                <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-widest mb-0.5">{s.label}</div>
                <div className={`text-[15px] font-extrabold font-[var(--font-mono)] ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="bg-[#0d1630] border border-[var(--color-border)] rounded-lg p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt3)] uppercase tracking-[0.12em] mb-1.5">Description</div>
            <p className="text-[11px] text-[var(--color-txt2)] leading-relaxed">{road.description}</p>
          </div>

          {/* Score breakdown */}
          <div className="bg-[#0d1630] border border-[var(--color-border)] rounded-lg p-3">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--color-border)]">
              <div className="text-[8px] font-bold text-[var(--color-txt3)] uppercase tracking-[0.12em]">Risk Score Breakdown (HSM)</div>
              <span className="text-[16px] font-extrabold font-[var(--font-mono)] text-[var(--color-cyan)]">
                {(score * 100).toFixed(2)}
              </span>
            </div>

            <div className="space-y-2.5">
              {terms.map(t => (
                <div key={t.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.color }} />
                      <span className="text-[9px] text-[var(--color-txt2)]">{t.label}</span>
                      <span className="text-[7.5px] text-[var(--color-txt3)] font-mono">w={t.weight}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8.5px] text-[var(--color-txt3)] font-mono">{t.raw}</span>
                      <span className="text-[9px] font-bold font-mono" style={{ color: t.color }}>+{t.contrib.toFixed(4)}</span>
                    </div>
                  </div>
                  <div className="h-[3px] rounded-full overflow-hidden" style={{ background: '#0a1020' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min((t.contrib / score) * 100, 100)}%`, background: t.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Allocation result */}
          <div className="bg-[#0d1630] border border-[var(--color-border)] rounded-lg p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt3)] uppercase tracking-[0.12em] mb-2.5">Drone Allocation Result</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#090e1e] rounded-lg p-2 text-center">
                <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-widest mb-0.5">Assigned</div>
                <div className="text-[20px] font-extrabold font-mono" style={{ color: road.color }}>
                  {drones}
                </div>
                <div className="text-[8px] text-[var(--color-txt3)]">drone{drones !== 1 ? 's' : ''}</div>
              </div>
              <div className="bg-[#090e1e] rounded-lg p-2 text-center">
                <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-widest mb-0.5">Exact</div>
                <div className="text-[14px] font-extrabold font-mono text-[var(--color-cyan)]">{exact.toFixed(3)}</div>
                <div className="text-[8px] text-[var(--color-txt3)]">proportional</div>
              </div>
              <div className="bg-[#090e1e] rounded-lg p-2 text-center">
                <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-widest mb-0.5">Risk share</div>
                <div className="text-[14px] font-extrabold font-mono text-[var(--color-violet)]">{percentage.toFixed(1)}%</div>
                <div className="text-[8px] text-[var(--color-txt3)]">of total</div>
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#0a1020' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(percentage, 100)}%`, background: road.color }} />
              </div>
              <span className="text-[9px] font-mono shrink-0" style={{ color: road.color }}>{road.lengthKm} km</span>
            </div>
          </div>

          {/* Source */}
          <div className="bg-[#0a0e1c] border border-[var(--color-border)] rounded-lg p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt3)] uppercase tracking-[0.12em] mb-1.5">Data Source</div>
            <p className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed italic">{road.source}</p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--color-border)] shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-md text-[11px] font-bold tracking-wide cursor-pointer hover:opacity-90 transition-opacity text-white"
            style={{ background: road.color }}
          >
            Close
          </button>
        </div>

      </div>
    </>
  )
}

// ─── Road row card ────────────────────────────────────────────────────────────
function RoadRow({ item, isSelected, onSelect, onOpenDetail }) {
  const { road, score, drones, percentage } = item
  const unpatrolled = drones === 0

  return (
    <div
      className="w-full bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-2.5 mb-1.5 transition-all hover:border-[var(--color-border2)]"
      style={{ borderLeftWidth: 3, borderLeftColor: isSelected ? road.color : 'transparent' }}
    >
      {/* Row header */}
      <div className="flex items-center justify-between mb-1 gap-2">
        <button
          onClick={() => onSelect(road.id)}
          className="flex items-center gap-1.5 min-w-0 cursor-pointer"
        >
          <span className="text-[11px] font-bold font-[var(--font-mono)] truncate" style={{ color: road.color }}>
            {road.shortName}
          </span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${unpatrolled ? 'text-[var(--color-danger)] bg-[#450a0a]' : ''}`}
            style={unpatrolled ? {} : { background: road.color + '22', color: road.color }}
          >
            {unpatrolled ? '✗ unpatrolled' : `${drones} drone${drones !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={() => onOpenDetail(item)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide border cursor-pointer transition-all hover:text-white"
            style={{
              borderColor: road.color + '44',
              color: road.color,
              background: road.color + '10',
            }}
            title="View full details"
          >
            Detail ↗
          </button>
        </div>
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
          <div className="h-full rounded-full" style={{ width: `${Math.min(percentage, 100)}%`, background: road.color }} />
        </div>
        <span className="text-[9px] font-[var(--font-mono)] text-[var(--color-txt2)] shrink-0 min-w-[38px] text-right">
          {percentage.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

// ─── Formula / algorithm info panel ──────────────────────────────────────────
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
              <div className="pl-3"><span className="text-[var(--color-danger)]">0.40</span><span className="text-[var(--color-txt3)]"> × (acc/km ÷ 20)</span></div>
              <div className="pl-3"><span className="text-[var(--color-txt3)]">+ </span><span className="text-[var(--color-warn)]">0.25</span><span className="text-[var(--color-txt3)]"> × (AADT ÷ 50,000)</span></div>
              <div className="pl-3"><span className="text-[var(--color-txt3)]">+ </span><span className="text-[var(--color-accent)]">0.20</span><span className="text-[var(--color-txt3)]"> × (speed km/h ÷ 120)</span></div>
              <div className="pl-3"><span className="text-[var(--color-txt3)]">+ </span><span className="text-[var(--color-violet)]">0.15</span><span className="text-[var(--color-txt3)]"> × ((5 − condition) ÷ 4)</span></div>
            </div>
            <div className="font-[var(--font-mono)] text-[9px] leading-loose text-[var(--color-txt2)]">
              <div className="text-[8px] font-bold text-[var(--color-txt3)] uppercase tracking-widest mb-1">Allocation (Largest Remainder)</div>
              <div className="pl-3"><span className="text-[var(--color-mint)]">alloc<sub>i</sub></span><span className="text-[var(--color-txt3)]"> = floor(N × score<sub>i</sub> / Σscore)</span></div>
              <div className="pl-3"><span className="text-[var(--color-txt3)]">remaining drones → highest fractional remainders</span></div>
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

// ─── Main export ──────────────────────────────────────────────────────────────
export default function StatsPanel({ allocations, selectedRoadId, onSelectRoad, droneCount }) {
  const [detailItem, setDetailItem] = useState(null)

  if (!allocations?.length) return null

  const totalScore = allocations.reduce((s, a) => s + a.score, 0)
  const unpatrolledCount = allocations.filter(a => a.drones === 0).length
  const maxRiskRoad = allocations[0]

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Summary chips */}
      <div className="px-3 py-2.5 border-b border-[var(--color-border)] shrink-0">
        <div className="grid grid-cols-4 gap-1.5">
          <StatChip label="Fleet"       value={droneCount}                       color="text-[var(--color-cyan)]" />
          <StatChip label="Roads"       value={allocations.length}               color="text-[var(--color-white)]" />
          <StatChip label="∑ Risk"      value={(totalScore * 100).toFixed(1)}    color="text-[var(--color-warn)]" />
          <StatChip label="Unpatrolled" value={unpatrolledCount}
            color={unpatrolledCount > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-mint)]'} />
        </div>

        {/* Highest risk callout */}
        <div
          className="mt-2 px-2.5 py-1.5 rounded-md border text-[9px] flex items-center justify-between"
          style={{ borderColor: maxRiskRoad.road.color + '55', background: maxRiskRoad.road.color + '0d' }}
        >
          <span className="text-[var(--color-txt2)]">Highest risk →</span>
          <span className="font-bold" style={{ color: maxRiskRoad.road.color }}>{maxRiskRoad.road.shortName}</span>
          <span className="font-[var(--font-mono)] text-[var(--color-cyan)]">{(maxRiskRoad.score * 100).toFixed(1)} / 100</span>
          <span style={{ color: maxRiskRoad.road.color }} className="font-bold">
            {maxRiskRoad.drones} drone{maxRiskRoad.drones !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Road list */}
      <div className="flex-1 overflow-y-auto custom-scroll px-3 py-2 min-h-0">
        <Label>Allocation — click road to highlight · Detail ↗ to inspect</Label>
        {allocations.map(item => (
          <RoadRow
            key={item.road.id}
            item={item}
            isSelected={item.road.id === selectedRoadId}
            onSelect={onSelectRoad}
            onOpenDetail={setDetailItem}
          />
        ))}
      </div>

      <FormulaPanel />

      {/* Road detail popup */}
      {detailItem && (
        <RoadDetailPopup item={detailItem} onClose={() => setDetailItem(null)} />
      )}

    </div>
  )
}
