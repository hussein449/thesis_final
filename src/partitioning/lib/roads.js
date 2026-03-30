/**
 * Beirut Road Accident Data — Drone Partitioning
 *
 * Sources:
 *   - Lebanese Internal Security Forces (ISF) Annual Report 2022
 *   - AUB Road Safety Observatory 2021
 *   - World Bank Lebanon Transport Study 2019
 *
 * Risk Formula (Highway Safety Manual, adapted):
 *   score = 0.40 × (accidents_per_km / 20)
 *         + 0.25 × (AADT / 50,000)
 *         + 0.20 × (speed_km_h / 120)
 *         + 0.15 × ((5 − condition_score) / 4)
 */

export const ROADS = [
  {
    id: 'charles_helou',
    name: 'Charles Helou Expressway',
    shortName: 'Charles Helou',
    color: '#ef4444',
    accidents: 47,
    aadt: 45000,
    speedKmh: 80,
    lengthKm: 2.8,
    condition: 3.2,
    source: 'ISF Annual Report 2022',
    description:
      'High-speed coastal expressway. Frequent rear-end and sideswipe collisions due to lane-merging near the port.',
    polyline: [
      [33.9005, 35.5095],
      [33.8978, 35.5155],
      [33.8950, 35.5210],
      [33.8928, 35.5265],
    ],
  },
  {
    id: 'damascus',
    name: 'Damascus Road',
    shortName: 'Damascus Rd',
    color: '#f59e0b',
    accidents: 38,
    aadt: 35000,
    speedKmh: 60,
    lengthKm: 3.1,
    condition: 2.8,
    source: 'ISF Annual Report 2022 · AUB RSO 2021',
    description:
      'Major arterial connecting central Beirut to eastern suburbs. High pedestrian conflict at uncontrolled intersections.',
    polyline: [
      [33.8836, 35.5050],
      [33.8810, 35.5115],
      [33.8782, 35.5182],
      [33.8755, 35.5248],
    ],
  },
  {
    id: 'corniche_mazraa',
    name: 'Corniche El Mazraa',
    shortName: 'C. El Mazraa',
    color: '#a855f7',
    accidents: 29,
    aadt: 28000,
    speedKmh: 50,
    lengthKm: 2.2,
    condition: 2.5,
    source: 'ISF Annual Report 2022',
    description:
      'Dense urban corridor with high pedestrian activity and numerous mid-block crossings.',
    polyline: [
      [33.8865, 35.4960],
      [33.8848, 35.5015],
      [33.8832, 35.5065],
      [33.8818, 35.5110],
    ],
  },
  {
    id: 'mar_elias',
    name: 'Mar Elias Street',
    shortName: 'Mar Elias',
    color: '#22d3ee',
    accidents: 22,
    aadt: 20000,
    speedKmh: 50,
    lengthKm: 1.8,
    condition: 2.9,
    source: 'ISF Annual Report 2022',
    description:
      'Commercial street in southern Beirut. Delivery vehicle conflicts and double-parking create recurring hazards.',
    polyline: [
      [33.8840, 35.4918],
      [33.8822, 35.4960],
      [33.8804, 35.4998],
      [33.8788, 35.5030],
    ],
  },
  {
    id: 'hamra',
    name: 'Hamra Street',
    shortName: 'Hamra St',
    color: '#10b981',
    accidents: 18,
    aadt: 15000,
    speedKmh: 40,
    lengthKm: 1.5,
    condition: 3.1,
    source: 'AUB Road Safety Observatory 2021',
    description:
      'Dense commercial district near AUB. High foot traffic and frequent jaywalking incidents.',
    polyline: [
      [33.8948, 35.4870],
      [33.8940, 35.4928],
      [33.8932, 35.4978],
    ],
  },
  {
    id: 'verdun',
    name: 'Verdun Street',
    shortName: 'Verdun St',
    color: '#2d7ff9',
    accidents: 12,
    aadt: 12000,
    speedKmh: 40,
    lengthKm: 1.2,
    condition: 3.5,
    source: 'ISF Annual Report 2022',
    description:
      'Upscale residential/commercial street. Better road condition and lower speed produce the lowest risk index.',
    polyline: [
      [33.8892, 35.4838],
      [33.8875, 35.4872],
      [33.8858, 35.4905],
      [33.8840, 35.4932],
    ],
  },
]

// ---------------------------------------------------------------------------
// Risk calculation
// ---------------------------------------------------------------------------

/** Composite risk score ∈ [0, 1] for a single road object. */
export function computeRiskScore(road) {
  const accPerKm = road.accidents / road.lengthKm
  return (
    0.40 * (accPerKm / 20) +
    0.25 * (road.aadt / 50000) +
    0.20 * (road.speedKmh / 120) +
    0.15 * ((5 - road.condition) / 4)
  )
}

/**
 * Allocate `totalDrones` across all roads proportionally to risk score.
 * Uses the Largest Remainder Method (Hamilton method) to guarantee that
 * integer counts sum exactly to `totalDrones`.
 *
 * Returns an array sorted by risk score descending, each element:
 * { road, score, percentage, drones, exact }
 */
export function allocateDrones(totalDrones) {
  const scored = ROADS.map(road => ({
    road,
    score: computeRiskScore(road),
  }))

  const totalScore = scored.reduce((s, r) => s + r.score, 0)

  const items = scored.map(r => {
    const proportion = r.score / totalScore
    const exact = proportion * totalDrones
    return {
      road: r.road,
      score: r.score,
      percentage: proportion * 100,
      exact,
      floor: Math.floor(exact),
      frac: exact - Math.floor(exact),
      drones: Math.floor(exact),
    }
  })

  // Distribute remaining drones to roads with highest fractional remainders
  const remaining = totalDrones - items.reduce((s, i) => s + i.drones, 0)
  items
    .slice()
    .sort((a, b) => b.frac - a.frac)
    .slice(0, remaining)
    .forEach(item => { item.drones += 1 })

  return items.sort((a, b) => b.score - a.score)
}

// ---------------------------------------------------------------------------
// Map defaults
// ---------------------------------------------------------------------------

export const BEIRUT_CENTER = [33.8880, 35.5050]
export const BEIRUT_ZOOM = 14
