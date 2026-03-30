import { useState, useMemo, useEffect } from 'react'
import { SCENARIOS, calculateLinkBudget, haversineM, distance3D } from './lib/lora'
import MapView from './components/MapView'
import MetricsPanel from './components/MetricsPanel'
import LinkBudgetBar from './components/LinkBudgetBar'
import CommTimeline from './components/CommTimeline'
import SettingsPanel from './components/SettingsPanel'
import GraphsPanel from './components/GraphsPanel'

export default function LoraApp({ scenario, showGraphs, showSettings, onCloseSettings }) {
  const sc = SCENARIOS[scenario]

  const [drone1, setDrone1] = useState(sc.drone1)
  const [drone2, setDrone2] = useState(sc.drone2)
  const [config, setConfig] = useState({
    freqMHz: 868, txPower: 14, txGain: 3, rxGain: 3,
    cableLoss: 0.5, fadingMargin: 5, sf: 7, bwKHz: 250,
    payloadBytes: 15, droneSpeed: 15,
    alt1: sc.drone1.alt, alt2: sc.drone2.alt,
  })

  /* Sync positions + altitudes when parent switches scenario */
  useEffect(() => {
    const s = SCENARIOS[scenario]
    setDrone1(s.drone1)
    setDrone2(s.drone2)
    setConfig(prev => ({ ...prev, alt1: s.drone1.alt, alt2: s.drone2.alt }))
  }, [scenario])

  const horizDist = haversineM(drone1.lat, drone1.lon, drone2.lat, drone2.lon)
  const dist3d = distance3D(drone1.lat, drone1.lon, config.alt1, drone2.lat, drone2.lon, config.alt2)

  const metrics = useMemo(() => calculateLinkBudget({
    dist3D: dist3d,
    freqMHz: config.freqMHz,
    txPower: config.txPower,
    txGain: config.txGain,
    rxGain: config.rxGain,
    cableLoss: config.cableLoss,
    fadingMargin: config.fadingMargin,
    model: sc.model,
    hBase: config.alt1,
    hMobile: config.alt2,
    payloadBytes: config.payloadBytes,
    sf: config.sf,
    bwKHz: config.bwKHz,
    droneSpeed: config.droneSpeed,
  }), [drone1, drone2, config, scenario])

  function handleDroneDrag(droneId, lat, lng) {
    if (droneId === 1) setDrone1({ lat, lon: lng, alt: config.alt1 })
    else setDrone2({ lat, lon: lng, alt: config.alt2 })
  }

  return (
    <>
      {/* Scenario info bar */}
      <div className="px-5 py-2 bg-[var(--color-bg2)] border-b border-[var(--color-border)] flex items-center gap-6 text-[10px] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-txt3)] uppercase tracking-widest font-bold">Model:</span>
          <span className="text-[var(--color-cyan)] font-[var(--font-mono)] font-semibold">{metrics.modelName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-txt3)] uppercase tracking-widest font-bold">Env:</span>
          <span className="text-[var(--color-warn)] font-semibold">{sc.environment}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-txt3)] uppercase tracking-widest font-bold">Obstacles:</span>
          <span className="text-[var(--color-txt2)]">{sc.obstacles}</span>
        </div>
        <div className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold ${metrics.linkOk ? 'bg-[#052e16] text-[var(--color-mint)]' : 'bg-[#450a0a] text-[var(--color-danger)]'}`}>
          <span className={`w-2 h-2 rounded-full ${metrics.linkOk ? 'bg-[var(--color-mint)]' : 'bg-[var(--color-danger)]'}`} />
          {metrics.linkOk ? 'LINK VIABLE' : 'LINK LOST'}
        </div>
      </div>

      {/* Link Budget Chain */}
      <LinkBudgetBar metrics={metrics} config={config} />

      {/* Main grid: Map + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px]">
        <div className="h-[460px] border-r border-[var(--color-border)]" style={{ isolation: 'isolate' }}>
          <MapView
            scenario={sc}
            drone1={drone1}
            drone2={drone2}
            onDrag={handleDroneDrag}
            linkOk={metrics.linkOk}
            linkMargin={metrics.linkMargin}
          />
        </div>
        <div className="flex flex-col bg-[var(--color-bg2)] overflow-hidden">
          <MetricsPanel metrics={metrics} horizDist={horizDist} config={config} />
          <CommTimeline metrics={metrics} config={config} />
        </div>
      </div>

      {showGraphs && <GraphsPanel config={config} />}

      {showSettings && (
        <SettingsPanel config={config} onChange={setConfig} onClose={onCloseSettings} />
      )}
    </>
  )
}
