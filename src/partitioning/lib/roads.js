/**
 * Beirut Road Accident Data — Drone Partitioning
 *
 * Sources:
 *   - Lebanese Internal Security Forces (ISF) Annual Report 2022
 *   - AUB Road Safety Observatory 2021
 *   - World Bank Lebanon Transport Study 2019
 *   - Road geometries: OpenStreetMap contributors (ODbL)
 *     https://www.openstreetmap.org
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
    name: 'Charles Helou Avenue',
    shortName: 'Charles Helou',
    color: '#ef4444',
    accidents: 47,
    aadt: 45000,
    speedKmh: 80,
    lengthKm: 2.8,
    condition: 3.2,
    source: 'ISF Annual Report 2022 · Coordinates: OpenStreetMap (ODbL) ways 1068728077, 201251095, 530756699',
    description:
      'High-speed coastal motorway running along the port of Beirut. Frequent rear-end and sideswipe collisions at port access ramps and merging lanes.',
    polyline: [
      [33.8968353, 35.5128753],
      [33.8964543, 35.5162027],
      [33.8968779, 35.5200369],
      [33.8978063, 35.5216140],
      [33.8991183, 35.5276532],
      [33.8978909, 35.5334917],
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
    source: 'ISF Annual Report 2022 · AUB RSO 2021 · Coordinates: OpenStreetMap (ODbL) ways 480592198, 692193059, 447687864',
    description:
      'Major arterial connecting central Beirut to the eastern suburbs. High pedestrian conflict at uncontrolled intersections and frequent double-parking.',
    polyline: [
      [33.8896005, 35.5066736],
      [33.8880910, 35.5073251],
      [33.8867150, 35.5083149],
      [33.8849284, 35.5097346],
      [33.8835672, 35.5106920],
      [33.8808467, 35.5129673],
      [33.8788901, 35.5148516],
      [33.8751799, 35.5197470],
    ],
  },
  {
    id: 'mazraa',
    name: 'Mazraa Street',
    shortName: 'Mazraa St',
    color: '#a855f7',
    accidents: 29,
    aadt: 28000,
    speedKmh: 50,
    lengthKm: 2.2,
    condition: 2.5,
    source: 'ISF Annual Report 2022 · Coordinates: OpenStreetMap (ODbL) ways 34208132, 481397382, 543721327',
    description:
      'Dense urban corridor running northeast through the Mazraa district. High pedestrian activity and numerous mid-block crossings with poor signal compliance.',
    polyline: [
      [33.8800508, 35.5045562],
      [33.8814,    35.4999   ],
      [33.8823,    35.4957   ],
      [33.8829,    35.4912   ],
      [33.8836167, 35.4856818],
    ],
  },
  {
    id: 'corniche_beirut',
    name: 'Corniche Beirut',
    shortName: 'Corniche',
    color: '#22d3ee',
    accidents: 22,
    aadt: 20000,
    speedKmh: 50,
    lengthKm: 3.5,
    condition: 3.5,
    source: 'ISF Annual Report 2022 · Coordinates: OpenStreetMap (ODbL) way 276071581',
    description:
      'Iconic seaside promenade and mixed-use road along Beirut\'s western waterfront from Ain Mreisseh to Raouche. Mixed pedestrian and vehicle traffic.',
    polyline: [
      [33.9015783, 35.4896825],
      [33.9023,    35.4860   ],
      [33.9027,    35.4826   ],
      [33.9024,    35.4791   ],
      [33.9015,    35.4756   ],
      [33.9000,    35.4726   ],
      [33.8982952, 35.4704419],
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
    lengthKm: 1.0,
    condition: 3.1,
    source: 'AUB Road Safety Observatory 2021 · Coordinates: OpenStreetMap (ODbL) way 357017033',
    description:
      'Dense commercial district adjacent to AUB. High foot traffic, frequent jaywalking, and delivery vehicle conflicts throughout the day.',
    polyline: [
      [33.8952938, 35.4876120],
      [33.8956,    35.4848   ],
      [33.8959,    35.4820   ],
      [33.8961,    35.4795   ],
      [33.8962528, 35.4773681],
    ],
  },
  {
    id: 'bliss',
    name: 'Bliss Street',
    shortName: 'Bliss St',
    color: '#2d7ff9',
    accidents: 12,
    aadt: 12000,
    speedKmh: 40,
    lengthKm: 1.2,
    condition: 3.5,
    source: 'ISF Annual Report 2022 · Coordinates: OpenStreetMap (ODbL) ways 199994414, 483635757, 699482717',
    description:
      'University district street running along the AUB campus. High pedestrian density with lower vehicle speeds and a better-maintained road surface.',
    polyline: [
      [33.8991222, 35.4843907],
      [33.8986,    35.4812   ],
      [33.8981,    35.4781   ],
      [33.8975,    35.4749   ],
      [33.8968350, 35.4714542],
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

export const BEIRUT_CENTER = [33.8940, 35.4980]
export const BEIRUT_ZOOM = 14
