/**
 * Manual Risk Scoring — Simplified UAV-IoT Accident Simulation Model
 * ==================================================================
 *
 * Implements §2 ("Historical Data to Total Daily Accident Rate") and §3
 * ("Manual Risk Calculation by Section and Time Slot") of the model
 * report (May 13, 2026).
 *
 * §2 — Daily corridor rate from historical annual count
 *   d_total_per_day = N_hist_year / 365
 *
 * §3 — Per-section, per-time-slot risk score
 *   For each highway section i and time slot b:
 *     R_{i,b} = a_b · T_i + c_b · C_i + m_b · M_i
 *   where:
 *     T_i ∈ {0, 1, 2}   traffic intensity in section i
 *     C_i ∈ {0, 1, 2}   curvature risk in section i
 *     M_i ∈ {0, 1, 2}   merging / entrance / exit risk in section i
 *     a_b, c_b, m_b     time-slot weights (see WEIGHTS table)
 *
 * Note: highway sections (S_i) are the 1-km partition produced by
 * sections.js. They are NOT UAV patrol segments.
 */

import { buildSections, DEFAULT_SECTION_LENGTH_KM } from './sections'
import { buildRoadPath, positionAt } from '../../lib/geometry'

// ---------------------------------------------------------------------------
// Time slots and weight table (verbatim from §3 of the model report)
// ---------------------------------------------------------------------------

/** Five time slots that divide the 24-hour day, indexed 1..5. */
export const TIME_SLOTS = [
  { index: 1, label: 'Night / early morning', startHour: 0,  endHour: 6  },
  { index: 2, label: 'Morning rush',          startHour: 6,  endHour: 10 },
  { index: 3, label: 'Normal day',            startHour: 10, endHour: 16 },
  { index: 4, label: 'Evening rush',          startHour: 16, endHour: 20 },
  { index: 5, label: 'Late evening',          startHour: 20, endHour: 24 },
]

/**
 * Weights of the three risk components per time slot.
 *   a — traffic weight
 *   c — curvature weight
 *   m — merging weight
 * Each row sums to 1.0, so R_{i,b} ∈ [0, 2·(a+c+m)] = [0, 2].
 *
 * Rationale (from the report):
 *   At night, curvature matters more because of speed and visibility.
 *   During rush hours, traffic and merging dominate because of congestion,
 *   entrances, exits, and lane changes.
 */
export const WEIGHTS = {
  1: { a: 0.20, c: 0.50, m: 0.30 }, // Night / early morning
  2: { a: 0.50, c: 0.20, m: 0.30 }, // Morning rush
  3: { a: 0.40, c: 0.30, m: 0.30 }, // Normal day
  4: { a: 0.50, c: 0.20, m: 0.30 }, // Evening rush
  5: { a: 0.30, c: 0.40, m: 0.30 }, // Late evening
}

/** Time slot whose [startHour, endHour) interval contains `hour` (0..24). */
export function timeSlotForHour(hour) {
  for (const slot of TIME_SLOTS) {
    if (hour >= slot.startHour && hour < slot.endHour) return slot
  }
  // hour = 24 belongs to the last slot
  return TIME_SLOTS[TIME_SLOTS.length - 1]
}

// ---------------------------------------------------------------------------
// §2 — Historical data → daily corridor rate
// ---------------------------------------------------------------------------

/**
 * Total expected severe accidents per day across the whole corridor.
 * This is the only place where historical annual data enters the model;
 * spatial distribution comes from R_{i,b} (§3 + §4).
 */
export function dailyAccidentRate(annualAccidents) {
  if (annualAccidents < 0) throw new Error('annualAccidents must be non-negative')
  return annualAccidents / 365
}

// ---------------------------------------------------------------------------
// §3 — R_{i,b} = a_b·T_i + c_b·C_i + m_b·M_i
// ---------------------------------------------------------------------------

function validateScore(name, x) {
  if (!Number.isInteger(x) || x < 0 || x > 2) {
    throw new Error(`${name} must be an integer in {0, 1, 2}, got ${x}`)
  }
}

/**
 * Compute R_{i,b} for one section in one time slot.
 *   scores: { T, C, M } with each ∈ {0, 1, 2}
 *   timeSlotIndex: 1..5
 */
export function computeSectionRisk(scores, timeSlotIndex) {
  validateScore('T', scores.T)
  validateScore('C', scores.C)
  validateScore('M', scores.M)
  const w = WEIGHTS[timeSlotIndex]
  if (!w) throw new Error(`Invalid time slot ${timeSlotIndex}; expected 1..5`)
  return w.a * scores.T + w.c * scores.C + w.m * scores.M
}

/**
 * Compute the full N × B risk matrix R_{i,b}.
 *   sectionScores: array of { sectionIndex, sStart, sEnd, T, C, M }
 *   returns: array of { sectionIndex, sStart, sEnd, T, C, M, R: [r1, r2, r3, r4, r5] }
 * where R[b - 1] is the score for time slot b.
 */
export function computeRiskMatrix(sectionScores) {
  return sectionScores.map((s) => ({
    sectionIndex: s.sectionIndex,
    sStart: s.sStart,
    sEnd: s.sEnd,
    T: s.T,
    C: s.C,
    M: s.M,
    R: TIME_SLOTS.map((slot) => computeSectionRisk(s, slot.index)),
  }))
}

// ---------------------------------------------------------------------------
// Default T / C / M scoring for the M51 Khalde → Awali corridor
// ---------------------------------------------------------------------------
//
// The model report leaves T_i, C_i, M_i to be assigned manually. The
// defaults below are a reasonable starting point derived from the
// corridor's geometry and known interchange list. They can be overridden
// per section by editing the returned array.

