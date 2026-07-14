# Thesis Project — Context Handoff

A complete-enough snapshot to resume work in a fresh session without losing state.

---

## 1. Project identity

| Field | Value |
|---|---|
| Repo | `https://github.com/hussein449/thesis_final` |
| Local working dir | `C:\Users\HusseinNassareddine\Downloads\thesis_final-main\thesis_final-main\` |
| Package name | `drone-sim-react` |
| Stack | React 19 + Vite 8 + Tailwind v4 + Recharts + Leaflet + Supabase |
| User | Hussein Nassareddine (AUB graduate thesis, supervisor: "the doctor") |
| Branch | `main` |

**Local environment quirks**
- Windows, PowerShell + Git Bash both available.
- **Node.js is NOT installed locally on this machine**. The user runs `npm run dev` themselves; the AI agent cannot test in-browser.
- `git push` works via Windows Credential Manager (`git config --global credential.helper manager`).

---

## 2. What the project does

UAV swarm allocation / accident-response simulator for the **Lebanese M51 South Coastal Highway, Khalde → Awali corridor (~27.9 km)**. The thesis evaluates **Uniform vs Risk-aware** patrol policies under a Poisson accident-arrival model with a closed-form IoT alert detection rule.

Source of the model: a "Simplified UAV-IoT Accident Simulation Model" report (PDF, dated May 13 2026) with sections §1–§14:
- §1: 1-D corridor, divided into 1-km highway sections `S_i`
- §2: corridor-wide daily total = `N_year / 365`
- §3: per-section, per-time-slot risk `R_{i,b} = a_b·T_i + c_b·C_i + m_b·M_i`
- §4: `P(i|b)` distribution + `λ_{i,b}` per-section-per-slot daily rate
- §5: Poisson event generation, sampling `τ ~ U(slot)` and `s ~ U(section)`
- §6: UAV patrol segmentation — Uniform vs Risk-aware
- §7–§8: back-and-forth motion `q(τ) = (v·τ) mod 2L`
- §9: IoT overlap interval `[max(A, s_k − R_IoT), min(B, s_k + R_IoT)]`
- §10: 3-candidate rule — only test patrol segments `m-1, m, m+1`
- §11: 5-case `T_alert` formula
- §12: `T_alert,k = min over candidates`
- §14: performance metrics + saturation curve M = 1 … 20

---

## 3. Corridor data

| Field | Value | Source |
|---|---|---|
| Road | M51 Khalde → Awali River bridge | OSM (`ref=M51, highway=motorway, name=أتستراد البحر`) |
| Length | 27.9 km | OSRM polyline arc-length |
| Polyline | 13 vertices (start Khalde 33.7780°N 35.4904°E → end Awali bridge 33.5963°N 35.3727°E) | OSRM v5 simplified |
| Highway sections | **28** (27 × 1 km + last 0.9 km) | `buildSections(27.9, 1)` |
| AADT | 90 000 veh/day | World Bank GBPTP P160224 (2017) |
| Speed limit | 80 km/h | OSM `maxspeed=80` + Lebanese Traffic Law 243/2012, Art. 84 |
| Annual accidents | **200/yr** (range 150–250) | 8–12 % of Lebanon's 4 259/yr casualty crashes (independent traffic-safety groups) |
| Condition | 2.7 / 5 | Mapillary + World Bank P160223 PAD (2017) |

---

## 4. The composite per-road risk score (for cross-road allocation, single-road here so trivial)

Formula in `src/partitioning/lib/roads.js`:

```
μ = w1·A + w2·T + w3·S + w4·C        with weights (0.40, 0.25, 0.20, 0.15)
R = 1 − e^(−μ)                       ∈ (0, 1)
```

Normalisation references (also in `roads.js`):

| Predictor | Ref | Note |
|---|---|---|
| `A` = accidents / **ACC_REF = 250** | accidents/yr | upper bound of the 150–250 corridor range |
| `T` = AADT / **AADT_REF = 50 000** | veh/day | Lebanese arterial median |
| `S` = speedKmh / **SPEED_REF = 120** | km/h | motorway category cap |
| `C` = (5 − condition) / **COND_RANGE = 4** | 1–5 scale, inverted | full PCI-like span |

**For M51:** A = 0.800, T = 1.800, S = 0.667, C = 0.575 → **μ = 0.989, R = 0.628**.

---

## 5. The section-time-slot risk model (the actual simulation driver)

**Time slots** — 5 per day, file: `src/partitioning/lib/risk-scoring.js`

| `b` | Period | `a_b` (traffic) | `c_b` (curvature) | `m_b` (merging) |
|---|---|---|---|---|
| 1 | 00:00–06:00 (night) | 0.20 | 0.50 | 0.30 |
| 2 | 06:00–10:00 (morning rush) | 0.50 | 0.20 | 0.30 |
| 3 | 10:00–16:00 (normal day) | 0.40 | 0.30 | 0.30 |
| 4 | 16:00–20:00 (evening rush) | 0.50 | 0.20 | 0.30 |
| 5 | 20:00–24:00 (late) | 0.30 | 0.40 | 0.30 |

Each row sums to 1.

**Per-section manual scores** — `T_i, C_i, M_i ∈ {0, 1, 2}`. Default heuristic in `defaultSectionScores()`:
- `T_i`: U-shaped — 2 near Khalde (first 18% of corridor) and near Awali (last 22%), 1 elsewhere.
- `M_i`: 2 at Khalde + Awali interchanges, 1 at Damour/Jiyeh/Saadiyat/Rmeileh, 0 elsewhere.
- `C_i`: derived from polyline heading change at 100 m sampling.

**Per-section per-slot risk**: `R_{i,b} = a_b·T_i + c_b·C_i + m_b·M_i ∈ [0, 2]`.

---

## 6. Accident generation (file: `src/partitioning/lib/accident-generator.js`)

```
d_total/day        = accidents / 365                                   = 200/365 ≈ 0.548
λ_day_b            = d_total/day / B                                   = 0.110 per slot
P(i | b)           = (R_{i,b} + ε) / Σ_n (R_{n,b} + ε)                ε = 0.05
λ_{i,b}/day        = λ_day_b · P(i|b)
N_{i,b}(d)         ~ Poisson(λ_{i,b}/day)         per (section, slot, day)
τ_k                ~ U(t_slot_start, t_slot_end)
s_k                ~ U(s_section_start, s_section_end)
```

Poisson sampler is Knuth's algorithm (good for small λ).
RNG is **Mulberry32** seeded by `baseSeed + trial·1009 + N·7919` (reproducible).
**Both policies share the same accident events per (trial, N)** — separate `accidentRng` decoupled from drone-setup RNG. This is the §14 "fair comparison" requirement.

---

## 7. UAV patrol segmentation (file: `src/partitioning/lib/uav-segments.js`)

**Uniform** (`buildUniformSegments(L, M)`): equal-length `L/M`, one drone per segment, `droneCount = 1`. Never stacks.

**Risk-aware** (`buildRiskAwareSegments(sections, riskMatrix, M)`) — two-stage:
1. Up to `min(M, 28)` base segments via greedy equal-cumulative-risk walk. Target `totalRisk / effectiveM`. Boundary section assigned by closer-to-target rule. Each base segment guaranteed ≥1 drone.
2. If `M > 28`: excess `M − 28` drones distributed across base segments by **Hamilton's largest-remainder** method, weighted by each segment's mean risk. Hot-spot segments end up with `droneCount > 1`. Ties broken by higher `riskAverage`.

---

## 8. Detection — closed-form IoT alert (file: `src/detection/lib/iot-alert.js`)

For accident at position `s_k` (meters):
1. Find segment `m` containing `s_k` (§10).
2. Candidate UAVs = those in segments `{m-1, m, m+1}` (invalid indices skipped).
3. For each candidate compute `T_alert` via the 5-case formula (§11). Drone state (`s_j`, `dir_j`) supplied either from the stepped sim or from the parametric formula `q(τ) = (v·τ) mod 2L`.
4. If a segment has stacked drones (Risk-aware with M > 28), each drone is tested independently and the **min across the whole stack** wins.
5. Final detection time `T_alert,k = min over all tested candidates`.

`R_IoT` default = **200 m**. Drone speed `v` default = **12 m/s**.

---

## 9. Monte Carlo runner (file: `src/detection/lib/monteCarlo.js`)

- Async, yields to event loop every 5 trials via `setTimeout(0)` so UI stays responsive + progress bar updates.
- Iterates `policies × droneCounts × trialsPerPoint`.
- Threads `policy.patrolMode` into params before each `simulateOnce` so Uniform vs Risk-aware actually differs in single-corridor mode.
- `availabilityHistory` is downsampled to **~200 points** per timeline regardless of trial length (avoids 8 640-point charts on 30-day trials).
- `runDispatchSweep` exists but is not currently invoked by Run-sweep (the Dispatch tab still computes its own sweep inline via `useEffect + setTimeout(0)` — see §10).

---

## 10. UI structure

```
TopNav (App.jsx)
├── Operations           → DetectionPage.jsx (sidebar nav inside)
│     ├── Setup            : Configure
│     ├── Results          : Detection performance · CDF · Operational metrics · Sensitivity
│     ├── Comparison       : Allocation table · Dispatch strategies · Fleet availability
│     └── Tools            : Live trial
├── Dispatch Protocol    → legacy CNP demo (src/lib/simulation.js)
└── Hardware Link        → HardwareEventsPage.jsx (live Supabase poll)
```

**Styling**
- Tailwind v4 utility classes only (no Material-UI / Chakra / shadcn).
- Theme tokens in `src/index.css`: `--color-bg = #FFFFFF` (pure white), `--color-card = #C5B89C` (taupe), `--color-bg2 = #14341A` (forest green header).
- JetBrains Mono for numeric tables; system sans-serif for UI text.

