/**
 * Allocation Policies
 * ===================
 *
 * Two policies compared in this thesis:
 *
 *   - Uniform:    each road gets ⌊N/R⌋ drones, with leftover drones assigned
 *                 to the longest roads (length is a sensible tie-breaker
 *                 because longer roads need more coverage capacity).
 *                 [DESIGN choice; no external source claimed.]
 *
 *   - Risk-aware: drones are distributed proportional to each road's
 *                 composite risk score, using the largest-remainder
 *                 (Hamilton) apportionment method to guarantee integer
 *                 counts that sum exactly to N.
 *
 *                 Hamilton's largest-remainder method dates to
 *                 Hamilton 1792 (used for U.S. House apportionment until
 *                 1900); the algorithm is described in
 *                 Balinski & Young, "Fair Representation: Meeting the Ideal
 *                 of One Man, One Vote" (Yale, 1982).
 *
 *                 The same risk score is computed in
 *                 src/partitioning/lib/roads.js (custom multi-criteria
 *                 heuristic — see that file for the citation note).
 *
 * Both policies return an array of { road, drones } in the same shape, so
 * the simulation engine treats them identically.
 */

import { ROADS, computeRiskScore } from '../../partitioning/lib/roads'

// ---------------------------------------------------------------------------
// Uniform allocation
// ---------------------------------------------------------------------------

export function allocateUniform(totalDrones, roads = ROADS) {
  const R = roads.length
  if (R === 0 || totalDrones <= 0) {
    return roads.map((road) => ({ road, drones: 0, score: computeRiskScore(road) }))
  }

  const base = Math.floor(totalDrones / R)
  let leftover = totalDrones - base * R

  // Tie-breaker for leftover drones: longest road first.
  const order = roads
    .map((road, idx) => ({ road, idx, length: road.lengthKm }))
    .sort((a, b) => b.length - a.length)

  const counts = new Array(R).fill(base)
  for (let i = 0; i < leftover; i++) {
    counts[order[i].idx] += 1
  }

  return roads.map((road, idx) => ({
    road,
    drones: counts[idx],
    score: computeRiskScore(road),
  }))
}

// ---------------------------------------------------------------------------
// Risk-aware allocation (Hamilton method)
// ---------------------------------------------------------------------------

export function allocateRiskAware(totalDrones, roads = ROADS) {
  if (roads.length === 0 || totalDrones <= 0) {
    return roads.map((road) => ({ road, drones: 0, score: computeRiskScore(road) }))
  }

  const scored = roads.map((road) => ({ road, score: computeRiskScore(road) }))
  const totalScore = scored.reduce((s, x) => s + x.score, 0) || 1

  const items = scored.map((x) => {
    const exact = (x.score / totalScore) * totalDrones
    return {
      road: x.road,
      score: x.score,
      exact,
      drones: Math.floor(exact),
      frac: exact - Math.floor(exact),
    }
  })

  let remaining = totalDrones - items.reduce((s, i) => s + i.drones, 0)
  const byFrac = [...items].sort((a, b) => b.frac - a.frac)
  for (let i = 0; i < remaining; i++) {
    byFrac[i].drones += 1
  }

  return items.map(({ road, score, drones }) => ({ road, score, drones }))
}

// ---------------------------------------------------------------------------
// Public registry
// ---------------------------------------------------------------------------

export const POLICIES = {
  uniform: {
    key: 'uniform',
    label: 'Uniform',
    color: '#1D4ED8',
    description:
      'Equal drones per road; leftover drones go to the longest roads first.',
    allocate: allocateUniform,
  },
  riskAware: {
    key: 'riskAware',
    label: 'Risk-aware',
    color: '#f97316',
    description:
      'Hamilton method on a composite risk score (accidents/km, AADT, speed, condition).',
    allocate: allocateRiskAware,
  },
}
