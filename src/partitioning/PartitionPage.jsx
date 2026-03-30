import { useState, useMemo } from 'react'
import { allocateDrones } from './lib/roads'
import PartitionMap from './components/PartitionMap'
import StatsPanel from './components/StatsPanel'

export default function PartitionPage() {
  const [droneCount, setDroneCount] = useState(8)

  const allocations = useMemo(() => allocateDrones(droneCount), [droneCount])

  // Keep selected road stable across slider changes
  const [selectedRoadId, setSelectedRoadId] = useState(() => allocateDrones(8)[0].road.id)

  return (
    <>
      {/* Sub-header */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-gradient-to-b from-[#0a0e1a] to-[var(--color-bg)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 flex items-center justify-center bg-gradient-to-br from-[var(--color-mint)] to-[var(--color-teal)] rounded-lg text-white text-xs font-bold">P</div>
          <div>
            <h2 className="text-[13px] font-extrabold text-[var(--color-white)] tracking-tight">
              Risk-Based Drone Partitioning
            </h2>
            <p className="text-[9px] text-[var(--color-txt2)] uppercase tracking-widest">
              Beirut Road Segments · Largest Remainder Method
            </p>
          </div>
        </div>

        {/* Fleet size slider */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[var(--color-txt2)] shrink-0">Fleet size</span>
          <input
            type="range" min={3} max={20} step={1} value={droneCount}
            onChange={e => setDroneCount(parseInt(e.target.value))}
            className="w-32"
          />
          <div className="flex items-center gap-1 min-w-[42px]">
            <span className="text-[18px] font-bold font-[var(--font-mono)] text-[var(--color-cyan)]">
              {droneCount}
            </span>
            <span className="text-[9px] text-[var(--color-txt2)]">drones</span>
          </div>
        </div>
      </header>

      {/* Road chip bar */}
      <div className="px-4 py-2 bg-[var(--color-bg2)] border-b border-[var(--color-border)] flex items-center gap-1.5 overflow-x-auto">
        {allocations.map(({ road, drones, score }) => {
          const isSelected = road.id === selectedRoadId
          return (
            <button
              key={road.id}
              onClick={() => setSelectedRoadId(road.id)}
              className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-md border text-[10px] transition-all cursor-pointer"
              style={{
                borderColor: isSelected ? road.color : '#1a2540',
                background: isSelected ? road.color + '18' : 'transparent',
              }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: road.color }} />
              <span className="font-semibold" style={{ color: road.color }}>{road.shortName}</span>
              <span
                className="font-bold font-[var(--font-mono)] text-[9px] px-1 rounded"
                style={{ background: road.color + '22', color: road.color }}
              >
                {drones === 0 ? '—' : `×${drones}`}
              </span>
              <span className="text-[var(--color-txt3)] text-[8px] font-[var(--font-mono)]">
                {(score * 100).toFixed(0)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px]" style={{ height: 'calc(100vh - 128px)' }}>

        {/* Map */}
        <div className="border-r border-[var(--color-border)] min-h-[420px]">
          <PartitionMap
            allocations={allocations}
            selectedRoadId={selectedRoadId}
            onSelectRoad={setSelectedRoadId}
          />
        </div>

        {/* Stats */}
        <div className="flex flex-col bg-[var(--color-bg2)] overflow-hidden">
          <StatsPanel
            allocations={allocations}
            selectedRoadId={selectedRoadId}
            onSelectRoad={setSelectedRoadId}
            droneCount={droneCount}
          />
        </div>
      </div>
    </>
  )
}