---

## 11. Default Configure values (file: `src/detection/DetectionPage.jsx`)

| Field | Default |
|---|---|
| Drone counts (M) | `1, 2, 3, 5, 7, 10, 13, 16, 20` |
| Trials per point | `20` |
| Sim duration | **30 days** (`2 592 000 s`) |
| Trial start hour | `8` (morning rush, slot 2) |
| Enable battery + docking | on |
| IoT range R_IoT | 200 m |
| Drone speed v | 12 m/s |
| Battery drain | **3 %/min** (0.05 %/s) — ~33 min endurance |
| Low-battery threshold | 25 % |
| Ready threshold | 80 % |
| Dock transit | 60 s |
| `dt` (sim step) | **5 s** |
| `accidentRateMultiplier` | **REMOVED** — sim runs at real corridor rates |

Sensitivity tab clamps to ≤ 5 trials × ≤ 2 days for synchronous responsiveness; Dispatch tab clamps to ≤ 10 trials × ≤ 7 days. Both still read other params from Configure.

---

## 12. Hardware integration (Supabase)

**Three ESP32 nodes:**
1. **Tilt sensor node** (`sos_sender_sensor_node.ino`) — MPU6050 → ESP-NOW "SOS" → Drone 1 hub.
2. **Drone 1 hub** (`wroom_drone1.ino`) — receives ESP-NOW, repeats over LoRa as "SOS_REPEATED"; also has local IR sensor that sends LoRa "IR_ALERT" (now **edge-triggered only**, fixed earlier).
3. **Home Base / Drone 2** (`sos_reciver_withweb.ino`) — local IR sensor + LoRa receiver; serves local `192.168.4.1` event log in AP mode; **also runs Wi-Fi STA** to POST to Supabase REST.

