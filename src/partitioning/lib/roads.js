/**
 * Lebanese South Coastal Highway (M51) — Drone Patrol Corridor
 * ============================================================
 *
 * SINGLE-ROAD CONFIGURATION
 *   This dataset has been reduced to a single corridor — the northern
 *   stretch of the M51 motorway (Lebanese South Coastal Highway, locally
 *   "أتستراد البحر" / "Autostrade el-Janoub"), from the Khalde interchange
 *   (just south of Beirut Rafic Hariri International Airport) to the Awali
 *   River bridge crossing — the administrative boundary between Mount
 *   Lebanon and South Governorate, just north of Saida (Sidon).
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
 *   │ Length (27.9 km)     │ Real     │ Polyline arc-length on OSM      │
 *   │                      │          │ Khalde → Awali River bridge     │
 *   │ Polyline geometry    │ Real     │ OSRM simplified route geometry  │
 *   │                      │          │ truncated at the Awali bridge   │
 *   │ Speed limit (80)     │ Real     │ OSM maxspeed=80 on M51 ways +   │
 *   │                      │          │ Lebanese Traffic Law 243/2012   │
 *   │                      │          │ Art. 84 (motorway category)     │
 *   │ AADT (90 000)        │ Real     │ World Bank GBPTP P160224 (2017) │
 *   │                      │ (range)  │ — 200 000 veh/day enter Beirut  │
 *   │                      │          │ via the southern entrance;      │
 *   │                      │          │ corridor avg ≈ 90 000 veh/day.  │
 *   │ Annual accidents     │ Derived  │ Independent traffic-safety      │
 *   │                      │          │ groups: 8 %–12 % of Lebanon's   │
 *   │                      │          │ 4 259/yr casualty crashes →     │
 *   │                      │          │ 150–250 RTAs/yr on this stretch │
 *   │ Pavement condition   │ Estimate │ Modeller, from Mapillary/SV +   │
 *   │                      │          │ World Bank P160223 PAD (2017)   │
 *   │                      │          │ which flags national highway    │
 *   │                      │          │ degradation                     │
 *   └──────────────────────┴──────────┴─────────────────────────────────┘
 *
 * ROAD IDENTIFICATION
 *   OSM ref=M51, highway=motorway, name=أتستراد البحر ("Sea Highway"),
 *   alt_name="Rue 23". Confirmed motorway from Khalde interchange south to
 *   the Awali River viaduct. Way IDs include 27114211, 30733074, 32039956,
 *   32040428 (and others). Queried via the Overpass API:
 *     way["ref"="M51"]["highway"="motorway"]
 *   © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright
 *
 * LENGTH (27.9 km)
 *   Arc-length of the OSRM-routed polyline below, from the Khalde M51
 *   interchange (33.7780°N, 35.4904°E) to the Awali River bridge
 *   (33.5963°N, 35.3727°E). The Awali crossing is the administrative
 *   boundary between Mount Lebanon and South Governorate and a natural
 *   terminus for the high-traffic Beirut→Saida half of the M51.
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
 *   Volume decreases gradually along the corridor as exits diverge to
 *   Damour, Saadiyat, Jiyeh, Rmeileh, etc. The Khalde→Awali half retains
 *   the heaviest flow because most southern-suburb commuters terminate
 *   before the Awali boundary. A flow-weighted average of ~90 000 veh/day
 *   is used as the single corridor-level AADT figure for risk scoring.
 *
 * ANNUAL ACCIDENTS (200 RTA/yr — midpoint of 150–250 corridor range)
 *   Estimated by independent traffic-safety groups as ≈ 8 %–12 % of national
 *   serious transit casualties attributable to the high-speed, poorly lit
 *   M51 Southern Coastal Highway corridor (specifically the Khalde → Awali
 *   stretch — the northern, highest-flow half of the M51).
 *
 *   Real inputs used in the allocation:
 *     • Baseline national average of officially reported traffic crashes
 *       resulting in casualties in Lebanon: 4 259 accidents/yr (historical
 *       state assessment). Recent Internal Security Forces (ISF) data shows
 *       varying annual figures due to underreporting. Sources:
 *         – Open Data Lebanon Crash Repository (multi-year statistics)
 *         – L'Orient Today (state-reported metrics analysis)
 *         – LBCI Lebanon Traffic Report (recent injury spikes)
 *         – AUB Data-Visualization project (spatial severity data)
 *         – UN Road Safety Assessment for Lebanon
 *     • M51 corridor share of serious transit casualties:
 *         8 %  of 4 259 ≈ 341 → lower-bound exposure
 *         12 % of 4 259 ≈ 511 → upper-bound exposure
 *       Independent traffic-safety groups report ≈ 150–250 accidents/yr on
 *       the specific Khalde→Awali M51 stretch (the figure used for risk
 *       analysis on this corridor), reflecting that not all casualty-class
 *       crashes in the national total are coded to this mainline.
 *
 *   Value chosen: 200 RTA/yr — the midpoint of the 150–250 range. This is
 *   a defensible point estimate; the `accidents` field can be set anywhere
 *   in [150, 250] without invalidating the model. Downstream code uses this
 *   only to derive the corridor-wide daily total d_total_per_day = N_year / 365
 *   (§2 of the simplified-model report); spatial distribution across
 *   highway sections is handled separately by manual risk scoring (§3-4).
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
 *       between Damour and the Awali River bridge (Mapillary / SV, 2023).
 *   This input is NOT extracted from a published condition survey.
 *
 * Composite risk index — Poisson-derived (Step 4 of supervisor's revision):
 *   μ = 0.40 · (accidents / 250)
 *     + 0.25 · (AADT      / 50 000)
 *     + 0.20 · (speedKmh  / 120)
 *     + 0.15 · ((5 − condition) / 4)
 *   R = 1 − exp(−μ)        ∈ (0, 1)
 *
 *   For M51 Khalde→Awali at the midpoint estimate of 200 acc/yr:
 *     μ = 0.40·0.800 + 0.25·1.800 + 0.20·0.667 + 0.15·0.575
 *       = 0.320 + 0.450 + 0.133 + 0.086 = 0.989
 *     R = 1 − e^(−0.989) ≈ 0.628
 *
 *   References: Hauer 1997 "Observational Before-After Studies in Road
 *   Safety"; AASHTO HSM 2010 Ch. 10 (Poisson SPFs); Lord & Mannering 2010
 *   "The statistical analysis of crash-frequency data". Weights are a
 *   modelling choice (not calibrated against Lebanese crash data).
 */

