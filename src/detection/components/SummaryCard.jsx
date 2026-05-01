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
  }
}

export default function SummaryCard({ results }) {
  const summary = computeSummary(results)

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[#0d1225] p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
            Summary &amp; tradeoffs
          </div>
          <div className="text-[10px] text-[var(--color-txt3)] mt-0.5">
            Auto-generated from the sweep. Use this as a starting point for the Step 4 discussion.
          </div>
        </div>
        <button
          onClick={() => downloadCsv(toCsv(results), 'sweep_results.csv')}
          className="px-3 py-1 text-[10px] font-semibold rounded-md border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#111827] cursor-pointer"
        >
          ⬇ CSV
        </button>
      </div>

      {!summary ? (
        <div className="text-[11px] text-[var(--color-txt2)]">
          Run a sweep with at least two policies to see the comparison.
        </div>
      ) : (
        <div className="space-y-2 text-[11px] text-[var(--color-txt)] leading-relaxed">
          <p>
            At the smallest fleet size <span className="font-mono font-bold">N = {summary.smallN}</span>,{' '}
            <span style={{ color: POLICIES[summary.smallNWinner]?.color }}>
              {summary.smallNWinner === 'tie' ? 'both policies are within 1 s' : `${POLICIES[summary.smallNWinner]?.label} wins`}
            </span>{' '}
            ({summary.a}: {summary.smallN_a?.toFixed(0) ?? '—'} s vs {summary.b}: {summary.smallN_b?.toFixed(0) ?? '—'} s avg detection time).
          </p>
          <p>
            At the largest fleet size <span className="font-mono font-bold">N = {summary.largeN}</span>,{' '}
            <span style={{ color: POLICIES[summary.largeNWinner]?.color }}>
              {summary.largeNWinner === 'tie' ? 'both policies are within 1 s' : `${POLICIES[summary.largeNWinner]?.label} wins`}
            </span>{' '}
            ({summary.a}: {summary.largeN_a?.toFixed(0) ?? '—'} s vs {summary.b}: {summary.largeN_b?.toFixed(0) ?? '—'} s avg detection time).
          </p>
          <p className="text-[var(--color-txt2)]">
            Tradeoff: risk-aware concentrates drones on the highest-scoring corridors,
            which improves response on those roads at the cost of leaving low-risk roads
            unpatrolled when the fleet is small. Uniform pays a coverage tax on
            high-risk roads but never abandons any single corridor.
          </p>
        </div>
      )}
    </div>
  )
}