**Supabase**
- Project: `mkxxnpahwnvapooecfqz` (region `ap-south-1`)
- URL: `https://mkxxnpahwnvapooecfqz.supabase.co`
- Table: `public.hardware_events` — columns: `id bigserial`, `timestamp timestamptz default now()`, `source text`, `event text`. Index on `(timestamp DESC)`. RLS on with anon INSERT + SELECT.
- Anon key lives in `src/hardware/supabase-config.js` AND in the firmware (safe — RLS scope is only this one table).

**Hardware Link tab** (`src/hardware/HardwareEventsPage.jsx`)
- Polls `/rest/v1/hardware_events?limit=100&order=timestamp.desc` every 3 s via plain `fetch()`. No `@supabase/supabase-js` dep.
- KPI strip (Last hour / Last 24h / Total cached / Latest), active-sources chips per-source colored, sticky-header event log table.
- Pause + Refresh + status chip.

**Known Drone-1 fix**: was sending `IR_ALERT` every 1.1 s while held LOW → caused TLS socket-pool starvation on Home Base → `connection refused`. Patched to **fire on falling edge only** (one alert per beam-break).

---

## 13. File layout (cheat sheet)

```
src/
  App.jsx                          top-level shell + top nav
  index.css                        theme tokens (white bg, taupe cards)
  main.jsx                         React entry
  detection/
    DetectionPage.jsx              sidebar + section switch
    lib/
      detection-sim.js             core engine: simulateOnce, simulateWithDispatch,
                                   simulateDetailedLog, simulateBatteryTrace,
                                   simulateDroneTrajectories
      iot-alert.js                 §7-§12 closed-form (computeIotDetection)
      monteCarlo.js                runSweep, runDispatchSweep
      policies.js                  POLICIES.uniform / .riskAware (with patrolMode)
    components/
      SweepConfig.jsx              Configure form
      PolicyResultsPlots.jsx       mean T_alert, P<2min, ΔT(M)
      DetectionCDFPlots.jsx        empirical CDF + P<2min bar
      AvailabilityPlots.jsx        Battery evolution + Available drones + Missed %
      SensitivityPlots.jsx         4 mini sweeps (params clamped, reads Configure)
      AllocationTable.jsx          per-road allocation + risk explanation
      SummaryCard.jsx              auto text + CSV export
      DispatchComparison.jsx       nearest / batteryFirst / balanced (auto-computes)
      FleetAvailabilityPlots.jsx   event-based battery & docking
      LiveMap.jsx                  Leaflet imperative API; sections / patrol / IoT ring
  partitioning/
    PartitionPage.jsx              risk score breakdown UI
    lib/
      sections.js                  1-km section grid + sectionIndexAt
      risk-scoring.js              TIME_SLOTS, WEIGHTS, R_{i,b}, defaultSectionScores
      accident-generator.js        P(i|b), λ_{i,b}, samplePoisson, generateAccidents
      uav-segments.js              uniform + risk-aware (with Hamilton stacking)
      roads.js                     M51 data + composite μ/R
    components/StatsPanel.jsx      per-road detail popup
  hardware/
    supabase-config.js             SUPABASE_URL, SUPABASE_ANON_KEY, fetchHardwareEvents
    HardwareEventsPage.jsx         live polling table (3 s)
  lib/
    geometry.js                    projectToMeters, unprojectMeters, buildRoadPath,
                                   positionAt  (shared by detection + partitioning)
    simulation.js                  legacy CNP demo (Dispatch Protocol page)
    renderer.js                    legacy canvas renderer
  lora/                            link budget calculator (commented out of nav)
  components/                      legacy CNP / SOS components
```