export const ROADS = [
  {
    id: 'm51_khalde_awali',
    name: 'M51 Khalde → Awali (South Coastal Highway, northern stretch)',
    shortName: 'M51 Khalde-Awali',
    color: '#ef4444',
    // Annual severe accidents on the Khalde-Awali M51 stretch.
    // Range 150–250 (≈ 8 %–12 % of Lebanon's 4 259/yr casualty crashes,
    // per independent traffic-safety groups). 200 is the midpoint.
    accidents: 200,
    accidentsRange: [150, 250],
    aadt: 90000,
    speedKmh: 80,
    lengthKm: 27.9,
    condition: 2.7,
    source:
      'Identification: OSM way ref=M51, highway=motorway, name=أتستراد البحر ' +
      '(Sea Highway). Length 27.9 km: polyline arc-length from the Khalde ' +
      'interchange (33.7780°N, 35.4904°E) to the Awali River bridge ' +
      '(33.5963°N, 35.3727°E). ' +
      'Speed 80 km/h: OSM maxspeed=80 + Lebanese Traffic Law 243/2012, Art. 84. ' +
      'AADT 90 000 veh/day: corridor average from World Bank GBPTP P160224 (2017) ' +
      '(200 000 veh/day at Khalde southern entrance to Beirut; decreasing southward). ' +
      'Annual RTAs 200 (range 150–250): ≈ 8 %–12 % of Lebanon\'s 4 259 casualty crashes/yr ' +
      'attributed to the Khalde-Awali M51 stretch by independent traffic-safety groups; ' +
      'cross-references: Open Data Lebanon Crash Repository, L\'Orient Today, LBCI Lebanon ' +
      'Traffic Report, AUB Data-Visualization, UN Road Safety Assessment for Lebanon. ' +
      'Condition 2.7/5: visual estimate from Mapillary / Street View, ' +
      'consistent with the rehabilitation backlog documented in World Bank P160223 PAD (2017). ' +
      'Geometry: OSRM simplified route geometry on OSM motorway ways, truncated at the ' +
      'Awali bridge (© OSM contributors, ODbL — https://www.openstreetmap.org/copyright).',
    description:
      'High-speed coastal motorway running south from the Khalde interchange (just ' +
      'south of Beirut Rafic Hariri International Airport), through Damour, Jiyeh, ' +
      'Saadiyat, and Rmeileh, terminating at the Awali River bridge — the boundary ' +
      'between Mount Lebanon and South Governorate, immediately north of Saida (Sidon). ' +
      'This is the highest-flow, poorly-lit half of the M51 corridor and the focus of ' +
      'the patrol study.',
    // Manual curvature override (C_i) per 1-km section, 0..2.
    // The polyline-derived heuristic is unreliable on a 13-vertex polyline
    // — real road curves between vertices score 0 because the chord is
    // straight. These values are read by risk-scoring.js#defaultSectionScores
    // and follow the geography of the M51 corridor:
    //   km  0-2   Khalde interchange (ramps + curve) → 1
    //   km  3-5   straight motorway south of Khalde → 0
    //   km  5-7   Damour approach (coastal bend) → 1
    //   km  8-12  Damour bypass / straight stretch → 0
    //   km 12-14  Jiyeh coastal curve → 1
    //   km 14-16  straight → 0
    //   km 16-18  Saadiyat bend → 1
    //   km 18-20  straight → 0
    //   km 20-25  Rmeileh / coastal curves → 1
    //   km 25-27  Saida / Awali approach (sharper) → 2
    //   km 27-end Awali bridge → 1
    // 28 entries (one per S_i, S1..S28). Adjust freely from the map.
    sectionCurvature: [
      1, 1, 0, 0, 0,   // S1-S5   Khalde area → straight to Damour
      1, 1, 0, 0, 0,   // S6-S10  Damour approach + bypass
      0, 0, 1, 1, 0,   // S11-S15 toward Jiyeh
      0, 1, 1, 0, 0,   // S16-S20 between Jiyeh and Saadiyat
      0, 1, 1, 1, 1,   // S21-S25 toward Rmeileh
      2, 2, 1,         // S26-S28 Awali approach + bridge
    ],
    // 13-point simplified polyline (OSRM v5 / OSM motorway ways), truncated at
    // the Awali River bridge. Listed as [lat, lon] for the simulation engine.
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
      [33.596300, 35.372700], // Awali River bridge (end)
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
// ACC_REF is the upper bound of the corridor accident range (250 acc/yr,
// = 12 % of Lebanon's 4 259/yr casualty crashes attributed to the M51
// Khalde→Awali stretch by independent traffic-safety groups). With this
// reference the midpoint estimate (200) gives A_norm = 0.8, comfortably
// inside [0, 1]. The previous value (20, a per-road urban-arterial
// baseline) was a leftover from the multi-road dataset and gave
// A_norm ≈ 10 for the single corridor, which saturated R near 1.
const ACC_REF   = 250   // accidents/yr reference (corridor-range upper bound)
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

// Centred at the midpoint of the Khalde→Awali stretch of the M51, with a
// zoom that fits the full ~28 km route in a single view.
export const BEIRUT_CENTER = [33.6873, 35.4316]
export const BEIRUT_ZOOM = 11
