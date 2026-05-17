/**
 * UAV Motion + IoT Alert Detection — §7-§11 of the Simplified UAV-IoT Model
 * =========================================================================
 *
 * Implements:
 *
 *   §7-§8   Closed-form back-and-forth motion within a patrol segment:
 *           q_m(τ) = (v·τ) mod (2·L_m)
 *           position = A_m + q              if q ≤ L_m
 *                    = B_m - (q - L_m)      otherwise (return leg)
 *           direction = +1 if q ≤ L_m else -1
 *
 *   §9      IoT overlap interval between a UAV's patrol segment [A_j, B_j]
 *           and the accident's IoT signal zone [s_k - R_IoT, s_k + R_IoT]:
 *             overlapStart = max(A_j, s_k - R_IoT)
 *             overlapEnd   = min(B_j, s_k + R_IoT)
 *           If overlapStart > overlapEnd the UAV cannot receive the alert
 *           during normal patrol.
 *
 *   §10     Candidate set: only test patrol segments m-1, m, m+1, where
 *           m is the segment that contains the accident position.
 *
 *   §11     Alert time for one candidate UAV — five cases based on the
 *           UAV's current position s_j and direction dir_j relative to the
 *           overlap interval [O_start, O_end]:
 *             Case 1  s_j ∈ [O_start, O_end]          T_alert = 0
 *             Case 2  s_j < O_start, dir = +1         T_alert = (O_start - s_j)/v
 *             Case 3  s_j < O_start, dir = -1         T_alert = ((s_j - A_j) + (O_start - A_j))/v
 *             Case 4  s_j > O_end,   dir = -1         T_alert = (s_j - O_end)/v
 *             Case 5  s_j > O_end,   dir = +1         T_alert = ((B_j - s_j) + (B_j - O_end))/v
 *
 *   §12     Final detection time:
 *             T_alert(k) = min over j ∈ {m-1, m, m+1} of T_alert_{j,k}
 *
 * All distances are in METERS along the corridor; speed in m/s; time in
 * seconds. This is a parallel implementation of the canonical PDF model,
 * suitable for closed-form validation and for replacing the current
 * optical sensing-radius detector in the simulation engine.
 */

import { patrolSegmentIndexAt } from '../../partitioning/lib/uav-segments'

// ---------------------------------------------------------------------------
// §7-§8 — Back-and-forth motion
// ---------------------------------------------------------------------------

/**
 * Position and direction of UAV m at time τ (seconds since the start of
 * its patrol). Assumes the UAV is at A_m at τ = 0 and initially moving
 * toward B_m. Add an offset to τ if you want a different starting phase.
 *
 *   segment: { A, B }  in meters
 *   t:       seconds
 *   v:       speed in m/s
 *
 * Returns { position, direction, q, L } — q is the patrol-phase variable,
 * L is the segment length (both meters), useful for inspection.
 */
export function patrolPositionAndDirection(segment, t, v) {
  const { A, B } = segment
  const L = B - A
  const period = 2 * L
  const raw = v * t
  const q = ((raw % period) + period) % period
  if (q <= L) return { position: A + q, direction: +1, q, L }
  return { position: B - (q - L), direction: -1, q, L }
}

// ---------------------------------------------------------------------------
// §9 — IoT overlap interval
// ---------------------------------------------------------------------------

/**
 * Overlap between UAV patrol segment [A_j, B_j] and accident IoT signal
 * zone [s_k - R_IoT, s_k + R_IoT]. Returns null if disjoint.
 */
export function iotOverlapInterval(segment, sk, R_IoT) {
  const start = Math.max(segment.A, sk - R_IoT)
  const end = Math.min(segment.B, sk + R_IoT)
  if (start > end) return null
  return { start, end }
}

// ---------------------------------------------------------------------------
// §11 — Alert time per candidate UAV (5 cases)
// ---------------------------------------------------------------------------

/**
 * Alert time given the UAV's current position and direction directly
 * (skips the parametric motion formula — useful when integrating with a
 * stepped simulation that already tracks UAV state).
 *
 *   segment:   { A, B }
 *   sj, dj:    current position (meters) and direction (+1 or -1)
 *   sk:        accident position (meters)
 *   R_IoT:     IoT communication range (meters)
 *   v:         UAV speed (m/s)
 *
 * Returns T_alert in seconds, or null if no overlap exists.
 */
export function alertTimeForCandidateAtState({ segment, sj, dj, sk, R_IoT, v }) {
  const overlap = iotOverlapInterval(segment, sk, R_IoT)
  if (!overlap) return null
  const { A, B } = segment
  const { start: Ostart, end: Oend } = overlap

  // Case 1 — already inside the overlap.
  if (sj >= Ostart && sj <= Oend) return 0

  // Cases 2/3 — UAV is before the overlap.
  if (sj < Ostart) {
    if (dj === +1) return (Ostart - sj) / v                       // case 2
    return ((sj - A) + (Ostart - A)) / v                          // case 3
  }

  // Cases 4/5 — UAV is after the overlap.
  if (dj === -1) return (sj - Oend) / v                           // case 4
  return ((B - sj) + (B - Oend)) / v                              // case 5
}

