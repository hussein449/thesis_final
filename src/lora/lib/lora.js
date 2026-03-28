/**
 * LoRa Link Budget Calculator
 * Models: Friis (free-space), COST-231 Hata (urban), Log-Normal Shadowing
 * Parameters matched to thesis: 868 MHz, SF7, BW 250 kHz
 */

const C = 3e8; // speed of light m/s

/** Haversine distance in meters between two lat/lon points */
export function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 3D distance accounting for altitude difference */
export function distance3D(lat1, lon1, alt1, lat2, lon2, alt2) {
  const horiz = haversineM(lat1, lon1, lat2, lon2);
  const vert = Math.abs(alt2 - alt1);
  return Math.sqrt(horiz ** 2 + vert ** 2);
}

/** Free-space path loss (Friis) in dB */
export function friisPathLoss(distM, freqHz) {
  const d = Math.max(distM, 1);
  return 20 * Math.log10(4 * Math.PI * d * freqHz / C);
}

/** COST-231 Hata model for urban environments (150-2000 MHz) */
export function cost231PathLoss(distM, freqMHz, hBase, hMobile) {
  const d = Math.max(distM / 1000, 0.001); // km
  const fc = Math.min(Math.max(freqMHz, 150), 2000);
  const hb = Math.max(hBase, 1);
  const hm = Math.max(hMobile, 1);
  // Small/medium city correction
  const ahm = (1.1 * Math.log10(fc) - 0.7) * hm - (1.56 * Math.log10(fc) - 0.8);
  // COST-231 extension (Cm=3 for metropolitan)
  const Cm = 3;
  return 46.3 + 33.9 * Math.log10(fc) - 13.82 * Math.log10(hb) - ahm +
    (44.9 - 6.55 * Math.log10(hb)) * Math.log10(d) + Cm;
}

/** Log-Normal Shadowing (used by FLoRa in OMNeT++) */
export function logNormalPathLoss(distM, freqHz, alpha = 2.0, sigma = 3.57) {
  const d = Math.max(distM, 1);
  const d0 = 1; // reference distance
  const PL0 = 20 * Math.log10(4 * Math.PI * d0 * freqHz / C);
  // Deterministic component (no random shadow fading for display)
  return PL0 + 10 * alpha * Math.log10(d / d0);
}

/** LoRa packet airtime calculator */
export function loraAirtime(payloadBytes, sf = 7, bwKHz = 250, cr = 1, preambleSymbols = 8, explicitHeader = true) {
  const bw = bwKHz * 1000;
  const Tsym = (2 ** sf) / bw; // symbol duration in seconds
  const Tpreamble = (preambleSymbols + 4.25) * Tsym;

  const DE = (sf >= 11 && bwKHz === 125) ? 1 : 0;
  const H = explicitHeader ? 0 : 1;
  const payloadSymbNb = 8 + Math.max(
    Math.ceil((8 * payloadBytes - 4 * sf + 28 + 16 - 20 * H) / (4 * (sf - 2 * DE))) * (cr + 4),
    0
  );
  const Tpayload = payloadSymbNb * Tsym;
  return {
    preambleMs: Tpreamble * 1000,
    payloadMs: Tpayload * 1000,
    totalMs: (Tpreamble + Tpayload) * 1000,
    symbolDurationMs: Tsym * 1000,
    symbols: payloadSymbNb
  };
}

/** Propagation delay */
export function propagationDelay(distM) {
  return distM / C; // seconds
}

