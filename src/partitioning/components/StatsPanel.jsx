import { useState } from 'react'
import { computeRiskBreakdown } from '../lib/roads'

// ─── Road detail popup ────────────────────────────────────────────────────────
function RoadDetailPopup({ item, onClose }) {
  const { road, score, drones, exact, percentage } = item
  const breakdown = computeRiskBreakdown(road)

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-950/70"
        style={{ backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />
      <div
        className="fixed z-50 w-[480px] max-h-[88vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#0b1322',
          boxShadow: `0 0 0 1px ${road.color}55, 0 0 50px ${road.color}22, 0 25px 60px rgba(0,0,0,0.7)`,
          animation: 'loraDrawerIn 0.18s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5 shrink-0 border-b"
          style={{ borderBottomColor: road.color + '33', background: `linear-gradient(180deg, ${road.color}10 0%, transparent 100%)` }}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: road.color }} />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-slate-50 tracking-tight">{road.name}</div>
            <div className="text-[9.5px] text-slate-500 uppercase tracking-[0.14em] mt-0.5">Road detail · risk analysis</div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg ring-1 ring-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 cursor-pointer transition-colors text-[13px] font-medium shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scroll px-5 py-4 space-y-4">

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Acc/yr',   value: road.accidents,                    color: '#f87171' },
              { label: 'AADT',     value: `${(road.aadt/1000).toFixed(0)}k`, color: '#fbbf24' },
              { label: 'Speed',    value: `${road.speedKmh}`,                color: '#60a5fa' },
              { label: 'Condition',value: `${road.condition}/5`,             color: '#34d399' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg ring-1 ring-slate-800 bg-slate-950/40 px-2 py-2 text-center">
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">{s.label}</div>
                <div className="text-[15px] font-mono font-semibold tabular-nums" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="rounded-lg ring-1 ring-slate-800 bg-slate-950/40 px-3 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1.5">Description</div>
            <p className="text-[11px] text-slate-300 leading-relaxed">{road.description}</p>
          </div>

          {/* Risk score breakdown */}
          <div className="rounded-lg ring-1 ring-slate-800 bg-slate-950/40 px-3 py-3">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
              <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Composite risk score — R = 0.40·A + 0.25·T + 0.20·S + 0.15·C
              </div>
              <span className="text-[15px] font-mono font-bold tabular-nums" style={{ color: road.color }}>
                {score.toFixed(3)}
              </span>
            </div>
            {/* Term breakdown table */}
            <div className="w-full text-[10px] font-mono">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 text-[8.5px] text-slate-600 uppercase tracking-wider mb-1 px-1">
                <span>Term</span><span>Raw value</span><span>Norm.</span><span>Weight</span><span>Contrib.</span>
              </div>
              {breakdown.terms.map((t) => (
                <div key={t.label} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 items-center py-1 px-1 rounded hover:bg-slate-800/40">
                  <span className="text-slate-300 text-[10px] truncate">{t.label}</span>
                  <span className="text-slate-500 text-right tabular-nums">{t.raw}</span>
                  <span className="text-slate-400 text-right tabular-nums">{t.norm.toFixed(3)}</span>
                  <span className="text-purple-400 text-right tabular-nums">{t.weight.toFixed(2)}</span>
                  <span className="font-bold text-right tabular-nums" style={{ color: road.color }}>{t.contrib.toFixed(3)}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 items-center pt-1.5 mt-1 border-t border-slate-800 px-1">
                <span className="text-slate-400 font-semibold">Total R</span>
                <span /><span /><span />
                <span className="font-bold text-right tabular-nums" style={{ color: road.color }}>{score.toFixed(3)}</span>
              </div>
            </div>
            <p className="mt-2 text-[9.5px] text-slate-600 leading-relaxed">
              Each term normalised to [0,1] against reference values (20 acc/yr, 50k veh/day, 120 km/h, condition 1–5).
              Ref: Hauer 1997; AASHTO HSM 2010 Ch.4.
            </p>
          </div>

          {/* Allocation result */}
          <div className="rounded-lg ring-1 ring-slate-800 bg-slate-950/40 px-3 py-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2.5">Drone allocation</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-slate-900/60 px-2 py-2 text-center">
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Assigned</div>
                <div className="text-[20px] font-mono font-semibold tabular-nums" style={{ color: road.color }}>{drones}</div>
                <div className="text-[8px] text-slate-500">drone{drones !== 1 ? 's' : ''}</div>
              </div>
              <div className="rounded-md bg-slate-900/60 px-2 py-2 text-center">
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Exact</div>
                <div className="text-[14px] font-mono font-semibold text-slate-100 tabular-nums">{exact.toFixed(3)}</div>
                <div className="text-[8px] text-slate-500">proportional</div>
              </div>
              <div className="rounded-md bg-slate-900/60 px-2 py-2 text-center">
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Risk share</div>
                <div className="text-[14px] font-mono font-semibold text-purple-300 tabular-nums">{percentage.toFixed(1)}%</div>
                <div className="text-[8px] text-slate-500">of total</div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-900">
                <div className="h-full rounded-full" style={{ width: `${Math.min(percentage, 100)}%`, background: road.color }} />
              </div>
              <span className="text-[10px] font-mono shrink-0 text-slate-400">{road.lengthKm} km</span>
            </div>
          </div>

          {/* Source */}
          <div className="rounded-lg ring-1 ring-amber-500/25 bg-amber-500/[0.04] px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-amber-300/90">Data status</div>
            </div>
            <p className="text-[9.5px] text-slate-300 leading-relaxed">{road.source}</p>
            <p className="text-[8.5px] text-slate-500 leading-relaxed mt-1.5 italic">
              See the page-level "Data sources &amp; citation status" panel for the
              full disclosure of which inputs are synthetic vs. extracted, and how
              each source is cited in the thesis.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-800 shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg text-[11px] font-semibold cursor-pointer hover:opacity-90 transition-opacity text-white"
            style={{ background: road.color }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Road row ────────────────────────────────────────────────────────────────
function RoadRow({ item, isSelected, onSelect, onOpenDetail, totalDrones }) {
  const { road, score, drones, percentage, exact } = item
  const unpatrolled = drones === 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(road.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(road.id) } }}
      className={`w-full text-left rounded-lg ring-1 px-3 py-2.5 transition-all cursor-pointer
        ${isSelected
          ? 'bg-slate-900/60 ring-slate-700'
          : 'bg-slate-950/40 ring-slate-800 hover:bg-slate-900/40 hover:ring-slate-700'}`}
      style={isSelected ? { boxShadow: `inset 3px 0 0 ${road.color}` } : undefined}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: road.color }} />
          <span className="text-[11.5px] font-medium text-slate-100 truncate">{road.shortName}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded ring-1 tabular-nums"
            style={unpatrolled
              ? { background: 'rgba(248,113,113,0.10)', color: '#fca5a5', boxShadow: 'inset 0 0 0 1px rgba(248,113,113,0.30)' }
              : { background: road.color + '14', color: road.color, boxShadow: `inset 0 0 0 1px ${road.color}33` }}
          >
            {unpatrolled ? '✗ none' : `× ${drones}`}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDetail(item) }}
            className="text-[9px] font-medium uppercase tracking-wider text-slate-400 hover:text-slate-100 px-1.5 py-0.5 rounded ring-1 ring-slate-700 hover:ring-slate-500 cursor-pointer"
          >
            Detail ↗
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-slate-500 mb-1.5 font-mono">
        <span>{road.accidents} acc/yr</span>
        <span className="text-slate-700">·</span>
        <span>{(road.aadt / 1000).toFixed(0)}k AADT</span>
        <span className="text-slate-700">·</span>
        <span>{road.speedKmh} km/h</span>
        <span className="text-slate-700">·</span>
        <span>{road.lengthKm} km</span>
      </div>

      {/* Crash-frequency bar with allocation share */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-[4px] rounded-full bg-slate-900/80 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(percentage, 100)}%`, background: road.color }} />
        </div>
        <span className="text-[9.5px] font-mono text-slate-400 shrink-0 min-w-[100px] text-right tabular-nums">
          R={score.toFixed(3)}<span className="text-slate-600"> · </span>{percentage.toFixed(1)}%
        </span>
      </div>

      {/* Allocation hint — show how the integer count came from the exact value */}
      <div className="mt-1.5 text-[9px] text-slate-500 font-mono">
        exact = {exact.toFixed(3)} → ⌊·⌋ = {Math.floor(exact)}
        {drones > Math.floor(exact) && <span className="text-emerald-400/80"> +1 (largest remainder)</span>}
      </div>
    </div>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────────────
export default function StatsPanel({ allocations, selectedRoadId, onSelectRoad, droneCount }) {
  const [detailItem, setDetailItem] = useState(null)
  const [showAlgo, setShowAlgo] = useState(false)

  if (!allocations?.length) return null

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Section header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-800/70 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
            Allocation breakdown
          </span>
          <span className="text-slate-700 text-[10px]">/</span>
          <span className="text-[10px] text-slate-500 font-mono">{allocations.length} roads · {droneCount} drones</span>
        </div>
        <button
          onClick={() => setShowAlgo((s) => !s)}
          className="text-[10px] font-medium text-slate-400 hover:text-slate-200 cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-800/60 transition-colors"
        >
          <span className="text-slate-500">{showAlgo ? '▾' : '▸'}</span>
          {showAlgo ? 'Hide' : 'Show'} algorithm
        </button>
      </div>

      {/* Optional algorithm panel */}
      {showAlgo && (
        <div className="px-5 py-3 border-b border-slate-800/70 shrink-0 bg-slate-950/40">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-2">
            Crash-frequency allocation · Hamilton largest remainder
          </div>
          <div className="font-mono text-[10px] leading-relaxed text-slate-400 space-y-1">
            <div>1.  <span className="text-slate-300">risk<sub>i</sub></span> = accidents<sub>i</sub> per year <span className="text-slate-500">(black-spot principle)</span></div>
            <div>2.  <span className="text-slate-300">exact<sub>i</sub></span> = N · risk<sub>i</sub> / ∑ risk</div>
            <div>3.  <span className="text-slate-300">alloc<sub>i</sub></span> = ⌊exact<sub>i</sub>⌋ <span className="text-slate-500">(integer floor)</span></div>
            <div>4.  Distribute leftover drones to roads with the largest fractional part</div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-800 text-[9px] text-slate-500 leading-relaxed">
            Integer counts always sum exactly to the fleet size. No road can be over-allocated.
          </div>
          <div className="mt-1.5 text-[9px] text-slate-500 leading-relaxed">
            References: AASHTO HSM 2010, Ch. 4 (network screening by crash frequency);
            Hauer 1997. Hamilton method: Balinski &amp; Young, <em>Fair Representation</em>
            (Yale, 1982).
          </div>
        </div>
      )}

      {/* Road list */}
      <div className="flex-1 overflow-y-auto custom-scroll px-3 py-3 min-h-0 space-y-1.5">
        {allocations.map((item) => (
          <RoadRow
            key={item.road.id}
            item={item}
            isSelected={item.road.id === selectedRoadId}
            onSelect={onSelectRoad}
            onOpenDetail={setDetailItem}
            totalDrones={droneCount}
          />
        ))}
      </div>

      {detailItem && (
        <RoadDetailPopup item={detailItem} onClose={() => setDetailItem(null)} />
      )}
    </div>
  )
}