ESP32 sketches live in `C:\Users\HusseinNassareddine\Downloads\`:
- `sos_sender_sensor_node.ino` (tilt node, ESP-NOW sender)
- `wroom_drone1.ino` (ESP-NOW receiver + LoRa repeater + IR)
- `sos_reciver_withweb.ino` (Home Base, AP+STA, LoRa receiver + Supabase POST)

---

## 14. Methodological framing for the thesis writeup

> **One-sentence summary**: Discrete-event Monte Carlo over a Poisson-arrival accident model on a 1-D corridor, with closed-form back-and-forth UAV kinematics and a 5-case IoT-overlap detection rule — aligned with the section-time-slot framework in Hauer 1997 / AASHTO HSM 2010.

**Key conventions / standards**
- Hauer 1997, *Observational Before-After Studies in Road Safety* — Poisson accident-frequency model.
- AASHTO HSM 2010 Ch. 10 — Safety Performance Functions (SPF).
- Hamilton's largest-remainder method (1792 / Balinski & Young 1982) — drone allocation across roads + stacking within risk-aware.
- DJI Mavic 3 datasheet — drone speed (12 m/s cruise) and battery references.
- Lebanese Traffic Law 243/2012 Art. 84 — speed limit reference (motorway category).

---

## 15. Current state of the repo (most recent commits)

```
f404b0f  White page background; taupe cards keep their colour
fe4bed2  Move Hardware Link from sidebar to top nav; render HardwareEventsPage in-app
b88e190  Add "Hardware Link" tab: live ESP32 events from Supabase
0cc46c8  Sensitivity: 'default' reference line + label come from Configure
…
```

Tree is clean against `origin/main`. Workflow: commit + push from the local clone using Windows Credential Manager.

---

## 16. Open / pending items the doctor flagged

| Item | Status |
|---|---|
| Big gap between dispatch lines (Nearest vs Battery-aware / Balanced) | Explained — not a bug; the two non-distance rules ignore position so adding drones doesn't help. Hybrid "nearest-among-eligible" rules **offered, not yet implemented**. |
| Sensitivity / Dispatch tabs runtime under heavy Configure values | Hard-capped (sensitivity ≤ 5 trials × 2 days; dispatch ≤ 10 trials × 7 days). Configure smaller → respected verbatim. |
| Sensitivity Configure-driven defaults | Fixed — amber reference line and "(Configure: X)" labels now read from the live `params`. |
| Hardware integration | Live. Tilt + Drone 2 + Drone 1 all post to Supabase after the edge-trigger fix. |
| Tilt-node calibration / wiring | One-time on each boot; user's responsibility. |

---

## 17. Things the AI agent should remember

- The user prefers **short, terse answers** and **plain language** over math when the audience is the supervisor.
- Don't use the TodoWrite tool name (deprecated) — use **TaskCreate / TaskUpdate**.
- Don't try to start a dev server locally — Node.js isn't installed; the user runs `npm run dev` themselves and verifies in-browser.
- For git pushes use `git config --global credential.helper manager` so Windows Credential Manager handles auth (already configured on this machine).
- For Supabase migrations use the MCP `apply_migration` tool with the existing project `mkxxnpahwnvapooecfqz`.
- The anon key in firmware + browser is **deliberate** and acceptable for this thesis — RLS scopes blast radius to one append-only table.
- Don't reintroduce `accidentRateMultiplier` — the simulator runs at real corridor rates by design.

---

*Generated end-of-session for context handoff. Treat this file as authoritative if the conversation history is missing; treat the code as authoritative if this file disagrees with it.*