/**
 * Alert time using the parametric motion formula. Convenience wrapper
 * that computes (s_j, dir_j) from t via patrolPositionAndDirection().
 */
export function alertTimeForCandidate({ segment, sk, R_IoT, v, t }) {
  const { position, direction } = patrolPositionAndDirection(segment, t, v)
  return alertTimeForCandidateAtState({
    segment, sj: position, dj: direction, sk, R_IoT, v,
  })
}

// ---------------------------------------------------------------------------
// §10 + §12 — Three-candidate detection time
// ---------------------------------------------------------------------------

/**
 * Compute the accident's final detection time using the canonical IoT
 * model: identify the patrol segment m that contains s_k, test the
 * three candidate segments j ∈ {m-1, m, m+1} (invalid indices ignored),
 * and return the minimum alert time across EVERY drone in those
 * segments — supporting Risk-aware stacking where one segment may
 * contain multiple drones.
 *
 *   segments:  array of patrol segments [{ index, A, B, ... }, ...]
 *   uavStates: { [m]: { sj, dj } | [{ sj, dj }, ...] }  current state(s)
 *              of UAV(s) by 1-based segment index. A single object is
 *              treated as a length-1 list for backward compatibility
 *              with un-stacked configurations. If omitted, the
 *              parametric motion formula is used with t (defaults to 0).
 *   sk:        accident position in meters
 *   R_IoT:     IoT range in meters
 *   v:         UAV speed in m/s
 *   t:         time at which the accident occurs (used only when
 *              uavStates is omitted)
 *
 * Returns:
 *   {
 *     candidate:    m | null,         segment that owns the accident
 *     responder:    m | null,         segment index of the winning UAV
 *     responderStackIdx: number|null, 0-based index of winning drone
 *                                     WITHIN its segment's stack (0 if
 *                                     the segment has only 1 drone).
 *     tAlert:       seconds | null,   min alert time across candidates
 *     per:          [{ m, tAlert }],  one entry per drone tested
 *   }
 */
export function computeIotDetection({
  segments, uavStates, sk, R_IoT, v, t = 0,
}) {
  const m = patrolSegmentIndexAt(segments, sk)
  if (m < 0) {
    return { candidate: null, responder: null, responderStackIdx: null, tAlert: null, per: [] }
  }
  const candidateIndices = [m - 1, m, m + 1].filter(
    (j) => j >= 1 && j <= segments.length
  )
  const per = []
  let best = { m: null, stackIdx: null, tAlert: null }
  for (const j of candidateIndices) {
    const segment = segments[j - 1]
    const raw = uavStates?.[j]
    // Normalise to a list: undefined → [], single obj → [obj], list → list.
    const stateList = raw == null
      ? null
      : Array.isArray(raw) ? raw : [raw]

    if (stateList == null) {
      // No live drone snapshot for this segment → fall back to the
      // parametric motion model. Single notional drone per segment.
      const tAlert = alertTimeForCandidate({ segment, sk, R_IoT, v, t })
      per.push({ m: j, stackIdx: 0, tAlert })
      if (tAlert != null && (best.tAlert == null || tAlert < best.tAlert)) {
        best = { m: j, stackIdx: 0, tAlert }
      }
    } else {
      // Live snapshots — evaluate every stacked drone in this segment.
      for (let k = 0; k < stateList.length; k++) {
        const st = stateList[k]
        const tAlert = alertTimeForCandidateAtState({
          segment, sj: st.sj, dj: st.dj, sk, R_IoT, v,
        })
        per.push({ m: j, stackIdx: k, tAlert })
        if (tAlert != null && (best.tAlert == null || tAlert < best.tAlert)) {
          best = { m: j, stackIdx: k, tAlert }
        }
      }
    }
  }
  return {
    candidate: m,
    responder: best.m,
    responderStackIdx: best.stackIdx,
    tAlert: best.tAlert,
    per,
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Default IoT communication range in meters. 200 m is the simulation
 * default — deliberately well below the deployed Ra-02 LoRa radio's
 * physical maximum so that R_IoT acts as the binding constraint on
 * detection. This makes the policy comparisons and sensitivity sweeps
 * informative; at realistic LoRa ranges (km-scale) the alert zone
 * dominates the corridor and detection collapses to nearest-UAV
 * geometry. Override via params.sensingRange.
 */
export const DEFAULT_R_IOT = 200
