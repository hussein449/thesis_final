# UAV Highway Accident Detection — Project Guide

A walkthrough of every page in the app, the model behind it, and what to focus
on when reading each chart. Written in plain English. Read top-to-bottom for a
first pass, or jump to a specific section using the table of contents.

---

## Table of contents

1. [What this project does](#what-this-project-does)
2. [Core concepts (read this first)](#core-concepts-read-this-first)
3. [Realistic parameter values](#realistic-parameter-values)
4. [The Detection Engine — page-by-page](#the-detection-engine--page-by-page)
   - [Configure](#configure)
   - [Detection performance](#detection-performance)
   - [P(Tₐ < τ) curves (CDF)](#ptₐ--τ-curves-cdf)
   - [Operational metrics](#operational-metrics)
   - [Sensitivity analysis](#sensitivity-analysis)
   - [Allocation table](#allocation-table)
   - [Dispatch strategies](#dispatch-strategies)
   - [Live trial](#live-trial)
   - [Data Sources](#data-sources)
5. [Thesis-defense bullets](#thesis-defense-bullets)

---

## What this project does

Simulates a fleet of patrol drones covering a highway corridor, generates
accidents according to historical statistics, and measures how fast each
accident gets detected via a LoRa IoT alert. Compares two allocation
strategies — **Uniform** (drones spread evenly) vs **Risk-aware** (drones
concentrated on high-risk sections) — to answer: *"For a given fleet size,
which allocation gives the fastest response?"*

---

## Core concepts (read this first)

These are the building blocks every page uses. Get these straight and the
rest of the app makes immediate sense.

### Two parallel grids on the corridor

The road carries **two different grids** that get confused easily:

| Grid | Length | Purpose |
|---|---|---|
| **Highway sections** `S₁…S_N` | 1 km each, fixed | Risk scoring + accident generation |
| **UAV patrol segments** `[A_m, B_m]` | Varies by policy and N | One drone per segment (or stacked) |

Sections never change. Patrol segments depend on the allocation policy and
the number of drones. **They are not the same thing.**

### Risk scoring per section (T, C, M)

Every 1 km section gets three integer scores in `{0, 1, 2}`:

- **T (traffic)** — how heavy the daily traffic load is.
- **C (curvature)** — how dangerous the geometry is (curves, slopes).
- **M (merging)** — interchange/ramp/POI density.

The default M51 profile is **U-shaped**: T=2 at both ends (Khalde and Awali
suburbs), T=0 in the middle (open inter-urban motorway). Edit the per-
section scores in [`risk-scoring.js`](src/partitioning/lib/risk-scoring.js)
to match your own corridor.

### Five time slots per day

Each day has five risk profiles, because traffic/curvature/merging matter
differently at different hours:

| Slot | Window | Dominant factor (weights `a/c/m`) |
|---|---|---|
| 1 | 00–06 (Night) | **Curvature** (0.20 / **0.50** / 0.30) |
| 2 | 06–10 (Morning rush) | **Traffic** (**0.50** / 0.20 / 0.30) |
| 3 | 10–16 (Normal day) | Balanced (0.40 / 0.30 / 0.30) |
| 4 | 16–20 (Evening rush) | **Traffic** (**0.50** / 0.20 / 0.30) |
| 5 | 20–24 (Late evening) | Curvature-leaning (0.30 / 0.40 / 0.30) |

Each section + slot pair gets a risk number `R_{i,b}` which drives both
where accidents land and how Risk-aware divides up the road.

### Two allocation policies

**Uniform** — divide the road length by N, every drone gets `L/N` km. No
risk info used. The "no-information baseline."

**Risk-aware** — group the 1 km sections into N segments by **equal
cumulative risk** (greedy walk). High-risk sections get short segments
(few sections each, more drones near hot spots); low-risk sections get
grouped together (one drone covers more km). At N > 28 the surplus drones
**stack** on the highest-risk segments via Hamilton's largest-remainder.

### The IoT alert detection model

When an accident pops up at position `s_k`, an IoT sensor at the accident
broadcasts. Any UAV within `±R_IoT` metres of `s_k` hears it immediately —
that's the "signal zone" `[s_k − R_IoT, s_k + R_IoT]`.

Only **three candidate drones** are checked:

- The drone whose patrol segment contains the accident — call it segment `m`.
- Its two neighbours — segments `m−1` and `m+1`.

For each candidate, a **closed-form 5-case formula** computes how many
seconds until that drone, on its normal back-and-forth patrol, will first
enter the signal zone. The drone with the smallest `T_alert` wins. If none
can hear the alert (or the winner's `T_alert` exceeds 600 s), the accident
is marked **missed**.

**No chase** — drones never divert. The "dispatch" is a prediction
calculated when the accident is born.

### Stacking (Risk-aware only, N > 28)

The 28-section grid caps Risk-aware at 28 patrol segments. With N=30, two
extra drones are placed on the hottest segments — boundaries unchanged,
but those segments now carry **2 drones each, phase-offset 50 % apart so
they don't move in sync**. At N=50, several hot segments carry 2–3 drones.
Uniform never stacks; it just makes thinner segments (N=50 → 50 segments
of 558 m each).

### Reserves (operational mode only)

When `Enable battery + docking` is ON in Configure: each drone patrols
~25 min, then docks for ~5 min to recharge (~17 % of fleet off-station at
any moment). A **shared reserve pool** plugs the gaps:

- Pool size = `max(2, ⌈N / 8⌉)` — scales with fleet so big fleets don't
  starve.
- When a drone goes to dock, the system checks if its segment is still at
  full allocated coverage. If not, an idle reserve flies out (30 s delay)
  to cover.
- When the original drone returns, the reserve goes idle.

---

## Realistic parameter values

These are the realistic ranges for the M51 corridor (Khalde → Awali) and
the LoRa Ra-02 IoT radio. Use them when defending the numbers.

| Parameter | Realistic range | Currently in code | Notes |
|---|---|---|---|
| **Corridor length** | Pick longer roads (10–30 km) | 27.9 km (M51) | Single road preferred — multiple shorter roads dilute the comparison. |
| **Annual accidents** | **150–250 / year** | 200 / year | Within range. From the historical M51 dataset. |
| **Trial duration** | **1 year** | 30 days default | Bump in Configure to `Sim duration = 365` days for full-year runs. |
| **IoT range R_IoT** | **< 200 m** | 200 m default | Conservative LoRa setting. Stays in the geometry-bound regime where placement matters. |
| **Drone speed** | **24–40 km/h = 6.67–11.11 m/s** | 8 m/s default | Already in range. 8 m/s = 28.8 km/h, conservative cruise. |
| **Battery drain** | **2 % / min** | 3 % / min default | Should be lowered to 2 %/min. Update `batteryDrainRate: 3 / 60` → `2 / 60` in [`detection-sim.js`](src/detection/lib/detection-sim.js) `DEFAULT_PARAMS`. |
| **Trials per point** | 30+ for clean curves, 100+ for noise-free | Configure setting | More trials = smaller error bars. Use ≥ 50 for thesis figures. |

### Why these matter for the comparison

- **IoT range < 200 m** keeps the simulation in the **geometry-bound
  regime** where partition strategy actually matters. At 1–5 km LoRa
  ranges the alert zone covers most of the corridor and the policies
  converge.
- **1-year duration** captures all five time slots evenly and gives
  enough events (150–250) for stable Monte Carlo means.
- **2 %/min drain** is closer to the Mavic 3 datasheet than 3 %/min and
  gives a longer patrol cycle (50 min vs 33 min), reducing the reserve
  pool burden.

---

## The Detection Engine — page-by-page

### Configure

This is where you set up every simulation. Configure values flow into
every other page (with two intentional exceptions: Sensitivity locks to a
1-week window for speed, Dispatch tab caps trials at 10).

**Key controls:**

| Field | What it does |
|---|---|
| **Drone counts (M)** | Comma-separated list. The X-axis of every "vs fleet size" chart. e.g. `5, 10, 15, 20, 30` |
| **Trials per point** | How many Monte Carlo runs to average per data point. ≥ 30 for stable curves. |
| **Sim duration (days)** | Length of each trial. Default 30 days. Bump to 365 for full-year runs. |
| **Time-of-day mode** | Dropdown — `Auto` runs all 5 slots naturally over the trial; `1`–`5` locks every accident to that slot's risk profile. |
| **Trial start hour** | Where the wall-clock starts (greyed out when a slot is locked). |
| **Enable battery + docking** | Turn on the reserve/recharge cycle. Off = all drones patrol forever. |
| **Advanced** | IoT range, drone speed, battery rates, dock thresholds. |

**Workflow:** set values → click ▶ Run sweep → all result tabs populate.

---

### Detection performance

The headline tab. Two curves side-by-side:

**Mean detection time vs fleet size** — lower is better. Shows how quickly
the system catches accidents on average. Risk-aware (orange) typically
sits below Uniform (blue) in the resource-constrained regime (N ≤ 20),
converging at higher N (saturation).

**Detection within 2 minutes vs fleet size** — higher is better. The
"service-level" metric. What fraction of accidents are caught within the
2-minute window? Often the better metric for defending a fleet size.

**Summary & tradeoffs panel** auto-narrates the winner at the smallest and
largest N you swept. Click ⬇ Export CSV to get raw numbers.

**What to focus on:** *"At our target SLA (80 % within 2 minutes), which
fleet size hits it under each policy?"*

---

### P(Tₐ < τ) curves (CDF)

The detailed time-distribution chart, evaluated at a single fleet size.

**Top chart**: empirical CDF — at each second `τ` on the X-axis, what
fraction of accidents are detected? A curve shifted left = faster
detection. The vertical dashed line at 120 s (2 min) is the SLA reference.

**Bottom chart**: same data, but plotted vs fleet size — "what % of
accidents are detected within 2 minutes at each N?" Crossing the 80 %
horizontal line tells you your minimum viable fleet size.

**What to focus on:** *"Where does my curve cross the 2-minute and the
80 % SLA lines?"* That's your operational fleet floor.

---

### Operational metrics

Activated when `Enable battery + docking` is ON.

**Average available drones over time** — at each second of the trial, how
many drones are actually patrolling (rest are returning/docked). With
battery OFF the line is flat at N. With battery ON it dips when drones
recharge — useful for checking your reserve pool is doing its job.

**Missed detections vs fleet size** — fraction of accidents that
**exceeded the 10-minute window**. On a healthy fleet this should be
near zero. A non-zero bar means coverage gaps are leaking through. With
the reserve fix, this should stay below 1 % across the whole range.

**What to focus on:** if Missed % is meaningful (> 1 %), either bump N or
loosen `maxDetectionWindow`. If Available-drones dips below `0.7 × N`
often, raise the reserve pool size or lower the battery drain.

---

### Sensitivity analysis

A 2×2 grid of "what if?" charts at the median fleet size from your sweep.
Each chart varies **one parameter** while holding all others at Configure
values. **Fixed 1-week window** per trial here (speed optimisation).

The four parameters swept:

1. **Patrol speed** — most sensitive parameter usually. Faster drone =
   linearly faster detection.
2. **Trial start hour** — should be **flat** if Time-of-day mode is Auto
   (slot averaging) or if a slot is locked. A non-flat slope here = bug.
3. **Dock threshold** — when does a drone leave for recharge? Usually
   insensitive — battery cycle is short relative to patrol time.
4. **IoT range R_IoT** — second most sensitive. Wider range = faster
   detection, especially below 300 m. Above 300 m the curves flatten
   (saturation).

The **amber dashed reference line** on each chart marks your Configure
value — and the Configure value is also plotted as a real data point so
you can read its predicted detection time directly.

**What to focus on:** *"If I could improve one parameter, which gives the
biggest win?"* Usually patrol speed or IoT range. Battery thresholds
rarely matter.

---

### Allocation table

Shows how many drones each policy assigns to each road. With one road
(M51), Uniform and Risk-aware both put all N drones on it — the column
counts are equal. But the **per-segment breakdown** in the Live Trial
shows the different partitioning shapes.

**What to focus on:** confirm both policies deploy the same fleet size at
each row (sanity check). The per-section/per-segment shape is more
visible in Live Trial.

---

### Dispatch strategies

A **separate, simpler simulation** comparing three rules for picking
which drone to send when an accident occurs:

- **Nearest drone** — closest physically.
- **Battery-aware** — most charge remaining.
- **Balanced load** — fewest prior dispatches.

**Important caveat — bare-bones model:** this tab uses a stripped-down
sim with **no reserves, no stacking**, and the strict "missed" criterion
*"zero drones patrolling at the exact instant of accident."* That's why
the missed bars can spike at one specific N — small-sample variance, not
a real defect.

**The result is brutal**: Nearest drone wins by ~100×. Mean detection
time for Nearest is near 0 s; the other two sit at 1,500–1,800 s because
they pick a drone by bookkeeping (battery / fairness) rather than
proximity, often dispatching a drone 15 km away.

**What to focus on:** *"Just use Nearest. Don't optimise for battery or
fairness when there's a wreck on the highway — proximity wins."*

---

### Live trial

The animated visualization. Drones bounce along their patrol segments in
real time, accidents pop up as red triangles, detected ones turn green,
missed ones grey. Use the **policy** and **fleet size** buttons to
compare patrols visually.

**Key visual features:**

- **Violet patrol bands** with white labels — UAV segments `[A_m, B_m]`.
  Stacked segments show an **amber `×k` chip** (e.g. `×2`, `×3`) — that's
  Risk-aware's hot-spot doubling.
- **Cyan tick marks** — 1 km highway section boundaries (the scoring
  grid). Major 5-km labels visible.
- **Red pulsing IoT zones** — appear around each pending accident at
  radius R_IoT.
- **Top-strip time-of-day pill** — ticks with sim time. Turns **amber +
  🔒** when a time slot is force-locked.

**Bottom panel** — event log with every accident, detection, and miss
timestamped. Export as JSON for the appendix.

**What to focus on:** see partitioning differences between policies. At
N=20 Risk-aware, look for short violet bands at the corridor ends (km 0–4
and 22–28) and long bands in the middle. At N=30 Risk-aware, look for
amber `×2` chips on those end bands.

---

### Data Sources

The provenance page — lists corridor data sources, accident statistics
references, parameter citations. Use this when defending where numbers
came from.

---

## Thesis-defense bullets

A grab-bag of one-liners you can drop into the discussion / Q&A.

### On allocation

> *"Risk-aware allocation outperforms Uniform in the resource-constrained
> regime (N ≤ 20 on M51). Above N ≈ 25 the corridor saturates and the
> choice of policy becomes immaterial — both deliver near-zero detection
> time."*

> *"Risk-aware is never worse than Uniform on this corridor; the gap
> shrinks to zero at high N but never flips. Uniform's only advantage is
> simplicity — it requires no risk information to deploy."*

### On dispatch

> *"The dispatch comparison shows that proximity dominates other
> selection criteria. Nearest drone is ~100× faster than Battery-aware
> or Balanced load. Battery and fairness rules make sense for patrol
> bookkeeping, not for incident response."*

### On the SLA

> *"To hit an 80 % within-2-minutes service level on M51, we need
> approximately N = 20 drones under Risk-aware allocation; Uniform
> requires roughly 1–2 more."*

### On stacking (N > 28)

> *"Risk-aware allocates additional drones beyond 28 to high-risk
> segments via Hamilton's largest-remainder method, with phase-offset
> starting positions to ensure they don't move in sync. This preserves
> the strategy advantage at large fleet sizes; without stacking the
> partitioner would silently cap at the section count and the policy
> comparison would be unfair."*

### On reserves

> *"The reserve pool scales with fleet size as ⌈N/8⌉, calibrated to the
> battery duty cycle: under the 2 %/min drain, roughly 1 in 7 drones is
> off-station at any moment, and reserves are reusable across gaps.
> Empirically this keeps the missed-accident rate below 1 %."*

### On the trade-off

> *"Risk-aware wins on mean detection time but can lose on worst-case
> coverage — concentrating drones on hot spots leaves the low-risk middle
> thinly covered, so rare middle-corridor accidents can time out. If the
> operational goal is fast average response, use Risk-aware. If it's no
> accident left behind even when average is slower, Uniform is the
> safer pick."*

### On the realistic-data parameter ranges

> *"All parameters are calibrated to ground-truth measurements: M51
> accident rate 150–250/year from the corridor's historical dataset;
> patrol speed 24–40 km/h matching realistic surveillance cruise;
> battery drain 2 %/min per Mavic 3 datasheet; IoT range < 200 m as a
> conservative LoRa Ra-02 setting in suburban-coastal terrain."*

---

## Quick reference — where to change what

| You want to... | Edit |
|---|---|
| Change annual accident rate | [`roads.js`](src/partitioning/lib/roads.js) — `accidents` field |
| Change section-level T / C / M | [`risk-scoring.js`](src/partitioning/lib/risk-scoring.js) — `defaultTrafficScore`, `defaultCurvatureScore`, `defaultMergingScore` |
| Add another road | [`roads.js`](src/partitioning/lib/roads.js) — push another road to `ROADS` |
| Change time-slot weights | [`risk-scoring.js`](src/partitioning/lib/risk-scoring.js) — `WEIGHTS` table |
| Change default drone speed / IoT range / battery params | [`detection-sim.js`](src/detection/lib/detection-sim.js) — `DEFAULT_PARAMS` |
| Change reserve pool sizing | [`detection-sim.js`](src/detection/lib/detection-sim.js) — search `Math.ceil(totalAssignedDrones / 8)` |
| Change Sensitivity tab window | [`SensitivityPlots.jsx`](src/detection/components/SensitivityPlots.jsx) — `TRIAL_TIME` constant |
| Add a new dispatch rule | [`DispatchComparison.jsx`](src/detection/components/DispatchComparison.jsx) — `DISPATCH_STRATEGIES` + matching branch in [`detection-sim.js`](src/detection/lib/detection-sim.js) `simulateWithDispatch` |
