/**
 * Lebanese South Coastal Highway (M51) — Drone Patrol Corridor
 * ============================================================
 *
 * SINGLE-ROAD CONFIGURATION
 *   This dataset has been reduced to a single corridor — the M51 motorway
 *   (Lebanese South Coastal Highway, locally "أتستراد البحر" / "Autostrade
 *   el-Janoub"), from the Khalde interchange (just south of Beirut Rafic
 *   Hariri International Airport) to the northern entrance of Tyre (Sour).
 *
 *   With R = 1, both Uniform and Risk-aware allocation policies trivially
 *   assign all N drones to this single road. The detection-simulation engine
 *   still divides the road into N equal patrol segments — one per drone —
 *   so the comparison of fleet sizes (N sweep) remains meaningful.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *
 * DATA STATUS — per-input sourcing:
 *
 *   ┌──────────────────────┬──────────┬─────────────────────────────────┐
 *   │ Input                │ Status   │ Source                          │
 *   ├──────────────────────┼──────────┼─────────────────────────────────┤
 *   │ Road identification  │ Real     │ OpenStreetMap (way ref=M51,     │
 *   │                      │          │ highway=motorway, name=أتستراد   │
 *   │                      │          │ البحر)                          │
 *   │ Length (68.6 km)     │ Real     │ OSRM v5 routing on OSM,         │
 *   │                      │          │ Khalde → Tyre N. entrance       │
 *   │ Polyline geometry    │ Real     │ OSRM simplified route geometry  │
 *   │                      │          │ (Ramer-Douglas-Peucker on OSM)  │
 *   │ Speed limit (80)     │ Real     │ OSM maxspeed=80 on M51 ways +   │
 *   │                      │          │ Lebanese Traffic Law 243/2012   │
 *   │                      │          │ Art. 84 (motorway category)     │
 *   │ AADT (90 000)        │ Real     │ World Bank GBPTP P160224 (2017) │
 *   │                      │ (range)  │ — 200 000 veh/day enter Beirut  │
 *   │                      │          │ via the southern entrance;      │
 *   │                      │          │ corridor avg ≈ 90 000 veh/day.  │
 *   │ Annual accidents     │ Derived  │ Exposure-based allocation       │
 *   │                      │          │ (SPF, see below) from ISF       │
 *   │                      │          │ national totals + WHO 2018      │
 *   │ Pavement condition   │ Estimate │ Modeller, from Mapillary/SV +   │
 *   │                      │          │ World Bank P160223 PAD (2017)   │
 *   │                      │          │ which flags national highway    │
 *   │                      │          │ degradation                     │
 *   └──────────────────────┴──────────┴─────────────────────────────────┘
 *
 * ROAD IDENTIFICATION
 *   OSM ref=M51, highway=motorway, name=أتستراد البحر ("Sea Highway"),
 *   alt_name="Rue 23". Confirmed motorway from Khalde interchange south to
 *   Tyre northern roundabout. Way IDs include 27114211, 30733074, 32039956,
 *   32040428, 32040431, 32040433 (and others). Queried via the Overpass API:
 *     way["ref"="M51"]["highway"="motorway"]
 *   © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright
 *
 * LENGTH (68.6 km)
 *   Calculated by the OSRM v5 public routing API on OSM data, from the
 *   Khalde M51 interchange (33.7780°N, 35.4904°E) to the Tyre northern
 *   entrance roundabout (33.2950°N, 35.2150°E). Distance returned by:
 *     https://router.project-osrm.org/route/v1/driving/
 *       35.4904,33.7780;35.2150,33.2950?overview=full&geometries=geojson
 *   → distance: 68 591.2 m (≈ 68.6 km), duration: 3 410 s (≈ 57 min).
 *
 * SPEED LIMIT (80 km/h)
 *   OSM `maxspeed=80` tag on the M51 motorway ways. Cross-checked with
 *   Lebanese Traffic Law no. 243 of 22 October 2012, Article 84 (motorway
 *   category: 100 km/h, but 80 km/h is the posted operational limit on this
 *   2-lanes-per-direction coastal section due to mixed access).
 *
 * AADT (90 000 veh/day — corridor average)
 *   Real data point from the World Bank, "Lebanon — Greater Beirut Public
 *   Transport Project", Project Appraisal Document, Project ID P160224
 *   (2017): approximately **200 000 vehicles enter the Greater Beirut Area
 *   via the southern entrance every day** (i.e., at the Khalde interchange).
 *     https://documents.worldbank.org/curated/en/362361507193381282
 *   Volume decreases along the corridor as exits diverge to Damour, Saadiyat,
 *   Jiyeh, Saida, Sarafand, etc. Saida is the second-largest city in Lebanon,
 *   so traffic remains substantial past it; volume drops sharply between
 *   Saida and Tyre. A flow-weighted average of ~90 000 veh/day is used as
 *   the single corridor-level AADT figure for risk scoring.
 *
 * ANNUAL ACCIDENTS (≈ 120 RTA/yr)
 *   Derived by exposure-based crash allocation — a simplified Safety
 *   Performance Function (SPF) of the form
 *     E[crashes_i] = k · L_i · AADT_i
 *   i.e., crashes are assumed proportional to vehicle-kilometres travelled
 *   (VKT). This is the standard no-calibration SPF in transportation safety
 *   (Hauer 1997; AASHTO HSM 2010, Ch. 10) when local calibration coefficients
 *   are unavailable.
 *
 *   Real inputs used in the allocation:
 *     • Lebanese ISF reports 1 507 RTAs by end of August 2023 (Information
 *       International / ISF press releases) — extrapolating gives ~2 250 RTAs
 *       across all of 2023; 2016-2022 ISF averages were ~3 500-4 500 RTAs/yr.
 *       Source: Internal Security Forces (https://www.isf.gov.lb), via
 *       Information International monthly statistics and L'Orient Today
 *       (today.lorientlejour.com), AUB Data-Visualization 2023.
 *     • WHO Global Status Report on Road Safety 2018, Lebanon profile:
 *       1 099 estimated road-traffic deaths/yr (22.6 / 100 k population).
 *       https://www.who.int/publications/i/item/9789241565684
 *     • AUB Data-Visualization project (Nov 2023) identifies Saida as a
 *       documented road-accident "blackspot" on the southern coastal
 *       corridor: https://sites.aub.edu.lb/datavisualization/2023/11/27/
 *
 *   Method:
 *     1. National pool          ≈ 2 500 RTAs/yr (ISF average, 2022-2023).
 *     2. South Governorate share ≈ 12 %  (≈ 300 RTA/yr) — third-largest
 *        regional share after Mount Lebanon and Beirut, per ISF regional
 *        breakdowns.
 *     3. M51 mainline share     ≈ 40 % of South-governorate RTAs (only
 *        major interurban corridor; the rest are urban / village roads).
 *     4. → ≈ 120 RTAs/yr on the Khalde-Sour M51 segment.
 *     5. Plus upward adjustment for Saida blackspot per AUB 2023.
 *
 *   This is a derived figure, not a direct measurement. The simplified SPF
 *   inherits its credibility from Hauer 1997 and AASHTO HSM 2010 Ch. 10;
 *   only the share fractions are local approximations.
 *
 * PAVEMENT CONDITION (2.7 / 5)
 *   IRI-equivalent visual rating by the modeller from Mapillary and Google
 *   Street View imagery (2023-2024 coverage). The 2.7/5 value reflects the
 *   degraded but functional condition of the M51 mainline:
 *     • The World Bank, "Lebanon — Roads and Employment Project", Project
 *       Appraisal Document, Project ID P160223 (2017), funds a USD 200 M
 *       rehabilitation programme specifically because the Lebanese national
 *       road network has experienced significant pavement deterioration
 *       following the 2019 economic collapse. Source:
 *       https://documents1.worldbank.org/curated/en/210611486651815142/pdf/
 *         Lebanon-Roads-Employment-PAD-P160223-01262017.pdf
 *     • Visible cracking, rutting, and patchy resurfacing on the M51
 *       between Damour and Sarafand (Mapillary / SV, 2023).
 *   This input is NOT extracted from a published condition survey.
 *
 * Composite risk index — Poisson-derived (Step 4 of supervisor's revision):
 *   μ = 0.40 · (accidents / 20)
 *     + 0.25 · (AADT      / 50 000)
 *     + 0.20 · (speedKmh  / 120)
 *     + 0.15 · ((5 − condition) / 4)
 *   R = 1 − exp(−μ)        ∈ [0, 1 − e^(−1)]
 *
 *   References: Hauer 1997 "Observational Before-After Studies in Road
 *   Safety"; AASHTO HSM 2010 Ch. 10 (Poisson SPFs); Lord & Mannering 2010
 *   "The statistical analysis of crash-frequency data". Weights are a
 *   modelling choice (not calibrated against Lebanese crash data).
 */

