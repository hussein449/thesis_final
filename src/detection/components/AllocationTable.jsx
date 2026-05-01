import { POLICIES } from '../lib/policies'

export default function AllocationTable({ N }) {
  const uniform = POLICIES.uniform.allocate(N)
  const risk = POLICIES.riskAware.allocate(N)

  // Merge by road id
  const rows = uniform.map((u) => {
    const r = risk.find((x) => x.road.id === u.road.id)
    return { road: u.road, uniform: u.drones, risk: r?.drones ?? 0, score: u.score }
  })

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[#0d1225] p-4">
      <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-3">
        Allocation comparison at N = {N}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10.5px] font-mono">
          <thead>
            <tr className="text-[var(--color-txt3)] border-b border-[var(--color-border)]">
              <th className="text-left py-1.5 px-2">Road</th>
              <th className="text-right py-1.5 px-2">Risk score</th>
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
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: r.road.color }}
                      />
                      <span className="text-[var(--color-txt)]">{r.road.shortName}</span>
                    </span>
                  </td>
                  <td className="text-right py-1 px-2 text-[var(--color-txt2)]">
                    {(r.score * 100).toFixed(1)}
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
        Roads with high risk scores typically gain drones; lower-risk roads cede them.
      </div>
    </div>
  )
}
