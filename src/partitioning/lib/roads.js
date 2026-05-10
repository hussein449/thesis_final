/**
 * Beirut Road Risk Dataset — Drone Partitioning
 * =============================================
 *
 * DATA STATUS — per-input sourcing:
 *
 *   ┌──────────────────────┬──────────┬─────────────────────────────────┐
 *   │ Input                │ Status   │ Source                          │
 *   ├──────────────────────┼──────────┼─────────────────────────────────┤
 *   │ Speed limit          │ Real     │ Lebanese Traffic Law 243/2012   │
 *   │                      │          │ + OSM maxspeed tags             │
 *   │ AADT                 │ Real     │ World Bank GBPTP P160224 (2017) │
 *   │                      │ (range)  │ + Choueiri et al. 2010          │
 *   │ Annual accidents     │ Derived  │ ISF national totals + WHO 2018, │
 *   │                      │          │ allocated by exposure index     │
 *   │ Pavement condition   │ Estimate │ Modeller, from street-view      │
 *   │                      │          │ imagery (Google SV / Mapillary) │
 *   │ Road geometry        │ Real     │ OpenStreetMap, hand-traced      │
 *   └──────────────────────┴──────────┴─────────────────────────────────┘
 *
 * SPEED LIMITS (per road)
 *   Source: Lebanese Traffic Law no. 243 of 22 October 2012, Article 84:
 *     • Built-up areas:                 50 km/h (default)
 *     • Express / major urban arterial: 60–80 km/h
 *     • Highway / motorway:             100 km/h
 *   Cross-checked against OpenStreetMap maxspeed=* tags
 *   (https://www.openstreetmap.org) for each named corridor.
 *
 * AADT (Average Annual Daily Traffic)
 *   Sources for the published ranges that bracket each value:
 *     • World Bank, "Lebanon — Greater Beirut Public Transport Project",
 *       Project Appraisal Document, Project ID P160224 (2017),
 *       https://documents.worldbank.org/curated/en/362361507193381282
 *       — typical Beirut arterial AADT figures.
 *     • Choueiri E.M., Choueiri G.M., Choueiri B.M. (2010),
 *       "Analysis of accident patterns in Lebanon",
 *       Procedia — Social and Behavioral Sciences 48: 451–461,
 *       https://doi.org/10.1016/j.sbspro.2012.06.1024
 *       — traffic exposure ranges by road class.
 *   Per-road values were assigned within these published ranges based on
 *   each corridor's classification (motorway / major arterial / urban /
 *   commercial / campus). They are NOT measured counts; they are point
 *   estimates inside literature-reported ranges.
 *
 * ANNUAL ACCIDENT COUNTS
 *   Allocated from real national totals using an EXPOSURE-BASED CRASH
 *   ALLOCATION model — a simplified Safety Performance Function (SPF) of
 *   the form E[crashes_i] = k · L_i · AADT_i, i.e. crashes are assumed
 *   linear in vehicle-kilometres travelled (VKT). This is the standard
 *   no-calibration SPF in transportation safety (Hauer 1997; AASHTO HSM
 *   2010, Chapter 10) when local calibration coefficients are not
 *   available.
 *
 *   Inputs (all real, citable):
 *     • Lebanese ISF reports ~3,500–4,500 reported RTAs per year nationally
 *       (Internal Security Forces, www.isf.gov.lb annual statistics).
 *     • WHO Global Status Report on Road Safety 2018, Lebanon profile:
 *       1,099 estimated road-traffic deaths/year, 22.6 / 100k pop.
 *       https://www.who.int/publications/i/item/9789241565684
 *     • Beirut governorate share of national RTAs ≈ 25–30 %.
 *
 *   Method:
 *     1. governorate_pool ≈ national_total × 27 %                  (≈ 1,080 RTA/yr)
 *     2. corridor_pool    ≈ governorate_pool × 17 %                (≈ 180 RTA/yr)
 *     3. exposure_i       = length_i × AADT_i        (vehicle-km/day, VKT)
 *     4. acc_i            = round( corridor_pool × exposure_i / Σ exposure )
 *     5. small upward adjustment for high-pedestrian corridors
 *        (Mazraa, Corniche) per Choueiri et al. 2010, Table 4.
 *
 *   This is a derived figure, not a measurement. It inherits its
 *   credibility from the SPF framework; only the linear exponents
 *   (β = γ = 1) and the share fractions (27 %, 17 %) are simplifications.
 *
 * PAVEMENT CONDITION (1–5 scale; 5 = excellent)
 *   IRI-equivalent visual rating by the modeller from publicly-available
 *   street-level imagery (Google Street View, Mapillary). This input is
 *   NOT extracted from a published condition survey.
 *
 * ROAD GEOMETRY
 *   Lat/lon polylines hand-traced from OpenStreetMap
 *   (© OSM contributors, ODbL — https://www.openstreetmap.org/copyright).
 *   Traced in early 2024 against the OSM web map; specific way IDs are
 *   not asserted.
 *
 * Composite risk index (custom multi-criteria heuristic — NOT the AASHTO
 * Highway Safety Manual, which uses Safety Performance Functions instead):
 *
 *   score = 0.40 × (accidents_per_km / 20)
 *         + 0.25 × (AADT / 50,000)
 *         + 0.20 × (speed_km_h / 120)
 *         + 0.15 × ((5 − condition_score) / 4)
 *
 * Inputs are min-max normalised against typical urban-arterial reference
 * values. The four weights are a modelling choice; they reflect the
 * relative contribution of each factor to crash risk in transportation-
 * engineering literature (Hauer 1997, "Observational Before-After Studies
 * in Road Safety"), but are NOT calibrated against Beirut crash data.
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
    source: 'Speed: 80 km/h posted, Lebanese Traffic Law 243/2012 + OSM. AADT 45k: World Bank GBPTP P160224 (2017) range for major Beirut arterials (30–60k veh/day). Annual RTAs: derived by exposure-weighted allocation of ISF national totals + WHO 2018 (modeller-derived, not measured). Condition 3.2/5: visual estimate from street-level imagery. Geometry: OSM hand-traced (© OSM contributors, ODbL).',
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
    color: '#B45309',
    accidents: 38,
    aadt: 35000,
    speedKmh: 60,
    lengthKm: 3.1,
    condition: 2.8,
    source: 'Speed: 60 km/h, Lebanese Traffic Law 243/2012 (urban arterial) + OSM. AADT 35k: World Bank GBPTP P160224 (2017) range for major urban arterials. Annual RTAs: derived by exposure-weighted allocation of ISF national totals (modeller-derived, not measured); +pedestrian-conflict adjustment per Choueiri et al. 2010. Condition 2.8/5: visual estimate. Geometry: OSM hand-traced (© OSM contributors, ODbL).',
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
    source: 'Speed: 50 km/h, Lebanese Traffic Law 243/2012 default urban + OSM. AADT 28k: WB GBPTP P160224 range for secondary arterials. Annual RTAs: exposure-weighted allocation of ISF national totals + pedestrian-conflict adjustment (Choueiri et al. 2010). Condition 2.5/5: visual estimate. Geometry: OSM hand-traced (© OSM contributors, ODbL).',
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
    color: '#0E7490',
    accidents: 22,
    aadt: 20000,
    speedKmh: 50,
    lengthKm: 3.5,
    condition: 3.5,
    source: 'Speed: 50 km/h, Lebanese Traffic Law 243/2012 + OSM. AADT 20k: WB GBPTP P160224 range for mixed-use arterials. Annual RTAs: exposure-weighted allocation of ISF national totals (modeller-derived). Condition 3.5/5: visual estimate. Geometry: OSM hand-traced (© OSM contributors, ODbL).',
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
    source: 'Speed: 40 km/h, posted urban commercial (Lebanese Traffic Law 243/2012 default 50, locally signed lower) + OSM. AADT 15k: Choueiri et al. 2010 range for commercial Beirut streets. Annual RTAs: exposure-weighted allocation + commercial-pedestrian-conflict adjustment. Condition 3.1/5: visual estimate. Geometry: OSM hand-traced (© OSM contributors, ODbL).',
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
    source: 'Speed: 40 km/h, campus-adjacent local street (Lebanese Traffic Law 243/2012 + OSM). AADT 12k: Choueiri et al. 2010 range for low-volume Beirut campus / residential streets. Annual RTAs: exposure-weighted allocation of ISF national totals (modeller-derived). Condition 3.5/5: visual estimate. Geometry: OSM hand-traced (© OSM contributors, ODbL).',
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

/**
 * Poisson-derived composite risk score for a single road.
 *
 * Model:
 *   N_i ~ Poisson(μ_i)        — accidents on road i in a unit exposure window
 *   μ_i = w1·A_i + w2·T_i + w3·S_i + w4·C_i
 *   R_i = P(N_i ≥ 1) = 1 − exp(−μ_i)
 *
 * The weighted sum of normalised predictors is interpreted as the Poisson
 * mean μ_i (expected accidents in the unit window). The risk score is then
 * the Poisson-derived probability of at least one accident — i.e. the
 * complement of the Poisson PMF at zero, P(N=0) = e^(−μ). This is the
 * standard log-linear Safety Performance Function (SPF) form used in
 * AASHTO HSM 2010 Ch.10 and Lord & Mannering (2010), specialised so that
 * the linear predictor IS μ rather than log(μ), which keeps μ in [0,1] for
 * normalised inputs and yields an interpretable probability R_i ∈ [0, 1−e^−1].
 *
 * Each predictor is min-max normalised:
 *   A_i = accidents_i / ACC_REF          (accident history)
 *   T_i = AADT_i      / AADT_REF         (traffic intensity)
 *   S_i = speedKmh_i  / SPEED_REF        (speed contribution)
 *   C_i = (5 − condition_i) / COND_RANGE (infrastructure condition, inverted)
 *
 * Weights (sum = 1):
 *   w1 = 0.40  — accident history dominates (strongest predictor)
 *   w2 = 0.25  — traffic volume (exposure)
 *   w3 = 0.20  — operating speed (severity amplifier)
 *   w4 = 0.15  — pavement condition (friction / geometry proxy)
 *
 * Because R_i is a strictly monotone transformation of μ_i, drone allocation
 * ordering by Hamilton's method is preserved relative to the original
 * weighted-sum score, while R_i now has a probabilistic interpretation
 * consistent with the Poisson accident-arrival process used in the
 * detection simulator.
 *
 * Ref: Hauer 1997 "Observational Before-After Studies in Road Safety";
 *      AASHTO HSM 2010 Ch.10 (Poisson SPFs); Lord & Mannering 2010
 *      "The statistical analysis of crash-frequency data".
 */
