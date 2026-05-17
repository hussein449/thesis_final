/**
 * UAV Patrol Segmentation — §6 of the Simplified UAV-IoT Model
 * ============================================================
 *
 * Two modes:
 *
 *   §6.1  Uniform patrol — divide the corridor of length L into M equal
 *         segments. Each UAV gets the same road length:
 *           A_m = (m-1) · L / M     B_m = m · L / M
 *
 *   §6.2  Risk-aware patrol — group the 1-km highway sections so each UAV
 *         segment carries roughly equal cumulative risk. Per-section risk
 *         is averaged across the B = 5 time slots:
 *           R_i = (1/B) · Σ_b R_{i,b}
 *         Greedy left-to-right walk: keep adding sections to the current
 *         UAV segment until its cumulative risk reaches totalRisk / M;
 *         then start a new segment. The boundary section is included or
 *         excluded based on whichever side is closer to the target.
 *
 * Both return arrays of { index, A, B, length } in METERS along the
 * corridor — same units the detection sim uses. Risk-aware segments
 * additionally carry { sectionStart, sectionEnd, riskTotal, riskAverage }.
 *
 * Note: UAV patrol segments [A_m, B_m] are distinct from the 1-km highway
 * sections S_i defined by sections.js. A patrol segment groups one or more
 * adjacent highway sections; sections are the unit of risk scoring and
 * accident generation, segments are the unit of UAV assignment.
 */

/**
 * §6.1 — Equal-length patrol segmentation.
 * Divides [0, corridorLengthM] into M segments, each of length L/M. Each
 * segment gets exactly one drone (droneCount = 1) — Uniform never
 * stacks; that's its definitional "no-info" property.
 */
export function buildUniformSegments(corridorLengthM, M) {
  if (corridorLengthM <= 0) throw new Error('corridorLengthM must be positive')
  if (!Number.isInteger(M) || M < 1) throw new Error('M must be a positive integer')
  const segLen = corridorLengthM / M
  const segments = []
  for (let m = 1; m <= M; m++) {
    segments.push({
      index: m,
      A: (m - 1) * segLen,
      B: m * segLen,
      length: segLen,
      droneCount: 1,
    })
  }
  return segments
}

/**
 * §6.2 — Equal-cumulative-risk patrol segmentation with stacking.
 *
 *   sections     — output of buildSections(road.lengthKm) [{ index, sStart, sEnd, ... }]
 *                  sStart / sEnd are in km.
 *   riskMatrix   — output of computeRiskMatrix(sectionScores) — each row
 *                  has an R array of length B (one entry per time slot).
 *   M            — total number of drones to deploy on this road.
 *
 * Two-stage allocation:
 *   1. Build up to min(M, N_sections) BASE segments using the existing
 *      greedy equal-cumulative-risk walk, target = totalRisk / effectiveM.
 *      Each base segment is guaranteed at least one drone.
 *   2. If M > N_sections (i.e. we have more drones than sections), the
 *      EXCESS (M - N_sections) drones are distributed across the 28 base
 *      segments by Hamilton's largest-remainder method, weighted by each
 *      segment's mean risk. Hot-spot segments end up with multiple drones
 *      (droneCount > 1); low-risk segments stay at 1. Each segment's
 *      droneCount is attached so callers can size the drone-state pool.
 *
 * Returns segments with the same shape as buildUniformSegments() plus
 *   { sectionStart, sectionEnd, riskTotal, riskAverage, droneCount }
 * where sectionStart/sectionEnd are inclusive 1-based section indices.
 */
