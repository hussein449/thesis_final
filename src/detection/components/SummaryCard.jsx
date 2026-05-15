import { POLICIES } from '../lib/policies'

/** Convert sweep results into a CSV string. */
function toCsv(results) {
  const header = ['policy', 'N', 'avgDetectionTime_s', 'pUnder2Min', 'detectionRate', 'nDetected', 'nMissed', 'nTotal']
  const rows = [header.join(',')]
  for (const [policy, points] of Object.entries(results)) {
    for (const p of points) {
      rows.push([
        policy,
        p.N,
        p.avgDetectionTime != null ? p.avgDetectionTime.toFixed(2) : '',
        p.pUnder2Min.toFixed(4),
        p.detectionRate.toFixed(4),
        p.nDetected,
        p.nMissed,
        p.nTotal,
      ].join(','))
    }
  }
  return rows.join('\n')
}

function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Compute simple summary statistics for the discussion section.
 * Shows the best policy at the smallest N, the largest N, and where the
 * crossover (if any) occurs.
 */
function computeSummary(results) {
  const policies = Object.keys(results)
  if (policies.length < 2) return null

  const [a, b] = policies
  const merged = []
  for (let i = 0; i < results[a].length; i++) {
    const ra = results[a][i]
    const rb = results[b].find((x) => x.N === ra.N)
    if (!rb) continue
    merged.push({
      N: ra.N,
      a: ra.avgDetectionTime,
      b: rb.avgDetectionTime,
      pa: ra.pUnder2Min,
      pb: rb.pUnder2Min,
    })
  }
  if (merged.length === 0) return null

  const first = merged[0]
  const last = merged[merged.length - 1]

  function winner(av, bv) {
    if (av == null && bv == null) return 'tie'
    if (av == null) return b
    if (bv == null) return a
    if (Math.abs(av - bv) < 1) return 'tie'
    return av < bv ? a : b
  }

  // ΔT(M) = T̄_uniform − T̄_risk-aware (§14). Positive ⇒ risk-aware faster.
  // `a` is whichever policy key sorts first in Object.entries(results);
  // `sign` normalises the subtraction to (uniform − risk-aware) regardless
  // of iteration order.
  const sign = a === 'uniform' ? +1 : a === 'riskAware' ? -1 : 0
  const deltaPerN = merged
    .filter((m) => m.a != null && m.b != null && sign !== 0)
    .map((m) => ({
      N: m.N,
      deltaT: sign * (m.a - m.b),
    }))
  const meanDelta = deltaPerN.length > 0
    ? deltaPerN.reduce((s, x) => s + x.deltaT, 0) / deltaPerN.length
    : null
  const bestDelta = deltaPerN.length > 0
    ? deltaPerN.reduce((best, x) => (Math.abs(x.deltaT) > Math.abs(best.deltaT) ? x : best))
    : null

  return {
    a, b,
    smallN: first.N,
    largeN: last.N,
    smallNWinner: winner(first.a, first.b),
    largeNWinner: winner(last.a, last.b),
    smallN_a: first.a,
    smallN_b: first.b,
    largeN_a: last.a,
    largeN_b: last.b,
    meanDelta,
    bestDelta,
  }
}

export default function SummaryCard({ results }) {
  const summary = computeSummary(results)

  return (
    <div className="rounded-2xl ring-1 ring-slate-600/80 bg-slate-700/40 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-800" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
              Summary &amp; tradeoffs
            </span>
          </div>
          <div className="text-[10.5px] text-slate-500 mt-1.5">
            Auto-generated from the sweep. Use this as a starting point for the Step 4 discussion.
          </div>
        </div>
        <button
          onClick={() => downloadCsv(toCsv(results), 'sweep_results.csv')}
          className="px-3 py-1.5 text-[10.5px] font-medium rounded-lg ring-1 ring-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-700/50 cursor-pointer transition-colors"
        >
          ⬇ Export CSV
        </button>
      </div>

      {!summary ? (
        <div className="text-[11.5px] text-slate-400">
          Run a sweep with at least two policies to see the comparison.
        </div>
      ) : (
        <div className="space-y-2.5 text-[11.5px] text-slate-200 leading-relaxed">
          <p>
            At the smallest fleet size <span className="font-mono font-medium text-slate-100">N = {summary.smallN}</span>,{' '}
            <span style={{ color: POLICIES[summary.smallNWinner]?.color }} className="font-medium">
              {summary.smallNWinner === 'tie' ? 'both policies are within 1 s' : `${POLICIES[summary.smallNWinner]?.label} wins`}
            </span>{' '}
            <span className="text-slate-400">
              ({summary.a}: {summary.smallN_a?.toFixed(0) ?? '—'} s vs {summary.b}: {summary.smallN_b?.toFixed(0) ?? '—'} s avg detection time).
            </span>
          </p>
          <p>
            At the largest fleet size <span className="font-mono font-medium text-slate-100">N = {summary.largeN}</span>,{' '}
            <span style={{ color: POLICIES[summary.largeNWinner]?.color }} className="font-medium">
              {summary.largeNWinner === 'tie' ? 'both policies are within 1 s' : `${POLICIES[summary.largeNWinner]?.label} wins`}
            </span>{' '}
            <span className="text-slate-400">
              ({summary.a}: {summary.largeN_a?.toFixed(0) ?? '—'} s vs {summary.b}: {summary.largeN_b?.toFixed(0) ?? '—'} s avg detection time).
            </span>
          </p>
          {summary.meanDelta != null && (
            <p>
              Mean improvement{' '}
              <span className="font-mono text-slate-100">ΔT̄</span>{' '}
              <span className="text-slate-400">
                = T̄<sub>uniform</sub> − T̄<sub>risk-aware</sub>
              </span>{' '}
              ={' '}
              <span
                className="font-mono font-medium"
                style={{
                  color:
                    summary.meanDelta > 1
                      ? POLICIES.riskAware.color
                      : summary.meanDelta < -1
                        ? POLICIES.uniform.color
                        : '#cbd5e1',
                }}
              >
                {summary.meanDelta > 0 ? '+' : ''}
                {summary.meanDelta.toFixed(1)} s
              </span>
              {summary.bestDelta && (
                <>
                  {', best at '}
                  <span className="font-mono text-slate-100">N = {summary.bestDelta.N}</span>
                  {' ('}
                  <span
                    className="font-mono font-medium"
                    style={{
                      color:
                        summary.bestDelta.deltaT > 0
                          ? POLICIES.riskAware.color
                          : POLICIES.uniform.color,
                    }}
                  >
                    {summary.bestDelta.deltaT > 0 ? '+' : ''}
                    {summary.bestDelta.deltaT.toFixed(1)} s
                  </span>
                  {').'}
                </>
              )}
            </p>
          )}
          <p className="text-slate-400">
            Tradeoff: risk-aware patrol shortens UAV segments on high-risk sections
            (Khalde, Awali) and stretches them across the open mid-corridor,
            cutting T_alert where accidents are most likely. Uniform pays a
            coverage tax at high-risk ends but never leaves any 1-km section
            with a disproportionately long segment to traverse.
          </p>
        </div>
      )}
    </div>
  )
}
