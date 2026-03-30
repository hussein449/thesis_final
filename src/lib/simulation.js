/* ═══════════════════════════════════════
   Simulation Engine — Pure Logic
   No DOM access. React reads state.
   ═══════════════════════════════════════ */

export function createSimulation() {
  /* Layout constants */
  const W = 1100, H = 420;
  const RX1 = 100, RX2 = W - 30, RY1 = 140, RY2 = 290;
  const RCY = (RY1 + RY2) / 2, PPM = (RY2 - RY1) / 20;
  const MIN_PATROL = 2;

  /* Two docking stations — left and right of the road */
  const DOCKS = [
    { id: 0, x: RX1 + 80,  y: RY2 + 55, label: 'DOCK A' },
    { id: 1, x: RX2 - 80,  y: RY2 + 55, label: 'DOCK B' },
  ];

  /* Four roadside sensors spread along the top of the road */
  const SENSORS = [
    { id: 1, x: RX1 + (RX2 - RX1) * 0.12, y: RY1 - 24 },
    { id: 2, x: RX1 + (RX2 - RX1) * 0.38, y: RY1 - 24 },
    { id: 3, x: RX1 + (RX2 - RX1) * 0.62, y: RY1 - 24 },
    { id: 4, x: RX1 + (RX2 - RX1) * 0.82, y: RY1 - 24 },
  ];

  /* Return-to-patrol delay (seconds at incident before heading back) */
  const RETURN_DELAY = 1.5;

  /* State */
  let drones = [], reserveDrones = [], wave = null, commArrows = [], swapOps = [];
  let simState = 'idle', rot = 0, simMs = 0, sensorPulse = 0;
  let severity = 0, ackDroneIdx = -1, primaryIdx = -1, backupIdx = -1;
  let activeSensorIdx = 0;
  let sosFrame = { sensorId: 0, lat: 0, lon: 0, timestamp: 0, severity: 0 };
  let logs = [];
  let logCounter = 0;
  let arrivedTimers = {};

  /* Config (set from React sliders) */
  let config = {
    droneCount: 5, droneSpeed: 6, waveSpeed: 2,
    freq: 868, txPwr: 14, batDrain: 0.5,
    minBat: 25, lowBat: 30, reserveCount: 2
  };

  function setConfig(c) { Object.assign(config, c); }
  function setSeverity(s) { severity = s; }

  /* Active sensor helpers */
  function activeSensor() { return SENSORS[activeSensorIdx]; }
  function getLandPos() { return { lx: activeSensor().x, ly: RY1 + 20 }; }

  /* Helpers */
  function distPx(d) {
    const s = activeSensor();
    return Math.hypot(d.x - s.x, d.y - s.y);
  }
  function distM(d) { return distPx(d) / PPM; }

  function addLog(msg, cls) {
    logCounter++;
    logs.unshift({ id: logCounter, msg, cls, ts: Math.floor(simMs) });
    if (logs.length > 40) logs.length = 40;
  }

  function addArrow(fx, fy, tx, ty, color, label, dur) {
    commArrows.push({ fromX: fx, fromY: fy, toX: tx, toY: ty, color, label, progress: 0, dur: dur || 600, age: 0 });
  }

  function calcBid(d) {
    const dist = distM(d);
    if (d.battery < config.minBat || d.range < 3) return -1;
    return Math.max(0, 1 - dist / 500) * 50 + (d.battery / 100) * 30 + (d.range / 15) * 20;
  }

  /* Build */
  function rebuildDrones() {
    const n = config.droneCount, lH = (RY2 - RY1 - 16) / n;
    drones = [];
    arrivedTimers = {};
    for (let i = 0; i < n; i++) {
      const ly = RY1 + 8 + (i + 0.5) * lH;
      drones.push({
        x: RX1 + 40 + Math.random() * (RX2 - RX1 - 80), y: ly, laneY: ly,
        dir: Math.random() < 0.5 ? 1 : -1, state: 'idle',
        rotOff: Math.random() * Math.PI * 2, id: i + 1,
        battery: 45 + Math.floor(Math.random() * 50),
        range: 3 + Math.floor(Math.random() * 10),
        flyProgress: 0, flyStartX: 0, flyStartY: 0, bid: 0, swapPending: false,
        returnDockX: DOCKS[0].x, returnDockY: DOCKS[0].y,
      });
    }
  }

  function rebuildReserve() {
    reserveDrones = []; swapOps = [];
    const n = config.reserveCount;
    const dockCounters = new Array(DOCKS.length).fill(0);
    for (let i = 0; i < n; i++) {
      const di = i % DOCKS.length;
      const dock = DOCKS[di];
      const localI = dockCounters[di];
      dockCounters[di]++;
      reserveDrones.push({
        id: 'R' + (i + 1), battery: 100, state: 'docked',
        x: dock.x - 8 + localI * 18, y: dock.y - 8,
        homeX: dock.x, homeY: dock.y, dockIdx: di,
      });
    }
  }

  function rebuildAll() { rebuildDrones(); rebuildReserve(); }

  /* SOS */
  function generateSOS() {
    sosFrame = {
      sensorId: activeSensor().id,
      lat: 33.85 + Math.random() * 0.05,
      lon: 35.50 + Math.random() * 0.05,
      timestamp: Math.floor(Date.now() / 1000),
      severity
    };
  }

  /* Return a drone from incident back to its patrol lane */
  function returnToPatrol(droneIdx) {
    const d = drones[droneIdx];
    d.state = 'returningToPatrol';
    d.flyStartX = d.x;
    d.flyStartY = d.y;
    d.flyProgress = 0;
    addLog(`[${Math.floor(simMs)}ms] D${d.id} → returning to patrol`, 'cl-ack');
    addArrow(d.x, d.y, d.x, d.laneY, '#22d3ee', 'RTN', 400);
  }

  /* Swap logic — dispatches the reserve with the MOST battery that still
     exceeds the requesting drone's current charge level. */
  function triggerSwap(droneIdx) {
    const d = drones[droneIdx];
    d.swapPending = true;

    /* Pick reserve with highest battery that beats the requesting drone */
    let rIdx = -1, bestBat = d.battery; // threshold: must be better than current drone
    for (let r = 0; r < reserveDrones.length; r++) {
      const rd = reserveDrones[r];
      if (rd.state === 'docked' && rd.battery > bestBat) {
        bestBat = rd.battery;
        rIdx = r;
      }
    }

    if (rIdx < 0) {
      addLog(`[${Math.floor(simMs)}ms] D${d.id} LOW BAT (${d.battery.toFixed(0)}%) — no reserve with higher charge`, 'cl-sos');
      return;
    }

    const rd = reserveDrones[rIdx];
    const dockX = rd.homeX, dockY = rd.homeY;

    addLog(`[${Math.floor(simMs)}ms] D${d.id} (${d.battery.toFixed(0)}%) → swapping with ${rd.id} (${rd.battery.toFixed(0)}%)`, 'cl-dock');
    addArrow(d.x, d.y, dockX, dockY, '#14b8a6', 'LOW BAT', 500);

    setTimeout(() => {
      addLog(`[${Math.floor(simMs)}ms] ${rd.id} dispatched → replacing D${d.id}`, 'cl-dock');
      rd.state = 'deploying';
      addArrow(dockX, dockY, d.x, d.y, '#14b8a6', rd.id, 600);
      swapOps.push({
        reserveIdx: rIdx, targetDroneIdx: droneIdx, progress: 0,
        startX: dockX, startY: dockY,
        targetX: d.x, targetY: d.laneY, label: rd.id,
      });
      setTimeout(() => {
        d.state = 'returning';
        d.flyStartX = d.x; d.flyStartY = d.y; d.flyProgress = 0;
        d.returnDockX = dockX; d.returnDockY = dockY;
        addLog(`[${Math.floor(simMs)}ms] D${d.id} → heading to ${DOCKS.find(dk => dk.x === dockX)?.label || 'dock'}`, 'cl-dock');
        addArrow(d.x, d.y, dockX, dockY, '#14b8a6', 'RTN', 500);
      }, 800);
    }, 700);
  }

  /* Evaluation */
  function startEvaluation(ackIdx) {
    const sx = activeSensor().x, sy = activeSensor().y;
    addLog(`[${Math.floor(simMs)}ms] Evaluating fleet (sev=${severity}, minPatrol=${MIN_PATROL})`, 'cl-eval');
    for (let i = 0; i < drones.length; i++) drones[i].bid = calcBid(drones[i]);
    const maxDeploy = Math.max(0, drones.length - MIN_PATROL);
    addLog(`[${Math.floor(simMs)}ms] ${drones.length} drones, maxDeploy=${maxDeploy}`, 'cl-eval');

    if (maxDeploy < 1) {
      addLog(`[${Math.floor(simMs)}ms] Cannot deploy — patrol minimum!`, 'cl-sos');
      simState = 'idle';
      if (ackIdx >= 0 && ackIdx < drones.length) drones[ackIdx].state = 'idle';
      return;
    }

    if (severity === 0) {
      addLog(`[${Math.floor(simMs)}ms] Sev=0: single drone`, 'cl-cnp');
      const ackD = drones[ackIdx];
      if (ackD.bid > 0) {
        primaryIdx = ackIdx;
        addLog(`[${Math.floor(simMs)}ms] D${ackD.id} eligible (bid=${ackD.bid.toFixed(1)}). Deploying.`, 'cl-deploy');
        setTimeout(() => deployDrones(ackIdx), 500);
      } else {
        drones[ackIdx].state = 'idle';
        addLog(`[${Math.floor(simMs)}ms] D${ackD.id} below threshold → forwarding CFP`, 'cl-cnp');
        addArrow(ackD.x, ackD.y, sx, sy, '#f59e0b', 'CFP', 400);
        setTimeout(() => runCNPSingle(ackIdx), 800);
      }
    } else {
      addLog(`[${Math.floor(simMs)}ms] Sev=1: CNP dual response`, 'cl-cnp');
      addLog(`[${Math.floor(simMs)}ms] D${drones[ackIdx].id} sending CFP...`, 'cl-cnp');
      for (let ci = 0; ci < drones.length; ci++) {
        if (ci !== ackIdx) addArrow(drones[ackIdx].x, drones[ackIdx].y, drones[ci].x, drones[ci].y, '#f59e0b', 'CFP', 400);
      }
      setTimeout(() => runCNPDual(ackIdx, maxDeploy), 1200);
    }
  }

  function runCNPSingle(ackIdx) {
    let bestIdx = -1, bestBid = -1;
    for (let i = 0; i < drones.length; i++) { if (drones[i].bid > bestBid) { bestBid = drones[i].bid; bestIdx = i; } }
    if (bestIdx >= 0) {
      primaryIdx = bestIdx;
      addLog(`[${Math.floor(simMs)}ms] Best: D${drones[bestIdx].id} (bid=${bestBid.toFixed(1)})`, 'cl-deploy');
      for (let bi = 0; bi < drones.length; bi++) {
        if (drones[bi].bid > 0) addArrow(drones[bi].x, drones[bi].y, drones[ackIdx].x, drones[ackIdx].y, '#22d3ee', `BID:${drones[bi].bid.toFixed(0)}`, 500);
      }
      setTimeout(() => { addArrow(drones[ackIdx].x, drones[ackIdx].y, drones[primaryIdx].x, drones[primaryIdx].y, '#a855f7', 'ACCEPT', 400); setTimeout(() => deployDrones(ackIdx), 600); }, 700);
    } else {
      addLog(`[${Math.floor(simMs)}ms] No eligible drones!`, 'cl-sos');
      simState = 'idle';
      if (ackIdx >= 0 && ackIdx < drones.length) drones[ackIdx].state = 'idle';
    }
  }

  function runCNPDual(ackIdx, maxDeploy) {
    for (let bi = 0; bi < drones.length; bi++) {
      if (bi !== ackIdx && drones[bi].bid > 0) {
        addArrow(drones[bi].x, drones[bi].y, drones[ackIdx].x, drones[ackIdx].y, '#22d3ee', `BID:${drones[bi].bid.toFixed(0)}`, 500);
        addLog(`[${Math.floor(simMs)}ms] D${drones[bi].id} bid=${drones[bi].bid.toFixed(1)}`, 'cl-bid');
      }
    }
    setTimeout(() => {
      addLog(`[${Math.floor(simMs)}ms] Evaluating bids...`, 'cl-eval');
      const el = [];
      for (let i = 0; i < drones.length; i++) { if (drones[i].bid > 0) el.push({ idx: i, bid: drones[i].bid }); }
      el.sort((a, b) => b.bid - a.bid);

      if (el.length >= 2 && maxDeploy >= 2) {
        primaryIdx = el[0].idx; backupIdx = el[1].idx;
        addLog(`[${Math.floor(simMs)}ms] PRIMARY: D${drones[primaryIdx].id} (bid=${el[0].bid.toFixed(1)})`, 'cl-deploy');
        addLog(`[${Math.floor(simMs)}ms] BACKUP: D${drones[backupIdx].id} (bid=${el[1].bid.toFixed(1)})`, 'cl-deploy');
        addArrow(drones[ackIdx].x, drones[ackIdx].y, drones[primaryIdx].x, drones[primaryIdx].y, '#a855f7', 'ACCEPT', 400);
        addArrow(drones[ackIdx].x, drones[ackIdx].y, drones[backupIdx].x, drones[backupIdx].y, '#f59e0b', 'ACCEPT', 400);
        for (let ri = 0; ri < el.length; ri++) {
          if (el[ri].idx !== primaryIdx && el[ri].idx !== backupIdx)
            addArrow(drones[ackIdx].x, drones[ackIdx].y, drones[el[ri].idx].x, drones[el[ri].idx].y, '#ef4444', 'REJECT', 300);
        }
        setTimeout(() => deployDrones(ackIdx), 800);
      } else if (el.length >= 1) {
        primaryIdx = el[0].idx;
        addLog(`[${Math.floor(simMs)}ms] Only 1 deployable: D${drones[primaryIdx].id}`, 'cl-deploy');
        setTimeout(() => deployDrones(ackIdx), 600);
      } else {
        addLog(`[${Math.floor(simMs)}ms] No eligible!`, 'cl-sos');
        simState = 'idle';
        if (ackIdx >= 0 && ackIdx < drones.length) drones[ackIdx].state = 'idle';
      }
    }, 1000);
  }

  function deployDrones(ackIdx) {
    simState = 'flying';
    if (ackIdx >= 0 && ackIdx < drones.length && ackIdx !== primaryIdx && ackIdx !== backupIdx) {
      drones[ackIdx].state = 'idle';
      addLog(`[${Math.floor(simMs)}ms] D${drones[ackIdx].id} resumes patrol (ACK mgr)`, 'cl-ack');
    }
    for (let ri = 0; ri < drones.length; ri++) { if (drones[ri].state === 'reached') drones[ri].state = 'idle'; }
    if (primaryIdx >= 0) { const pd = drones[primaryIdx]; pd.state = 'flying'; pd.flyStartX = pd.x; pd.flyStartY = pd.y; pd.flyProgress = 0; addLog(`[${Math.floor(simMs)}ms] D${pd.id} deploying to incident`, 'cl-deploy'); }
    if (backupIdx >= 0) { const bd = drones[backupIdx]; bd.state = 'flying'; bd.flyStartX = bd.x; bd.flyStartY = bd.y; bd.flyProgress = 0; addLog(`[${Math.floor(simMs)}ms] D${bd.id} (backup) deploying`, 'cl-deploy'); }
  }

  /* Main tick */
  function tick(dt) {
    rot += dt * 8;
    simMs += dt * 1000;
    sensorPulse = (sensorPulse + dt * 0.8) % 1;
    const dSpdPx = config.droneSpeed * PPM * dt;
    const batDrain = config.batDrain * dt;

    /* Move idle + drain battery */
    for (const d of drones) {
      if (d.state === 'idle') {
        d.x += d.dir * dSpdPx;
        if (d.x > RX2 - 15) { d.x = RX2 - 15; d.dir = -1; }
        if (d.x < RX1 + 15) { d.x = RX1 + 15; d.dir = 1; }
        d.battery = Math.max(0, d.battery - batDrain);
        if (d.battery <= config.lowBat && !d.swapPending) triggerSwap(drones.indexOf(d));
      }

      /* Returning to dock — head to the drone's assigned dock */
      if (d.state === 'returning') {
        d.flyProgress += dt * 0.4 * config.waveSpeed;
        const rdx = d.returnDockX !== undefined ? d.returnDockX : DOCKS[0].x;
        const rdy = d.returnDockY !== undefined ? d.returnDockY : DOCKS[0].y;
        if (d.flyProgress >= 1) {
          d.flyProgress = 1; d.x = rdx; d.y = rdy; d.state = 'docked';
          addLog(`[${Math.floor(simMs)}ms] D${d.id} docked & charging.`, 'cl-dock');
        } else {
          const t = d.flyProgress, e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
          d.x = d.flyStartX + (rdx - d.flyStartX) * e;
          d.y = d.flyStartY + (rdy - d.flyStartY) * e;
        }
      }

      /* Return to patrol lane animation */
      if (d.state === 'returningToPatrol') {
        d.flyProgress += dt * 0.5 * config.waveSpeed;
        if (d.flyProgress >= 1) {
          d.flyProgress = 1;
          d.y = d.laneY;
          d.state = 'idle';
          d.dir = Math.random() < 0.5 ? 1 : -1;
          const idx = drones.indexOf(d);
          delete arrivedTimers[idx];
          addLog(`[${Math.floor(simMs)}ms] D${d.id} resumed patrol`, 'cl-ack');
        } else {
          const t = d.flyProgress, e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
          d.y = d.flyStartY + (d.laneY - d.flyStartY) * e;
        }
      }

      /* Charge patrol drones that are docked */
      if (d.state === 'docked') {
        d.battery = Math.min(100, d.battery + dt * 3);
      }
    }

    /* Arrived drones: count down then return to patrol */
    if (simState === 'arrived' || simState === 'flying') {
      for (let i = 0; i < drones.length; i++) {
        if (drones[i].state === 'arrived') {
          if (arrivedTimers[i] === undefined) arrivedTimers[i] = 0;
          arrivedTimers[i] += dt;
          if (arrivedTimers[i] >= RETURN_DELAY) {
            returnToPatrol(i);
          }
        }
      }
      if (simState === 'arrived') {
        let anyStillOut = false;
        for (let i = 0; i < drones.length; i++) {
          if (drones[i].state === 'arrived' || drones[i].state === 'returningToPatrol') {
            anyStillOut = true; break;
          }
        }
        if (!anyStillOut) {
          simState = 'idle';
          primaryIdx = -1; backupIdx = -1; ackDroneIdx = -1;
          addLog(`[${Math.floor(simMs)}ms] All drones back on patrol. Ready.`, 'cl-ack');
        }
      }
    }

    /* Swap ops */
    for (let si = swapOps.length - 1; si >= 0; si--) {
      const sw = swapOps[si];
      sw.progress += dt * 0.35 * config.waveSpeed;
      if (sw.progress >= 1) {
        sw.progress = 1;
        const rd = reserveDrones[sw.reserveIdx]; rd.state = 'deployed';
        const newId = drones.length + 1;
        drones.push({
          x: sw.targetX, y: sw.targetY, laneY: sw.targetY,
          dir: Math.random() < 0.5 ? 1 : -1, state: 'idle',
          rotOff: Math.random() * Math.PI * 2, id: newId,
          battery: rd.battery, range: 8 + Math.floor(Math.random() * 5),
          flyProgress: 0, flyStartX: 0, flyStartY: 0, bid: 0, swapPending: false,
          returnDockX: rd.homeX, returnDockY: rd.homeY,
        });
        addLog(`[${Math.floor(simMs)}ms] ${rd.id} now D${newId} (bat=${rd.battery.toFixed(0)}%)`, 'cl-dock');
        swapOps.splice(si, 1);
      }
    }

    /* Reserve drones charging */
    for (const rd of reserveDrones) {
      if (rd.state === 'docked') rd.battery = Math.min(100, rd.battery + dt * 3);
    }

    /* Arrows */
    for (let i = commArrows.length - 1; i >= 0; i--) {
      const a = commArrows[i]; a.age += dt * 1000; a.progress = Math.min(1, a.age / a.dur);
      if (a.progress >= 1 && a.age > a.dur + 400) commArrows.splice(i, 1);
    }

    /* Broadcasting — wave expands from active sensor */
    const sx = activeSensor().x, sy = activeSensor().y;
    if (simState === 'broadcasting' && wave) {
      wave.r += dt * config.waveSpeed * 120;
      for (let wi = 0; wi < drones.length; wi++) {
        const wd = drones[wi];
        if (wd.state === 'idle' && wave.r >= distPx(wd)) {
          wd.state = 'reached';
          addLog(`[${Math.floor(simMs)}ms] D${wd.id} received SOS`, 'cl-sos');
          if (ackDroneIdx < 0) {
            ackDroneIdx = wi; wd.state = 'ackSender';
            addLog(`[${Math.floor(simMs)}ms] D${wd.id} sending ACK...`, 'cl-ack');
            addArrow(wd.x, wd.y, sx, sy, '#10b981', 'ACK', 500);
            ((idx) => { setTimeout(() => { if (simState !== 'broadcasting') return; simState = 'evaluating'; addLog(`[${Math.floor(simMs)}ms] ACK received. Broadcast stopped.`, 'cl-ack'); wave = null; startEvaluation(idx); }, 600); })(wi);
          }
        }
      }
      if (wave && wave.r > wave.maxR) wave.r = wave.maxR;
    }

    /* Flying — drones head to active sensor's landing position */
    if (simState === 'flying') {
      const { lx: LAND_X, ly: LAND_Y } = getLandPos();
      let allArr = true;
      for (let fi = 0; fi < drones.length; fi++) {
        const fd = drones[fi];
        if (fd.state === 'flying') {
          allArr = false; fd.flyProgress += dt * 0.35 * config.waveSpeed;
          const tx = LAND_X + (fi === backupIdx ? 25 : 0), ty = LAND_Y + (fi === backupIdx ? 10 : 0);
          if (fd.flyProgress >= 1) { fd.flyProgress = 1; fd.x = tx; fd.y = ty; fd.state = 'arrived'; addLog(`[${Math.floor(simMs)}ms] D${fd.id} arrived!`, 'cl-arrive'); }
          else { const t = fd.flyProgress, e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2; fd.x = fd.flyStartX + (tx - fd.flyStartX) * e; fd.y = fd.flyStartY + (ty - fd.flyStartY) * e; }
        }
      }
      if (allArr) { simState = 'arrived'; addLog(`[${Math.floor(simMs)}ms] All drones on site. Mission complete.`, 'cl-arrive'); }
    }
  }

  /* Actions */
  function triggerAccident() {
    if (simState !== 'idle' && simState !== 'arrived') return false;
    activeSensorIdx = Math.floor(Math.random() * SENSORS.length);
    for (const d of drones) { if (d.state !== 'returning' && d.state !== 'docked') { d.state = 'idle'; d.bid = 0; d.flyProgress = 0; } }
    ackDroneIdx = -1; primaryIdx = -1; backupIdx = -1; commArrows = [];
    arrivedTimers = {};
    simState = 'broadcasting'; generateSOS();
    let maxPx = 0; for (const d of drones) { const dist = distPx(d); if (dist > maxPx) maxPx = dist; }
    wave = { r: 0, maxR: maxPx + 80 };
    addLog(`[0ms] ⚠ ACCIDENT! Sensor ${activeSensor().id} broadcasting (sev=${severity})`, 'cl-sos');
    simMs = 0;
    return true;
  }

  function reset() {
    wave = null; commArrows = []; swapOps = [];
    ackDroneIdx = -1; primaryIdx = -1; backupIdx = -1;
    simMs = 0; simState = 'idle'; sensorPulse = 0;
    activeSensorIdx = 0;
    logs = []; logCounter = 0;
    arrivedTimers = {};
    rebuildAll();
  }

  /* Getters */
  function getState() {
    const s = activeSensor();
    const { lx: LAND_X, ly: LAND_Y } = getLandPos();
    return {
      drones, reserveDrones, wave, commArrows, swapOps, logs,
      simState, simMs, severity, sosFrame, rot, sensorPulse,
      ackDroneIdx, primaryIdx, backupIdx, logCounter,
      sensors: SENSORS, activeSensorIdx,
      docks: DOCKS,
      /* layout constants for canvas */
      W, H, RX1, RX2, RY1, RY2, RCY, PPM,
      SX: s.x, SY: s.y, LAND_X, LAND_Y,
    };
  }

  rebuildAll();
  return { tick, triggerAccident, reset, getState, setConfig, setSeverity, rebuildAll };
}