export function buildRiskAwareSegments(sections, riskMatrix, M) {
  if (!Array.isArray(sections) || sections.length === 0) {
    throw new Error('sections must be a non-empty array')
  }
  if (!Array.isArray(riskMatrix) || riskMatrix.length !== sections.length) {
    throw new Error('riskMatrix must have one row per section')
  }
  if (!Number.isInteger(M) || M < 1) throw new Error('M must be a positive integer')
  // Cap base segments so each gets at least one section.
  const effectiveM = Math.min(M, sections.length)

  // R_i — average over time slots for each section.
  const meanRisks = riskMatrix.map((row) => {
    if (!Array.isArray(row.R) || row.R.length === 0) return 0
    return row.R.reduce((a, b) => a + b, 0) / row.R.length
  })
  const totalRisk = meanRisks.reduce((a, b) => a + b, 0)
  const target = totalRisk / effectiveM

  const segments = []
  let curStart = 0 // 0-based section index
  for (let m = 1; m <= effectiveM; m++) {
    let i = curStart
    let r = 0
    if (m === effectiveM) {
      // Last segment owns everything remaining.
      i = sections.length
      r = meanRisks.slice(curStart, i).reduce((a, b) => a + b, 0)
    } else {
      while (i < sections.length && r + meanRisks[i] < target) {
        r += meanRisks[i]
        i++
      }
      // Decide whether the boundary section belongs to this segment or
      // the next: pick whichever choice gets r closer to the target.
      if (i < sections.length) {
        const withIt = r + meanRisks[i]
        const without = r
        if (Math.abs(withIt - target) <= Math.abs(without - target)) {
          r = withIt
          i++
        }
      }
      // Ensure forward progress.
      if (i === curStart) {
        r += meanRisks[i] ?? 0
        i++
      }
      // Leave at least one section per remaining segment.
      const sectionsLeft = sections.length - i
      const segmentsLeft = effectiveM - m
      if (sectionsLeft < segmentsLeft) {
        const give = segmentsLeft - sectionsLeft
        for (let k = 0; k < give; k++) {
          i--
          r -= meanRisks[i] ?? 0
        }
      }
    }
    const A = sections[curStart].sStart * 1000
    const B = sections[i - 1].sEnd * 1000
    segments.push({
      index: m,
      A,
      B,
      length: B - A,
      sectionStart: sections[curStart].index,
      sectionEnd: sections[i - 1].index,
      riskTotal: r,
      riskAverage: r / (i - curStart),
      droneCount: 1, // base allocation — overwritten below if M > effectiveM
    })
    curStart = i
  }

  // Stage 2 — distribute excess drones (M > effectiveM) across base
  // segments by Hamilton's largest-remainder on riskAverage. Each
  // segment keeps its base 1 + Hamilton-assigned extras.
  if (M > effectiveM) {
    const extras = M - effectiveM
    const totalSegRisk = segments.reduce((s, x) => s + x.riskAverage, 0) || 1
    const items = segments.map((seg, idx) => {
      const exact = (seg.riskAverage / totalSegRisk) * extras
      return {
        idx,
        exact,
        extra: Math.floor(exact),
        frac: exact - Math.floor(exact),
      }
    })
    let remaining = extras - items.reduce((s, x) => s + x.extra, 0)
    // Largest-remainder tie-break: higher riskAverage first if fracs are
    // equal, so the hottest segments get the marginal drone.
    const byFrac = [...items].sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac
      return segments[b.idx].riskAverage - segments[a.idx].riskAverage
    })
    for (let k = 0; k < remaining; k++) byFrac[k].extra += 1
    for (const it of items) {
      segments[it.idx].droneCount = 1 + it.extra
    }
  }

  return segments
}

/**
 * Top-level entry — pick uniform vs. risk-aware by `mode`.
 *
 *   mode:               'uniform' | 'risk-aware'
 *   corridorLengthM:    total road length in meters (used by uniform)
 *   M:                  number of UAVs
 *   sections:           required for 'risk-aware'
 *   riskMatrix:         required for 'risk-aware'
 */
export function buildPatrolSegments({ mode, corridorLengthM, M, sections, riskMatrix }) {
  if (mode === 'uniform') return buildUniformSegments(corridorLengthM, M)
  if (mode === 'risk-aware' || mode === 'riskAware') {
    return buildRiskAwareSegments(sections, riskMatrix, M)
  }
  throw new Error(`Unknown patrol mode: ${mode}`)
}

/**
 * Find the 1-based patrol-segment index that contains position s (meters
 * from corridor start). Returns -1 if s is outside every segment.
 *
 * Used in §10 to find the segment m of an accident position, so we can
 * pick the candidate UAV set { m-1, m, m+1 }.
 *
 * Boundary convention mirrors sections.js: half-open [A, B) intervals,
 * with the last segment closed on the right so s = corridorLength is
 * included.
 */
export function patrolSegmentIndexAt(segments, s) {
  if (segments.length === 0) return -1
  const last = segments[segments.length - 1]
  if (s < segments[0].A) return -1
  if (s > last.B) return -1
  if (s === last.B) return last.index
  for (const seg of segments) {
    if (s >= seg.A && s < seg.B) return seg.index
  }
  return -1
}