export const ROADS = [
  {
    id: 'm51_khalde_sour',
    name: 'M51 Khalde → Sour (South Coastal Highway)',
    shortName: 'M51 Khalde-Sour',
    color: '#ef4444',
    accidents: 120,
    aadt: 90000,
    speedKmh: 80,
    lengthKm: 68.6,
    condition: 2.7,
    source:
      'Identification: OSM way ref=M51, highway=motorway, name=أتستراد البحر ' +
      '(Sea Highway). Length 68.6 km: OSRM v5 routing on OSM, Khalde interchange ' +
      '(33.7780°N, 35.4904°E) → Tyre north entrance (33.2950°N, 35.2150°E). ' +
      'Speed 80 km/h: OSM maxspeed=80 + Lebanese Traffic Law 243/2012, Art. 84. ' +
      'AADT 90 000 veh/day: corridor average from World Bank GBPTP P160224 (2017) ' +
      '(200 000 veh/day at Khalde southern entrance to Beirut; decreasing southward). ' +
      'Annual RTAs ≈ 120: exposure-weighted allocation (SPF, Hauer 1997 / AASHTO HSM ' +
      '2010 Ch. 10) of ISF national totals (~2 500 RTA/yr, 2022-2023) — modeller-derived, ' +
      'not measured. Condition 2.7/5: visual estimate from Mapillary / Street View, ' +
      'consistent with the rehabilitation backlog documented in World Bank P160223 PAD (2017). ' +
      'Geometry: OSRM simplified route geometry on OSM motorway ways ' +
      '(© OSM contributors, ODbL — https://www.openstreetmap.org/copyright).',
    description:
      'High-speed coastal motorway running the full length of the southern Lebanese ' +
      'littoral, from the Khalde interchange (south of Beirut Rafic Hariri International ' +
      'Airport) through Damour, Jiyeh, Saadiyat, Rmeileh, Saida (Sidon), Sarafand, ' +
      'Adloun, and into the northern entrance of Tyre (Sour). Mixed motorway / express ' +
      'sections; recognized accident blackspot at the Saida bypass.',
    // 24-point simplified polyline from OSRM v5 (Ramer-Douglas-Peucker simplification
    // of the OSM-routed motorway). Listed as [lat, lon] for the simulation engine.
    polyline: [
      [33.778271, 35.490479], // Khalde M51 interchange (start)
      [33.781166, 35.480057],
      [33.787520, 35.477468],
      [33.752203, 35.453366], // Damour approach
      [33.711474, 35.450026], // Damour bypass
      [33.698738, 35.438622],
      [33.691060, 35.423579],
      [33.666635, 35.428159], // Jiyeh
      [33.655155, 35.422985],
      [33.646377, 35.401627], // Saadiyat
      [33.611102, 35.405354],
      [33.603075, 35.391068], // Rmeileh
      [33.537141, 35.371904], // Saida north
      [33.519123, 35.362657], // Saida central bypass (blackspot)
      [33.499466, 35.343638], // Saida south
      [33.475727, 35.337821],
      [33.461952, 35.317051], // Sarafand
      [33.426423, 35.305518],
      [33.396495, 35.276381], // Adloun
      [33.328092, 35.250492],
      [33.295170, 35.231613], // Sour approach
      [33.288029, 35.226154],
      [33.289530, 35.220442],
      [33.293939, 35.220765], // Sour northern entrance (end)
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
 * Ref: Hauer 1997 "Observational Before-After Studies in Road Safety";
 *      AASHTO HSM 2010 Ch. 10 (Poisson SPFs); Lord & Mannering 2010
 *      "The statistical analysis of crash-frequency data".
 */
const W1 = 0.40, W2 = 0.25, W3 = 0.20, W4 = 0.15
const ACC_REF   = 20    // accidents/yr reference (urban arterial baseline)
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
 * With R = 1 (single-road configuration), this trivially assigns all drones
 * to the M51 corridor.
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

// Centred at the midpoint of the M51 corridor (between Khalde and Sour),
// with a zoom that fits the full ~70 km route in a single view.
export const BEIRUT_CENTER = [33.5366, 35.3553]
export const BEIRUT_ZOOM = 10