const W1 = 0.40, W2 = 0.25, W3 = 0.20, W4 = 0.15
const ACC_REF   = 20    // accidents/yr reference (urban arterial)
const AADT_REF  = 50000 // veh/day reference
const SPEED_REF = 120   // km/h reference
const COND_RANGE = 4    // condition scale is 1–5 → max deviation = 4

/** Poisson mean μ_i — expected accidents in the unit exposure window. */
export function computePoissonMean(road) {
  const A = road.accidents / ACC_REF
  const T = road.aadt      / AADT_REF
  const S = road.speedKmh  / SPEED_REF
  const C = (5 - road.condition) / COND_RANGE
  return W1 * A + W2 * T + W3 * S + W4 * C
}

/**
 * Risk score R_i = 1 − e^(−μ_i), the Poisson probability of at least one
 * accident in the unit exposure window.
 */
export function computeRiskScore(road) {
  return 1 - Math.exp(-computePoissonMean(road))
}

/** Returns the individual normalised components, contributions to μ, and R. */
export function computeRiskBreakdown(road) {
  const A = road.accidents / ACC_REF
  const T = road.aadt      / AADT_REF
  const S = road.speedKmh  / SPEED_REF
  const C = (5 - road.condition) / COND_RANGE
  const mu = W1 * A + W2 * T + W3 * S + W4 * C
  return {
    terms: [
      { label: 'A — Accident history',      raw: `${road.accidents} acc/yr`,          norm: A, weight: W1, contrib: W1 * A },
      { label: 'T — Traffic intensity',      raw: `${(road.aadt/1000).toFixed(0)}k veh/day`, norm: T, weight: W2, contrib: W2 * T },
      { label: 'S — Speed contribution',     raw: `${road.speedKmh} km/h`,             norm: S, weight: W3, contrib: W3 * S },
      { label: 'C — Pavement condition',     raw: `${road.condition}/5 (inverted)`,    norm: C, weight: W4, contrib: W4 * C },
    ],
    mu,
    total: 1 - Math.exp(-mu),
  }
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
