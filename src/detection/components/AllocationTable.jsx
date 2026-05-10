import { useEffect, useState } from 'react'
import { POLICIES } from '../lib/policies'
import { allocateDrones } from '../../partitioning/lib/roads'
import { RiskScoreTable } from '../../partitioning/PartitionPage'
import { RoadDetailPopup } from '../../partitioning/components/StatsPanel'

function RiskScoreModal({ open, onClose, allocations }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-700/50/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl max-h-[88vh] overflow-y-auto rounded-2xl ring-1 ring-slate-700/70 bg-[var(--color-card)] shadow-[0_20px_70px_-10px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-3.5 border-b border-slate-600/80 bg-[var(--color-card)]/95 backdrop-blur">
          <span className="text-[14px] text-purple-800">≡</span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-100 leading-tight">Risk Score Breakdown</div>
            <div className="text-[10px] text-slate-500 leading-tight">Per-corridor decomposition of μ and R = 1 − e<sup>−μ</sup></div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-700/50 ring-1 ring-slate-700/60 cursor-pointer transition-colors text-[14px]"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="p-6">
          <RiskScoreTable allocations={allocations} />
        </div>
      </div>
    </div>
  )
}

export default function AllocationTable({ N }) {
  const uniform = POLICIES.uniform.allocate(N)
  const risk = POLICIES.riskAware.allocate(N)
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [detailItem, setDetailItem] = useState(null)
  const breakdownAllocations = allocateDrones(N)

  // Merge by road id
  const rows = uniform.map((u) => {
    const r = risk.find((x) => x.road.id === u.road.id)
    return { road: u.road, uniform: u.drones, risk: r?.drones ?? 0, score: u.score }
  })

  return (
    <div className="space-y-4">

    {/* ── How the risk score is computed ── */}
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
          How the risk score is computed
        </div>
        <button
          onClick={() => setBreakdownOpen(true)}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-md bg-emerald-800 text-white hover:bg-emerald-700 cursor-pointer transition-colors shadow-sm"
        >
          <span className="text-[11px]">≡</span>
          View risk score breakdown
        </button>
      </div>
      <div className="text-[11px] text-[var(--color-txt3)] leading-relaxed mb-3">
        Each road gets a Poisson-derived risk score. The four normalised predictors (each in [0, 1])
        are weighted into a Poisson mean μ — the expected accidents in a unit window — and the
        score R is the probability of at least one accident.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg ring-1 ring-slate-600/70 bg-slate-700/40 px-3 py-2.5 font-mono text-[11px] text-slate-200 leading-relaxed">
          <div>μ = 0.40·A + 0.25·T + 0.20·S + 0.15·C</div>
          <div className="mt-1">R = 1 − e<sup>−μ</sup>  &nbsp;<span className="text-slate-500">= P(N ≥ 1)</span></div>
          <div className="mt-1 text-slate-500 text-[10px]">drones<sub>i</sub> ∝ R<sub>i</sub> via Hamilton largest-remainder method.</div>
        </div>
        <div className="rounded-lg ring-1 ring-slate-600/70 bg-slate-700/40 px-3 py-2.5 text-[10.5px] leading-relaxed">
          <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5">
            <span className="font-mono text-slate-300">A</span>
            <span className="text-slate-400">Accident history</span>
            <span className="font-mono text-emerald-800 font-bold">w = 0.40</span>
            <span className="font-mono text-slate-300">T</span>
            <span className="text-slate-400">Traffic intensity (AADT)</span>
            <span className="font-mono text-emerald-800 font-bold">w = 0.25</span>
            <span className="font-mono text-slate-300">S</span>
            <span className="text-slate-400">Operating speed</span>
            <span className="font-mono text-emerald-800 font-bold">w = 0.20</span>
            <span className="font-mono text-slate-300">C</span>
            <span className="text-slate-400">Pavement condition (inverted)</span>
            <span className="font-mono text-emerald-800 font-bold">w = 0.15</span>
          </div>
        </div>
      </div>
    </div>

    {/* ── Allocation table ── */}
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-3">
        Allocation comparison at N = {N}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10.5px] font-mono">
          <thead>
            <tr className="text-[var(--color-txt3)] border-b border-[var(--color-border)]">
              <th className="text-left py-1.5 px-2">Road</th>
              <th className="text-right py-1.5 px-2">Risk score R</th>
              <th className="text-right py-1.5 px-2" style={{ color: POLICIES.uniform.color }}>
                Uniform
              </th>
              <th className="text-right py-1.5 px-2" style={{ color: POLICIES.riskAware.color }}>
                Risk-aware
              </th>
              <th className="text-right py-1.5 px-2">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.risk - r.uniform
              return (
                <tr
                  key={r.road.id}
                  className="border-b border-[var(--color-border)]/50"
                >
                  <td className="py-1 px-2">
                    <button
                      onClick={() => {
                        const bd = breakdownAllocations.find((b) => b.road.id === r.road.id)
                        if (bd) setDetailItem(bd)
                      }}
                      className="flex items-center gap-1.5 cursor-pointer group"
                      title="View road risk analysis"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: r.road.color }}
                      />
                      <span className="text-[var(--color-txt)] group-hover:underline" style={{ textDecorationColor: r.road.color }}>
                        {r.road.shortName}
                      </span>
                    </button>
                  </td>
                  <td className="text-right py-1 px-2 text-[var(--color-txt2)]">
                    {r.score.toFixed(3)}
                  </td>
                  <td
                    className="text-right py-1 px-2 font-bold"
                    style={{ color: POLICIES.uniform.color }}
                  >
                    {r.uniform}
                  </td>
                  <td
                    className="text-right py-1 px-2 font-bold"
                    style={{ color: POLICIES.riskAware.color }}
                  >
                    {r.risk}
                  </td>
                  <td
                    className="text-right py-1 px-2 font-bold"
                    style={{ color: delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : '#4e6080' }}
                  >
                    {delta > 0 ? '+' : ''}{delta}
                  </td>
                </tr>
              )
            })}
            <tr>
              <td className="py-1.5 px-2 text-[var(--color-txt3)] uppercase text-[9px] tracking-wider">
                Total
              </td>
              <td></td>
              <td className="text-right py-1.5 px-2 font-bold text-[var(--color-txt)]">
                {rows.reduce((s, r) => s + r.uniform, 0)}
              </td>
              <td className="text-right py-1.5 px-2 font-bold text-[var(--color-txt)]">
                {rows.reduce((s, r) => s + r.risk, 0)}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
        <span className="text-[var(--color-txt2)]">Δ &gt; 0:</span> the risk-aware policy assigns more drones than uniform to that road.
        Risk score R = 1 − e^(−μ) with Poisson mean μ = 0.40·A + 0.25·T + 0.20·S + 0.15·C; higher-risk roads gain drones, lower-risk roads cede them.
      </div>
    </div>

    <RiskScoreModal
      open={breakdownOpen}
      onClose={() => setBreakdownOpen(false)}
      allocations={breakdownAllocations}
    />
    {detailItem && (
      <RoadDetailPopup item={detailItem} onClose={() => setDetailItem(null)} />
    )}
    </div>
  )
}
