/* Canvas Renderer — takes simulation state and draws to canvas */

export function renderCanvas(cx, s) {
  const { W, H, RX1, RX2, RY1, RY2, RCY, PPM, SX, SY, DOCK_X, DOCK_Y, LAND_X, LAND_Y,
          drones, reserveDrones, wave, commArrows, swapOps,
          simState, rot, sensorPulse, backupIdx } = s;

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

  /* Dock */
  cx.save(); cx.translate(DOCK_X, DOCK_Y);
  cx.fillStyle = '#121a28'; cx.fillRect(-40,-14,80,28);
  cx.strokeStyle = '#1a2a40'; cx.lineWidth = 1.2; cx.strokeRect(-40,-14,80,28);
  cx.strokeStyle = 'rgba(20,184,166,.4)'; cx.lineWidth = 1;
  cx.beginPath(); cx.moveTo(-12,-6); cx.lineTo(-12,6); cx.moveTo(-12,0); cx.lineTo(12,0); cx.moveTo(12,-6); cx.lineTo(12,6); cx.stroke();
  for (let ri = 0; ri < reserveDrones.length; ri++) {
    const rd = reserveDrones[ri];
    if (rd.state === 'docked') {
      const rx = -20 + ri * 22;
      cx.fillStyle = '#0d3730'; cx.fillRect(rx-6,-8,12,8);
      cx.strokeStyle = '#14b8a6'; cx.lineWidth = .8; cx.strokeRect(rx-6,-8,12,8);
      const blink = .4 + .4 * Math.sin(Date.now()*.008+ri);
      cx.globalAlpha = blink; cx.font = '700 7px "JetBrains Mono",monospace'; cx.fillStyle = '#14b8a6'; cx.textAlign = 'center';
      cx.fillText('\u26A1', rx, -1); cx.globalAlpha = 1;
    }
  }
  cx.restore();
  cx.font = '600 8px "Outfit",sans-serif'; cx.fillStyle = '#14b8a6'; cx.textAlign = 'center';
  cx.fillText('DOCKING STATION', DOCK_X, DOCK_Y+24);
  let docked = 0; for (const rd of reserveDrones) if (rd.state === 'docked') docked++;
  cx.font = '600 7px "JetBrains Mono",monospace'; cx.fillStyle = '#0d9488';
  cx.fillText(`${docked}/${reserveDrones.length} ready`, DOCK_X, DOCK_Y+33);

  /* Flight paths */
  for (const d of drones) {
    if (d.state !== 'flying' && d.state !== 'returning') continue;
    cx.save();
    cx.strokeStyle = d.state === 'returning' ? 'rgba(20,184,166,.25)' : 'rgba(124,58,237,.25)';
    cx.lineWidth = 1.5; cx.setLineDash([4,7]);
    const tx = d.state === 'returning' ? DOCK_X : LAND_X + (drones.indexOf(d) === backupIdx ? 25 : 0);
    const ty = d.state === 'returning' ? DOCK_Y : LAND_Y + (drones.indexOf(d) === backupIdx ? 10 : 0);
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
    arrived:['#052e16','#059669'], returning:['#0a2020','#14b8a6'], docked:['#0a1515','#0d9488']
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
    if (d.state==='idle') { cx.save(); cx.translate(d.x,d.y-18); cx.strokeStyle='rgba(80,110,160,.25)'; cx.lineWidth=1; cx.beginPath(); cx.moveTo(-4,0); cx.lineTo(4,0); cx.stroke(); const aw=d.dir; cx.beginPath(); cx.moveTo(aw*4,0); cx.lineTo(aw*1.5,-2.5); cx.lineTo(aw*1.5,2.5); cx.closePath(); cx.fillStyle='rgba(80,110,160,.25)'; cx.fill(); cx.restore(); }
  }

  /* Sensor */
  const isBC = simState === 'broadcasting';
  cx.save(); cx.translate(SX, SY);
  cx.fillStyle = '#243050'; cx.fillRect(-2,-2,4,26);
  cx.fillStyle = '#1a2840'; cx.beginPath(); cx.moveTo(-12,24); cx.lineTo(12,24); cx.lineTo(8,20); cx.lineTo(-8,20); cx.closePath(); cx.fill();
  cx.beginPath(); cx.ellipse(0,-4,11,7,0,0,Math.PI*2); cx.fillStyle = '#162040'; cx.fill();
  cx.strokeStyle = isBC ? '#4299e1' : '#1e3050'; cx.lineWidth = 1.2; cx.stroke();
  cx.beginPath(); cx.arc(0,-4,2,0,Math.PI*2); cx.fillStyle = isBC ? '#93c5fd' : '#2a4060'; cx.fill();
  if (isBC) {
    for (let ai = 0; ai < 3; ai++) {
      const ph = (sensorPulse + ai*.33) % 1, ar = 8 + ph*20;
      cx.globalAlpha = Math.max(0, .5*(1-ph));
      cx.beginPath(); cx.arc(0,-4,ar,-Math.PI*.55,Math.PI*.55);
      cx.strokeStyle = '#3b82f6'; cx.lineWidth = 1.5; cx.stroke();
    }
    cx.globalAlpha = 1;
  }
  if (simState !== 'idle') { cx.globalAlpha = .5+.3*Math.sin(Date.now()*.01); cx.font='700 8px "Outfit",sans-serif'; cx.fillStyle='#ef4444'; cx.textAlign='center'; cx.fillText('\u26A0',0,-16); cx.globalAlpha=1; }
  cx.restore();
  cx.font = '600 8px "Outfit",sans-serif'; cx.fillStyle = '#3b82f6'; cx.textAlign = 'center';
  cx.fillText('SENSOR', SX, SY+34);
}
