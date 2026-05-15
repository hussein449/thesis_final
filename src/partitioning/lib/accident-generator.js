/**
 * Accident Event Generator — Simplified UAV-IoT Accident Simulation Model
 * =======================================================================
 *
 * Implements §4 ("Risk to Section-Time Accident Rate") and §5
 * ("Generation of Accident Time and Location") of the model report.
 *
 * §4 — Split the corridor-wide daily total equally across the B = 5 time
 *       slots, then distribute each slot's share across sections in
 *       proportion to the manual risk score R_{i,b}:
 *
 *         λ_day_b      = λ_day_total / B
 *         P(i | b)     = (R_{i,b} + ε) / Σ_n (R_{n,b} + ε)
 *         λ_day_{i,b}  = λ_day_b · P(i | b)
 *
 * §5 — Generate concrete events per day:
 *         N_{i,b}(d)  ~  Poisson(λ_day_{i,b})
 *         τ_k         ~  U(t_start_b, t_end_b)   (time of day in hours)
 *         s_k         ~  U(s_start_i, s_end_i)   (km along the corridor)
 *
 *       Each accident is stored as a tuple (τ_k, i_k, s_k).
 *
 * Inputs are expected to come from risk-scoring.js: the N × B riskMatrix
 * and the corridor-wide dailyTotal. RNG is seedable via makeRng() from
 * detection-sim.js so trials are reproducible.
 */

import { TIME_SLOTS } from './risk-scoring'

/**
 * Smoothing constant added to every R_{i,b} so a section with all-zero
 * scores still has positive probability of being chosen. The report
 * suggests 0.05 (used by default) or 1.0 (when T, C, M are integer-only
 * and you want all sections roughly equal-weighted).
 */
export const EPSILON_DEFAULT = 0.05

// ---------------------------------------------------------------------------
// §4 — Section-Time accident rate distribution
// ---------------------------------------------------------------------------

/**
 * Normalised risk per (section, time slot): P(i | b).
 * Returns one row per section with a P array of length B (one entry per
 * time slot). Column sums across sections equal 1 for every slot.
 */
export function computeSlotProbabilities(riskMatrix, epsilon = EPSILON_DEFAULT) {
  if (!Array.isArray(riskMatrix) || riskMatrix.length === 0) {
    throw new Error('riskMatrix must be a non-empty array')
  }
  const numSlots = TIME_SLOTS.length
  const slotSums = new Array(numSlots).fill(0)
  for (const row of riskMatrix) {
    for (let b = 0; b < numSlots; b++) {
      slotSums[b] += row.R[b] + epsilon
    }
  }
  return riskMatrix.map((row) => ({
    sectionIndex: row.sectionIndex,
    sStart: row.sStart,
    sEnd: row.sEnd,
    P: row.R.map((rib, b) => (rib + epsilon) / slotSums[b]),
  }))
}

/**
 * Per-section per-slot daily Poisson rate λ_day_{i,b}.
 * Each row carries an array `lambda[b]` of length B.
 *   λ_day_{i,b} = (λ_day_total / B) · P(i | b)
 */
export function computeSectionTimeSlotRates(dailyTotal, slotProbabilities) {
  if (dailyTotal < 0) throw new Error('dailyTotal must be non-negative')
  const perSlotTotal = dailyTotal / TIME_SLOTS.length
  return slotProbabilities.map((row) => ({
    sectionIndex: row.sectionIndex,
    sStart: row.sStart,
    sEnd: row.sEnd,
    lambda: row.P.map((p) => perSlotTotal * p),
  }))
}

// ---------------------------------------------------------------------------
// §5 — Accident event generation
// ---------------------------------------------------------------------------

/**
 * Knuth's algorithm for Poisson(λ). Adequate for the small λ values we
 * see per (section, slot, day) — typically well under 1.
 *   k = 0; p = 1
 *   do { k++; p *= U; } while (p > exp(-λ))
 *   return k - 1
 */
export function samplePoisson(lambda, rng) {
  if (lambda < 0) throw new Error('lambda must be non-negative')
  if (lambda === 0) return 0
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L)
  return k - 1
}

/**
 * Generate every accident event for one calendar day, given the per-
 * (section, slot) rate matrix from computeSectionTimeSlotRates().
 *
 * Returns events sorted by time of day. Each event is a tuple:
 *   {
 *     id:            'D{day}_{n}'           unique within the run
 *     day:           integer day number
 *     timeSlot:      1..5
 *     sectionIndex:  1..N
 *     tau:           hour of day in [t_start_b, t_end_b], e.g. 8.25
 *     s:             km along the corridor in [s_start_i, s_end_i]
 *   }
 */
export function generateAccidentsForDay(rateMatrix, day, rng) {
  const events = []
  let seq = 1
  for (const row of rateMatrix) {
    for (let b = 0; b < TIME_SLOTS.length; b++) {
      const slot = TIME_SLOTS[b]
      const lam = row.lambda[b]
      const n = samplePoisson(lam, rng)
      for (let k = 0; k < n; k++) {
        const tau = slot.startHour + rng() * (slot.endHour - slot.startHour)
        const s = row.sStart + rng() * (row.sEnd - row.sStart)
        events.push({
          id: `D${day}_${seq++}`,
          day,
          timeSlot: slot.index,
          sectionIndex: row.sectionIndex,
          tau,
          s,
        })
      }
    }
  }
  events.sort((a, b) => a.tau - b.tau)
  return events
}

/**
 * Format an hour-of-day float as "HH:MM" (per the report's example
 * "τ = 8.25 → 08:15").
 */
export function formatHour(hour) {
  const h = Math.floor(hour) % 24
  const m = Math.floor((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Top-level: from risk model → list of accident events
// ---------------------------------------------------------------------------

/**
 * Run the full §4 + §5 pipeline over `days` consecutive days.
 *
 *   args:
 *     riskMatrix  — output of risk-scoring.computeRiskMatrix()
 *     dailyTotal  — output of risk-scoring.dailyAccidentRate(annual)
 *     days        — integer ≥ 1 (default 1)
 *     rng         — seedable function returning [0, 1) (e.g. makeRng(seed))
 *     epsilon     — smoothing constant for P(i|b)
 *
 *   returns:
 *     {
 *       slotProbabilities: [{ sectionIndex, sStart, sEnd, P[B] }, …],
 *       rateMatrix:        [{ sectionIndex, sStart, sEnd, lambda[B] }, …],
 *       events:            [(τ, i, s) tuples, sorted by (day, tau)]
 *     }
 */
export function generateAccidents({
  riskMatrix,
  dailyTotal,
  days = 1,
  rng,
  epsilon = EPSILON_DEFAULT,
}) {
  if (typeof rng !== 'function') {
    throw new Error('rng must be a function returning a number in [0, 1)')
  }
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('days must be a positive integer')
  }
  const slotProbabilities = computeSlotProbabilities(riskMatrix, epsilon)
  const rateMatrix = computeSectionTimeSlotRates(dailyTotal, slotProbabilities)
  const events = []
  for (let d = 1; d <= days; d++) {
    events.push(...generateAccidentsForDay(rateMatrix, d, rng))
  }
  return { slotProbabilities, rateMatrix, events }
}
