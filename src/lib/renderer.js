/* Canvas Renderer — takes simulation state and draws to canvas */

export function renderCanvas(cx, s) {
  const { W, H, RX1, RX2, RY1, RY2, RCY, PPM, SX, SY, LAND_X, LAND_Y,
          drones, reserveDrones, wave, commArrows, swapOps,
          simState, rot, sensorPulse, backupIdx,
          sensors, activeSensorIdx, docks } = s;

  cx.clearRect(0, 0, W, H);

  /* Sky */
  const sky = cx.createLinearGradient(0, 0, 0, RY1);
  sky.addColorStop(0, '#04060d'); sky.addColorStop(1, '#0a1020');
  cx.fillStyle = sky; cx.fillRect(0, 0, W, RY1);
  cx.fillStyle = 'rgba(180,200,240,.1)';
  for (let i = 0; i < 40; i++) { cx.beginPath(); cx.arc((i*173+17)%W, (i*89+5)%(RY1-20), .5, 0, Math.PI*2); cx.fill(); }

  /* Trees */
  cx.fillStyle = '#0b1510';
  for (let tx = 0; tx < W; tx += 20) {
    const th = 12 + Math.sin(tx*.22)*5;
    cx.beginPath(); cx.moveTo(tx-7,RY1); cx.lineTo(tx,RY1-th); cx.lineTo(tx+7,RY1); cx.closePath(); cx.fill();
  }
  cx.fillStyle = '#101e0c'; cx.fillRect(0, RY1-8, W, 10);

  /* Road */
  cx.fillStyle = '#141820'; cx.fillRect(RX1, RY1, RX2-RX1, RY2-RY1);
  cx.strokeStyle = '#a08820'; cx.lineWidth = 2;
  cx.beginPath(); cx.moveTo(RX1,RY1); cx.lineTo(RX2,RY1); cx.stroke();
  cx.beginPath(); cx.moveTo(RX1,RY2); cx.lineTo(RX2,RY2); cx.stroke();
  cx.strokeStyle = 'rgba(200,200,200,.18)'; cx.lineWidth = 1.5; cx.setLineDash([16,12]);
  cx.beginPath(); cx.moveTo(RX1,RCY); cx.lineTo(RX2,RCY); cx.stroke(); cx.setLineDash([]);
  cx.fillStyle = '#0c170a'; cx.fillRect(0, RY2, W, H-RY2);
  cx.fillStyle = '#10151c'; cx.fillRect(RX1, RY2, RX2-RX1, 6);

  /* ── Docking Stations ── */
  for (let di = 0; di < docks.length; di++) {
    const dock = docks[di];

    /* Filter reserve drones belonging to this dock */
    const dockReserves = reserveDrones.filter(rd => rd.dockIdx === di);

    cx.save(); cx.translate(dock.x, dock.y);

    /* Dock body */
    cx.fillStyle = '#121a28'; cx.fillRect(-44, -14, 88, 28);
    cx.strokeStyle = '#1a2a40'; cx.lineWidth = 1.2; cx.strokeRect(-44, -14, 88, 28);

    /* Charging strut symbol */
    cx.strokeStyle = 'rgba(20,184,166,.4)'; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(-12,-6); cx.lineTo(-12,6); cx.moveTo(-12,0); cx.lineTo(12,0); cx.moveTo(12,-6); cx.lineTo(12,6); cx.stroke();

    /* Draw reserve drones inside their dock bay */
    for (let ri = 0; ri < dockReserves.length; ri++) {
      const rd = dockReserves[ri];
      if (rd.state === 'docked') {
        const rx = -28 + ri * 22;
        /* Battery fill colour */
        const bc = rd.battery > 60 ? '#14b8a6' : rd.battery > 30 ? '#f59e0b' : '#ef4444';
        cx.fillStyle = '#0d3730'; cx.fillRect(rx-6, -8, 12, 8);
        cx.strokeStyle = bc; cx.lineWidth = .8; cx.strokeRect(rx-6, -8, 12, 8);
        /* Battery level bar inside the bay */
        cx.fillStyle = bc + '44';
        cx.fillRect(rx-6, -8 + 8*(1 - rd.battery/100), 12, 8*(rd.battery/100));
        /* Charging bolt */
        const blink = .4 + .4 * Math.sin(Date.now()*.008 + ri + di*2);
        cx.globalAlpha = blink;
        cx.font = '700 7px "JetBrains Mono",monospace'; cx.fillStyle = bc; cx.textAlign = 'center';
        cx.fillText('\u26A1', rx, -1);
        cx.globalAlpha = 1;
      }
    }

    cx.restore();

    /* Dock labels */
    cx.font = '600 8px "Outfit",sans-serif'; cx.fillStyle = '#14b8a6'; cx.textAlign = 'center';
    cx.fillText(dock.label, dock.x, dock.y + 22);

    /* Reserve count for this dock */
    const dockedCount = dockReserves.filter(rd => rd.state === 'docked').length;
    cx.font = '600 7px "JetBrains Mono",monospace'; cx.fillStyle = '#0d9488';
    cx.fillText(`${dockedCount}/${dockReserves.length} ready`, dock.x, dock.y + 31);

    /* Battery bar under label showing average charge */
    if (dockReserves.length > 0) {
      const avgBat = dockReserves.reduce((s, r) => s + r.battery, 0) / dockReserves.length;
      const bw = 44;
      cx.fillStyle = '#1e293b'; cx.fillRect(dock.x - bw/2, dock.y + 34, bw, 3);
      const bc = avgBat > 60 ? '#14b8a6' : avgBat > 30 ? '#f59e0b' : '#ef4444';
      cx.fillStyle = bc; cx.fillRect(dock.x - bw/2, dock.y + 34, bw * (avgBat / 100), 3);
    }
  }

  /* Flight paths */
  for (const d of drones) {
    if (d.state !== 'flying' && d.state !== 'returning') continue;
    cx.save();
    cx.strokeStyle = d.state === 'returning' ? 'rgba(20,184,166,.25)' : 'rgba(124,58,237,.25)';
    cx.lineWidth = 1.5; cx.setLineDash([4,7]);
    let tx, ty;
    if (d.state === 'returning') {
      tx = d.returnDockX !== undefined ? d.returnDockX : docks[0].x;
      ty = d.returnDockY !== undefined ? d.returnDockY : docks[0].y;
    } else {
      tx = LAND_X + (drones.indexOf(d) === backupIdx ? 25 : 0);
      ty = LAND_Y + (drones.indexOf(d) === backupIdx ? 10 : 0);
    }
    cx.beginPath(); cx.moveTo(d.flyStartX, d.flyStartY); cx.lineTo(tx, ty); cx.stroke();
    cx.setLineDash([]); cx.restore();
  }

  /* Wave */
  if (wave) {
    const a = Math.max(0, .8 * (1 - wave.r / wave.maxR));
    cx.save(); cx.globalAlpha = a;
    cx.beginPath(); cx.arc(SX, SY, wave.r, 0, Math.PI*2);
    cx.strokeStyle = '#ef4444'; cx.lineWidth = 2.5; cx.setLineDash([8,5]); cx.stroke(); cx.setLineDash([]);
    cx.restore();
  }

  /* Arrows */
  for (const a of commArrows) {
    const ex = a.fromX + (a.toX - a.fromX) * a.progress;
    const ey = a.fromY + (a.toY - a.fromY) * a.progress;
    cx.save();
    cx.beginPath(); cx.moveTo(a.fromX, a.fromY); cx.lineTo(ex, ey);
    cx.strokeStyle = a.color; cx.lineWidth = 2; cx.globalAlpha = .8; cx.stroke();
    cx.beginPath(); cx.arc(ex, ey, 4, 0, Math.PI*2); cx.fillStyle = a.color; cx.globalAlpha = 1; cx.fill();
    cx.beginPath(); cx.arc(ex, ey, 8, 0, Math.PI*2); cx.fillStyle = a.color; cx.globalAlpha = .12; cx.fill();
    if (a.label) { cx.font = '700 8px "JetBrains Mono",monospace'; cx.fillStyle = '#fff'; cx.globalAlpha = .9; cx.textAlign = 'center'; cx.fillText(a.label, ex, ey-10); }
    cx.restore();
  }

  /* Swap drones in flight */
  for (const sw of swapOps) {
    const t = sw.progress, e = t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
    const cx2 = sw.startX + (sw.targetX - sw.startX) * e;
    const cy2 = sw.startY + (sw.targetY - sw.startY) * e;
    cx.save();
    cx.strokeStyle = 'rgba(20,184,166,.3)'; cx.lineWidth = 1.5; cx.setLineDash([4,7]);
    cx.beginPath(); cx.moveTo(sw.startX, sw.startY); cx.lineTo(sw.targetX, sw.targetY); cx.stroke(); cx.setLineDash([]);
    cx.beginPath(); cx.arc(cx2, cy2, 6, 0, Math.PI*2); cx.fillStyle = '#14b8a6'; cx.fill();
    cx.font = '700 7px "JetBrains Mono",monospace'; cx.fillStyle = '#fff'; cx.textAlign = 'center';
    cx.fillText(sw.label || '', cx2, cy2 - 12);
    cx.restore();
  }

  /* Drones */
  const colorMap = {
    idle:['#1a2030','#3a4a68'], reached:['#1a0e08','#b04020'], ackSender:['#0e2018','#10b981'],
    deploy:['#150a28','#7c3aed'], flying:['#150a28','#7c3aed'], backup:['#1a1400','#d97706'],
    arrived:['#052e16','#059669'], returning:['#0a2020','#14b8a6'],
    docked:['#0a1515','#0d9488'], returningToPatrol:['#0e1e20','#22d3ee'],
  };

  for (const d of drones) {
    const c = colorMap[d.state] || colorMap.idle;
    const [bF, aF] = c;
    cx.save(); cx.translate(d.x, d.y);
    const shS = (d.state === 'flying' || d.state === 'returning') ? .5 : 1;
    cx.beginPath(); cx.ellipse(0,14*shS,12*shS,3.5*shS,0,0,Math.PI*2); cx.fillStyle = 'rgba(0,0,0,.2)'; cx.fill();
    const AA = Math.PI/4, arm = 15;
    const angles = [AA, AA+Math.PI/2, AA+Math.PI, AA+3*Math.PI/2];
    for (let ai = 0; ai < 4; ai++) {
      const ang = angles[ai], ax = Math.cos(ang)*arm, ay = Math.sin(ang)*arm;
      cx.beginPath(); cx.moveTo(0,0); cx.lineTo(ax,ay); cx.strokeStyle = aF; cx.lineWidth = 2.2; cx.lineCap = 'round'; cx.stroke();
      cx.beginPath(); cx.arc(ax,ay,2.8,0,Math.PI*2); cx.fillStyle = aF; cx.fill();
      const spM = (d.state==='flying'||d.state==='returning') ? 3 : 1;
      const rs = rot * spM * (ai%2===0?1:-1) + d.rotOff;
      cx.save(); cx.translate(ax,ay); cx.beginPath(); cx.ellipse(0,0,7,1.8,rs,0,Math.PI*2); cx.fillStyle = aF+'44'; cx.fill(); cx.restore();
    }
    const bs = 6;
    cx.beginPath(); cx.moveTo(-bs,-bs+2); cx.lineTo(-bs+2,-bs); cx.lineTo(bs-2,-bs); cx.lineTo(bs,-bs+2);
    cx.lineTo(bs,bs-2); cx.lineTo(bs-2,bs); cx.lineTo(-bs+2,bs); cx.lineTo(-bs,bs-2); cx.closePath();
    cx.fillStyle = bF; cx.fill();
    const lp = Math.sin(Date.now()*.007+d.rotOff)*.4+.7;
    cx.globalAlpha = lp; cx.beginPath(); cx.arc(-2.5,-3.5,1.4,0,Math.PI*2); cx.fillStyle = aF; cx.fill(); cx.globalAlpha = 1;
    cx.restore();
    cx.font = '600 8px "Outfit",sans-serif'; cx.fillStyle = aF; cx.textAlign = 'center';
    cx.fillText('D'+d.id, d.x, d.y+26);
    const bw = 20, bc2 = d.battery>50?'#10b981':d.battery>30?'#f59e0b':'#ef4444';
    cx.fillStyle = '#1e293b'; cx.fillRect(d.x-bw/2, d.y+28, bw, 2);
    cx.fillStyle = bc2; cx.fillRect(d.x-bw/2, d.y+28, bw*(d.battery/100), 2);
    if (d.state==='flying'||d.state==='returning') { cx.font='700 7px "JetBrains Mono",monospace'; cx.fillStyle=aF; cx.fillText(d.state==='flying'?'EN ROUTE':'TO DOCK',d.x,d.y-20); }
    else if (d.state==='arrived') { cx.font='700 7px "JetBrains Mono",monospace'; cx.fillStyle='#34d399'; cx.fillText('ON SITE',d.x,d.y-20); }
    else if (d.state==='docked') { cx.font='700 7px "JetBrains Mono",monospace'; cx.fillStyle='#0d9488'; cx.fillText('CHARGING',d.x,d.y-20); }
    if (d.state==='idle') { cx.save(); cx.translate(d.x,d.y-18); cx.strokeStyle='rgba(80,110,160,.25)'; cx.lineWidth=1; cx.beginPath(); cx.moveTo(-4,0); cx.lineTo(4,0); cx.stroke(); const aw=d.dir; cx.beginPath(); cx.moveTo(aw*4,0); cx.lineTo(aw*1.5,-2.5); cx.lineTo(aw*1.5,2.5); cx.closePath(); cx.fillStyle='rgba(80,110,160,.25)'; cx.fill(); cx.restore(); }
  }

  /* Sensors — draw all 4, highlight the active one */
  for (let si = 0; si < sensors.length; si++) {
    const sensor = sensors[si]
    const isActive = si === activeSensorIdx
    const isBC = isActive && simState === 'broadcasting'
    const isTriggered = isActive && simState !== 'idle'

    const accentColor = isBC ? '#3b82f6' : isTriggered ? '#ef4444' : isActive ? '#22d3ee' : '#1e3a5f'

    cx.save()
    cx.translate(sensor.x, sensor.y)

    // Glow halo behind active sensors
    if (isActive) {
      const grd = cx.createRadialGradient(0, -22, 4, 0, -22, 46)
      const glowHex = isBC ? '3b82f6' : isTriggered ? 'ef4444' : '22d3ee'
      grd.addColorStop(0, '#' + glowHex + '28')
      grd.addColorStop(1, '#' + glowHex + '00')
      cx.fillStyle = grd
      cx.fillRect(-46, -68, 92, 92)
    }

    // Pole
    cx.fillStyle = isActive ? '#252f48' : '#151e2e'
    cx.fillRect(-3, 0, 6, 24)

    // Base trapezoid
    cx.beginPath()
    cx.moveTo(-14, 22); cx.lineTo(14, 22)
    cx.lineTo(10, 27); cx.lineTo(-10, 27); cx.closePath()
    cx.fillStyle = isActive ? '#1c2a44' : '#101822'
    cx.fill()
    cx.strokeStyle = isActive ? accentColor + '55' : '#141e30'
    cx.lineWidth = 0.8; cx.stroke()

    // Connector nub (housing to pole)
    cx.fillStyle = isActive ? '#1a2840' : '#0e1828'
    cx.fillRect(-4, -5, 8, 7)

    // Housing body
    cx.fillStyle = isActive ? '#0f1d35' : '#090f1c'
    cx.fillRect(-16, -46, 32, 44)
    cx.strokeStyle = accentColor
    cx.lineWidth = isActive ? 1.5 : 0.8
    cx.strokeRect(-16, -46, 32, 44)

    // Housing top accent strip
    cx.fillStyle = accentColor + (isBC ? 'cc' : isTriggered ? '88' : isActive ? '44' : '22')
    cx.fillRect(-16, -46, 32, 4)

    // Lens — outer ring
    cx.beginPath(); cx.arc(0, -28, 12, 0, Math.PI * 2)
    cx.fillStyle = '#050b15'; cx.fill()
    cx.strokeStyle = accentColor + (isActive ? 'aa' : '44')
    cx.lineWidth = 1.5; cx.stroke()

    // Lens — glass
    cx.beginPath(); cx.arc(0, -28, 9, 0, Math.PI * 2)
    cx.fillStyle = isBC ? '#0c1d45' : isActive ? '#0a1630' : '#060e1f'
    cx.fill()

    // Lens — iris
    cx.beginPath(); cx.arc(0, -28, 5.5, 0, Math.PI * 2)
    cx.fillStyle = isBC ? '#1d4ed8' : isActive ? '#1e40af' : '#0d1d38'
    cx.fill()

    // Lens — pupil
    cx.beginPath(); cx.arc(0, -28, 2.5, 0, Math.PI * 2)
    cx.fillStyle = isBC ? '#60a5fa' : isActive ? '#3b82f6' : '#162040'
    cx.fill()

    // Lens — glint
    cx.beginPath(); cx.arc(-2.5, -30, 1.5, 0, Math.PI * 2)
    cx.fillStyle = isActive ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)'
    cx.fill()

    // ID strip at bottom of housing
    cx.fillStyle = accentColor + (isActive ? '18' : '0c')
    cx.fillRect(-16, -10, 32, 8)
    cx.font = isActive ? '700 7px "JetBrains Mono",monospace' : '600 6px "JetBrains Mono",monospace'
    cx.fillStyle = isActive ? accentColor : '#253050'
    cx.textAlign = 'center'
    cx.fillText('S' + sensor.id, 0, -4)

    // Status LED (top-right corner of housing)
    const ledColor = isBC ? '#60a5fa' : isTriggered ? '#ef4444' : isActive ? '#22d3ee' : '#1a2840'
    const ledBlink = (isBC || isTriggered) ? (0.45 + 0.55 * Math.sin(Date.now() * 0.009 + si)) : 1
    cx.globalAlpha = ledBlink
    cx.beginPath(); cx.arc(11, -42, 2.5, 0, Math.PI * 2)
    cx.fillStyle = ledColor; cx.fill()
    if (isActive) {
      cx.globalAlpha = ledBlink * 0.35
      cx.beginPath(); cx.arc(11, -42, 5.5, 0, Math.PI * 2)
      cx.fillStyle = ledColor; cx.fill()
    }
    cx.globalAlpha = 1

    // Broadcast rings — full circle from lens centre
    if (isBC) {
      for (let ai = 0; ai < 3; ai++) {
        const ph = (sensorPulse + ai * 0.33) % 1
        const ar = 16 + ph * 48
        cx.globalAlpha = Math.max(0, 0.55 * (1 - ph))
        cx.beginPath(); cx.arc(0, -28, ar, 0, Math.PI * 2)
        cx.strokeStyle = '#3b82f6'; cx.lineWidth = 1.8; cx.stroke()
      }
      cx.globalAlpha = 1
    }

    // Warning icon above housing when triggered
    if (isTriggered) {
      cx.globalAlpha = 0.55 + 0.35 * Math.sin(Date.now() * 0.009 + si)
      cx.font = '700 10px "Outfit",sans-serif'
      cx.fillStyle = '#ef4444'; cx.textAlign = 'center'
      cx.fillText('⚠', 0, -56)
      cx.globalAlpha = 1
    }

    cx.restore()
  }
}