/** Full link budget calculation */
export function calculateLinkBudget(params) {
  const {
    dist3D,       // meters
    freqMHz = 868,
    txPower = 14, // dBm
    txGain = 3,   // dBi
    rxGain = 3,   // dBi
    cableLoss = 0.5, // dB
    fadingMargin = 5, // dB
    model = 'friis',
    hBase = 40,   // drone altitude m
    hMobile = 40, // other drone altitude m
    payloadBytes = 15, // SOS frame
    sf = 7,
    bwKHz = 250,
    droneSpeed = 15, // m/s
  } = params;

  const freqHz = freqMHz * 1e6;
  const d = Math.max(dist3D, 1);

  // Path loss
  let pathLoss;
  let modelName;
  switch (model) {
    case 'cost231':
      pathLoss = cost231PathLoss(d, freqMHz, hBase, hMobile);
      modelName = 'COST-231 Hata (Urban)';
      break;
    case 'lognormal':
      pathLoss = logNormalPathLoss(d, freqHz, 2.0, 3.57);
      modelName = 'Log-Normal Shadowing';
      break;
    case 'friis':
    default:
      pathLoss = friisPathLoss(d, freqHz);
      modelName = 'Free-Space (Friis)';
      break;
  }

  // Received power
  const rxPower = txPower + txGain + rxGain - cableLoss - pathLoss - fadingMargin;

  // LoRa receiver sensitivity (approximate for SF7/250kHz)
  const sensitivity = -124; // dBm (conservative for SF7)

  // Link margin
  const linkMargin = rxPower - sensitivity;

  // Link viable?
  const linkOk = linkMargin > 0;

  // Propagation delay
  const propDelay = propagationDelay(d);

  // Packet airtime
  const airtime = loraAirtime(payloadBytes, sf, bwKHz);

  // Total one-way delay: propagation + airtime
  const totalDelayMs = propDelay * 1000 + airtime.totalMs;

  // Round-trip (SOS + ACK)
  const rttMs = totalDelayMs * 2;

  // Drone arrival time (if flying at droneSpeed)
  const arrivalTimeSec = d / droneSpeed;

  // Max range (where rxPower = sensitivity)
  // txPower + txGain + rxGain - cableLoss - PL - fadingMargin = sensitivity
  // PL_max = txPower + txGain + rxGain - cableLoss - fadingMargin - sensitivity
  const plMax = txPower + txGain + rxGain - cableLoss - fadingMargin - sensitivity;
  let maxRange;
  if (model === 'friis') {
    // PL = 20*log10(4*pi*d*f/c) => d = 10^((PL - 20*log10(4*pi*f/c))/20)
    maxRange = 10 ** ((plMax - 20 * Math.log10(4 * Math.PI * freqHz / C)) / 20);
  } else if (model === 'cost231') {
    // Approximate by iterating
    maxRange = estimateMaxRange(plMax, freqMHz, hBase, hMobile, model);
  } else {
    maxRange = 10 ** ((plMax - friisPathLoss(1, freqHz)) / 20);
  }

  return {
    distance: d,
    pathLoss: pathLoss,
    modelName,
    rxPower,
    linkMargin,
    linkOk,
    sensitivity,
    propDelayUs: propDelay * 1e6,
    airtimeMs: airtime.totalMs,
    preambleMs: airtime.preambleMs,
    payloadMs: airtime.payloadMs,
    totalDelayMs,
    rttMs,
    arrivalTimeSec,
    maxRange: Math.min(maxRange, 50000), // cap at 50km
    symbols: airtime.symbols,
  };
}

function estimateMaxRange(plMax, freqMHz, hBase, hMobile, model) {
  // Binary search for max range
  let lo = 1, hi = 50000;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const pl = model === 'cost231'
      ? cost231PathLoss(mid, freqMHz, hBase, hMobile)
      : logNormalPathLoss(mid, freqMHz * 1e6);
    if (pl < plMax) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Scenario presets */
export const SCENARIOS = {
  urban: {
    name: 'Urban — Beirut',
    center: [33.8938, 35.5018],
    zoom: 15,
    model: 'cost231',
    drone1: { lat: 33.8960, lon: 35.4990, alt: 40 },
    drone2: { lat: 33.8915, lon: 35.5045, alt: 40 },
    description: 'Dense urban area in Beirut. Buildings cause significant signal attenuation. COST-231 Hata model with metropolitan correction factor.',
    environment: 'Urban',
    obstacles: 'High-rise buildings, narrow streets, multipath reflections',
  },
  rural: {
    name: 'Rural — Bekaa Valley',
    center: [33.8500, 35.9000],
    zoom: 14,
    model: 'friis',
    drone1: { lat: 33.8530, lon: 35.8950, alt: 60 },
    drone2: { lat: 33.8470, lon: 35.9060, alt: 60 },
    description: 'Open rural area in the Bekaa Valley. Minimal obstacles, clear line-of-sight. Free-space Friis model applies.',
    environment: 'Rural/Open',
    obstacles: 'Minimal — flat terrain, sparse vegetation',
  }
};
