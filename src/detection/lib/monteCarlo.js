/**
 * Monte Carlo Runner
 * ===================
 *
 * Sweeps the simulation across:
 *   - a list of drone-count values  (e.g., [3, 5, 7, 10, 15, 20])
 *   - both allocation policies      (Uniform, Risk-aware)
 *   - a configurable number of trials per (policy, count) combination
 *
 * Aggregates two main statistics required by the supervisor's Step 2:
 *   - average detection time
 *   - probability of detection within 2 minutes
 *
 * And from Step 3:
 *   - average drones available over time
 *   - count of missed / delayed detections
 *
 * The runner is async and yields control between trials so the UI stays
 * responsive while the sweep runs.
 */

import { simulateOnce, simulateWithDispatch } from './detection-sim'
import { POLICIES } from './policies'

const DISPATCH_RULES = ['nearest', 'batteryFirst', 'balanced']

/** Yield to the event loop so the UI can repaint. */
function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Run a full sweep. Returns an object indexed by policy key:
 *   {
 *     uniform: [{ N, avgDetectionTime, pUnder2Min, ...}, ...],
 *     riskAware: [...]
 *   }
 *
 * `onProgress(done, total)` is called periodically so the UI can show
 * progress.
 */
export async function runSweep({
  droneCounts = [3, 5, 7, 10, 15, 20],
  trialsPerPoint = 30,
  baseSeed = 42,
  params = {},
  policies = ['uniform', 'riskAware'],
  onProgress = null,
}) {
  const totalRuns = droneCounts.length * policies.length * trialsPerPoint
  let done = 0

  const results = {}
  const availabilityByPolicy = {}

  for (const policyKey of policies) {
    const policy = POLICIES[policyKey]
    const points = []
    const availabilityAccumulator = []

    for (const N of droneCounts) {
      const allocation = policy.allocate(N)

      const detectionTimes = []
      let nDetected = 0
      let nMissed = 0
      let nTotal = 0
      let nUnder2Min = 0
      let availabilitySamples = []

      // The patrol mode is a property of the policy (uniform vs. risk-aware
      // — see policies.js). Thread it through so the sim builds the right
      // patrol segments per road.
      const trialParams = { ...params, patrolMode: policy.patrolMode ?? 'uniform' }

      for (let trial = 0; trial < trialsPerPoint; trial++) {
        const seed = baseSeed + trial * 1009 + N * 7919
        const result = simulateOnce({ allocation, params: trialParams, seed })

        detectionTimes.push(...result.detectionTimes)
        nDetected += result.nDetected
        nMissed += result.nMissed
        nTotal += result.nTotal
        nUnder2Min += result.detectionTimes.filter((t) => t <= 120).length

        // Sample availability history. Target ~200 points per timeline
        // regardless of trial length, so the chart stays smooth and fast
        // whether the trial is 30 minutes or 30 days.
        const TARGET_POINTS = 200
        const stride = Math.max(1, Math.floor(result.availabilityHistory.length / TARGET_POINTS))
        if (trial === 0) {
          availabilitySamples = result.availabilityHistory
            .filter((_, i) => i % stride === 0)
            .map((p) => ({ t: p.t, sum: p.available, count: 1 }))
        } else {
          for (let i = 0; i < availabilitySamples.length; i++) {
            const src = result.availabilityHistory[i * stride]
            if (src) {
              availabilitySamples[i].sum += src.available
              availabilitySamples[i].count += 1
            }
          }
        }

        done++
        if (done % 5 === 0) {
          onProgress?.(done, totalRuns)
          await nextTick()
        }
      }

      const avgDetectionTime =
        detectionTimes.length > 0
          ? detectionTimes.reduce((s, x) => s + x, 0) / detectionTimes.length
          : null

      const pUnder2Min =
        nTotal > 0 ? nUnder2Min / nTotal : 0

      const detectionRate = nTotal > 0 ? nDetected / nTotal : 0

      points.push({
        N,
        avgDetectionTime,
        pUnder2Min,
        detectionRate,
        nDetected,
        nMissed,
        nTotal,
        // Median is more robust to outliers (very long detections)
        medianDetectionTime: median(detectionTimes),
      })

      // Convert availability accumulator to per-time averaged points for
      // this fleet size.
      availabilityAccumulator.push({
        N,
        timeline: availabilitySamples.map((p) => ({
          t: p.t,
          avgAvailable: p.sum / p.count,
        })),
      })
    }

    results[policyKey] = points
    availabilityByPolicy[policyKey] = availabilityAccumulator
  }

  onProgress?.(totalRuns, totalRuns)
  return { results, availabilityByPolicy }
}

function median(arr) {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * Dispatch-rule sweep. Uses the SAME droneCounts, trialsPerPoint, and
 * params that runSweep() received from the Configure page — so the
 * dispatch comparison reflects the user's settings exactly, and only
 * runs when the user clicks "Run sweep".
 *
 * Allocation is fixed to risk-aware (the standard baseline); patrol
 * segmentation follows the risk-aware policy's patrolMode. Only the
 * dispatch rule varies across the three strategies.
 *
 *   returns: [{ N, nearest_avg, nearest_missedPct, batteryFirst_avg,
 *              batteryFirst_missedPct, balanced_avg, balanced_missedPct }, ...]
 */
export async function runDispatchSweep({
  droneCounts,
  trialsPerPoint,
  params = {},
  onProgress = null,
}) {
  const totalRuns = droneCounts.length * DISPATCH_RULES.length * trialsPerPoint
  let done = 0
  // Inject the risk-aware patrolMode the dispatch model expects.
  const dispatchParams = {
    ...params,
    patrolMode: POLICIES.riskAware.patrolMode ?? 'risk-aware',
  }
  const rows = []
  for (const N of droneCounts) {
    const allocation = POLICIES.riskAware.allocate(N)
    const row = { N }
    for (const rule of DISPATCH_RULES) {
      let totalDt = 0, count = 0, missed = 0, total = 0
      for (let trial = 0; trial < trialsPerPoint; trial++) {
        const seed = 42 + trial * 31 + N * 7919
        const r = simulateWithDispatch({
          allocation,
          params: dispatchParams,
          seed,
          dispatchRule: rule,
        })
        r.detectionTimes.forEach((dt) => { totalDt += dt; count++ })
        missed += r.nMissed
        total += r.nTotal
        done++
        if (done % 5 === 0) {
          onProgress?.(done, totalRuns)
          await nextTick()
        }
      }
      row[`${rule}_avg`] = count > 0 ? Math.round(totalDt / count) : null
      row[`${rule}_missedPct`] = total > 0 ? +((missed / total) * 100).toFixed(1) : 0
    }
    rows.push(row)
  }
  onProgress?.(totalRuns, totalRuns)
  return rows
}