/**
 * Major merging events on the Khalde → Awali stretch, in km from Khalde.
 * Score 2 marks a major interchange (multiple lanes joining/leaving);
 * score 1 marks a simple on/off ramp. Sections that overlap a POI inherit
 * its score; sections with no nearby POI keep M_i = 0.
 */
const MERGE_POIS_KM = [
  { km: 0.0,  label: 'Khalde interchange',  score: 2 },
  { km: 4.5,  label: 'Damour approach ramps', score: 1 },
  { km: 9.5,  label: 'Damour exit ramps',   score: 1 },
  { km: 13.5, label: 'Jiyeh on/off',        score: 1 },
  { km: 17.0, label: 'Saadiyat on/off',     score: 1 },
  { km: 20.5, label: 'Rmeileh approach',    score: 1 },
  { km: 24.0, label: 'Rmeileh exit',        score: 1 },
  { km: 27.0, label: 'Awali bridge approach', score: 2 },
]

function defaultTrafficScore(midKm, corridorLengthKm) {
  // U-shaped traffic profile for M51 Khalde → Awali:
  //   - Khalde end (km 0–5): heavy Beirut commuter load + suburban
  //     traffic feeding the corridor → T = 2.
  //   - Awali end (km 22–28): Saida local traffic + Awali-bridge
  //     approach + entry to Saida proper → T = 2.
  //   - Middle (km 5–22, Damour ↔ Rmeileh): open inter-urban motorway
  //     between rural villages, no major commuter load, no major
  //     interchanges along most of this stretch → T = 0. The earlier
  //     scoring used T = 1 here, but ground truth is closer to "open
  //     motorway with sparse local traffic" than "moderate urban
  //     traffic" — dropping to 0 makes the rush-hour U-shape match
  //     the corridor's actual geography. Side effect: end-section
  //     fraction of slot-2 accidents rises from ~43 % to ~70 %, which
  //     gives Risk-aware a real hot-spot to exploit.
  const frac = midKm / corridorLengthKm
  if (frac < 0.18) return 2
  if (frac < 0.78) return 0
  return 2
}

function defaultMergingScore(sStartKm, sEndKm) {
  // Section "owns" a POI if the POI falls within its [sStart, sEnd] band,
  // OR within 0.5 km of either boundary (so a ramp straddling two
  // adjacent 1-km sections is captured by both).
  let best = 0
  for (const poi of MERGE_POIS_KM) {
    if (poi.km >= sStartKm - 0.5 && poi.km <= sEndKm + 0.5) {
      if (poi.score > best) best = poi.score
    }
  }
  return best
}

/**
 * Curvature score from the road polyline: total absolute heading change
 * accumulated within the section, sampled at ~100 m steps.
 *   > 18° total turn → 2 (sharp curve)
 *   >  7° total turn → 1 (mild curve)
 *   else            → 0 (straight)
 */
function defaultCurvatureScore(path, sStartM, sEndM) {
  const step = 100
  let prevAngle = null
  let totalChange = 0
  for (let s = sStartM; s <= sEndM - step; s += step) {
    const [x1, y1] = positionAt(path, s)
    const [x2, y2] = positionAt(path, Math.min(path.totalLength, s + step))
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
    if (prevAngle !== null) {
      let diff = angle - prevAngle
      while (diff >  180) diff -= 360
      while (diff < -180) diff += 360
      totalChange += Math.abs(diff)
    }
    prevAngle = angle
  }
  if (totalChange > 18) return 2
  if (totalChange >  7) return 1
  return 0
}

/**
 * Build default { T, C, M } scores for every 1-km section of the given
 * road. Pure function — callers are free to mutate or override entries
 * before passing the result to computeRiskMatrix().
 *
 * Returns an array of:
 *   { sectionIndex, sStart, sEnd, length, T, C, M }
 */
export function defaultSectionScores(road, sectionLengthKm = DEFAULT_SECTION_LENGTH_KM) {
  const path = buildRoadPath(road)
  const sections = buildSections(road.lengthKm, sectionLengthKm)
  return sections.map((sec) => {
    const midKm = (sec.sStart + sec.sEnd) / 2
    // Curvature: if the road declares a manual sectionCurvature array,
    // prefer that — it overrides the polyline-derived heuristic, which
    // is unreliable on coarsely-simplified geometries (the M51 polyline
    // has only 13 vertices, so most real road curves fall between
    // straight chords and would score 0 otherwise).
    const manualC = road.sectionCurvature?.[sec.index - 1]
    const C = (Number.isInteger(manualC) && manualC >= 0 && manualC <= 2)
      ? manualC
      : defaultCurvatureScore(path, sec.sStart * 1000, sec.sEnd * 1000)
    return {
      sectionIndex: sec.index,
      sStart: sec.sStart,
      sEnd: sec.sEnd,
      length: sec.length,
      T: defaultTrafficScore(midKm, road.lengthKm),
      C,
      M: defaultMergingScore(sec.sStart, sec.sEnd),
    }
  })
}

/**
 * One-call helper: from a road object, return the daily corridor rate AND
 * the full N × B risk matrix using the default T / C / M heuristic.
 */
export function buildCorridorRiskModel(road, sectionLengthKm = DEFAULT_SECTION_LENGTH_KM) {
  const scores = defaultSectionScores(road, sectionLengthKm)
  return {
    dailyTotal: dailyAccidentRate(road.accidents),
    sectionScores: scores,
    riskMatrix: computeRiskMatrix(scores),
    timeSlots: TIME_SLOTS,
    weights: WEIGHTS,
  }
}
