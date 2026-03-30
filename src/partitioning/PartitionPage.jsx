import { useState, useMemo } from 'react'
import { allocateDrones } from './lib/roads'
import PartitionMap from './components/PartitionMap'
import StatsPanel from './components/StatsPanel'

export default function PartitionPage({ droneCount, onDroneCountChange }) {
  const allocations = useMemo(() => allocateDrones(droneCount), [droneCount])

  const [selectedRoadId, setSelectedRoadId] = useState(() => allocateDrones(8)[0].road.id)

  return (
    <>
      {/* Road chip bar */}
      <div className="px-4 py-2 bg-[var(--color-bg2)] border-b border-[var(--color-border)] flex items-center gap-1.5 overflow-x-auto shrink-0">
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
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] flex-1 min-h-0" style={{ height: 'calc(100vh - 98px)' }}>
        {/* Map */}
        <div className="border-r border-[var(--color-border)] min-h-[420px]" style={{ isolation: 'isolate' }}>
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
