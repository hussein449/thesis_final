const stateColor = {
  idle:             '#3a4a68',
  reached:          '#b04020',
  ackSender:        '#10b981',
  deploy:           '#7c3aed',
  flying:           '#7c3aed',
  backup:           '#d97706',
  arrived:          '#059669',
  returning:        '#14b8a6',
  docked:           '#0d9488',
  returningToPatrol:'#22d3ee',
}

const stateLabel = {
  idle:             'PATROL',
  reached:          'REACHED',
  ackSender:        'ACK',
  deploy:           'PRIMARY',
  backup:           'BACKUP',
  flying:           'EN ROUTE',
  arrived:          'ON SITE',
  returning:        'TO DOCK',
  docked:           'DOCKED',
  returningToPatrol:'RETURN',
}

function batColor(b) {
  return b > 50 ? '#10b981' : b > 30 ? '#f59e0b' : '#ef4444'
}

function DroneCard({ d, distM }) {
  const sc = stateColor[d.state] || '#3a4a68'
  const bc = batColor(d.battery)
  const isActive = d.state !== 'idle'
  return (
    <div
      className="rounded-md p-2 border border-[var(--color-border)] transition-all"
      style={{
        background: isActive ? sc + '08' : 'var(--color-card)',
        borderLeftColor: sc,
        borderLeftWidth: '2px',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-[var(--font-mono)] font-bold text-[11px] text-[var(--color-white)]">D{d.id}</span>
        <span
          className="text-[6.5px] font-bold uppercase tracking-wide px-1.5 py-[2px] rounded-sm leading-none"
          style={{ color: sc, background: sc + '20' }}
        >
          {stateLabel[d.state] || d.state}
        </span>
      </div>

      <div className="flex items-center justify-between text-[8px] mb-1.5">
        <span className="font-[var(--font-mono)] font-bold tabular-nums" style={{ color: bc }}>
          {d.battery.toFixed(0)}%
        </span>
        <span className="text-[var(--color-txt3)] tabular-nums">{distM}m</span>
      </div>

      <div className="h-[2px] rounded-full overflow-hidden" style={{ background: '#1a2030' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${d.battery}%`, background: bc }}
        />
      </div>
    </div>
  )
}

function ReserveCard({ rd }) {
  const bc = batColor(rd.battery)
  const label = rd.state === 'docked' ? 'CHRG' : 'DEPLOY'
  const isDeploying = rd.state !== 'docked'
  return (
    <div
      className="rounded-md p-2 border border-[var(--color-border)] transition-all"
      style={{
        background: isDeploying ? '#14b8a608' : 'var(--color-card)',
        borderLeftColor: '#14b8a6',
        borderLeftWidth: '2px',
        opacity: 0.85,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-[var(--font-mono)] font-bold text-[11px] text-[var(--color-white)]">{rd.id}</span>
        <span className="text-[6.5px] font-bold uppercase tracking-wide px-1.5 py-[2px] rounded-sm leading-none text-[#14b8a6]"
          style={{ background: '#14b8a620' }}>
          {label}
        </span>
      </div>

      <div className="flex items-center justify-between text-[8px] mb-1.5">
        <span className="font-[var(--font-mono)] font-bold tabular-nums" style={{ color: bc }}>
          {rd.battery.toFixed(0)}%
        </span>
        <span className="text-[7px] text-[var(--color-txt3)]">RESERVE</span>
      </div>

      <div className="h-[2px] rounded-full overflow-hidden" style={{ background: '#1a2030' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${rd.battery}%`, background: '#14b8a6' }}
        />
      </div>
    </div>
  )
}

export default function FleetGrid({ drones, reserves, state }) {
  const { SX, SY, PPM } = state
  const activeCount = drones.filter(d => d.state !== 'idle').length
  const avgBat = drones.length > 0
    ? drones.reduce((s, d) => s + d.battery, 0) / drones.length
    : 0
  const avgBc = batColor(avgBat)

  return (
    <div className="shrink-0 flex flex-col border-b border-[var(--color-border)]">

      {/* Section header */}
      <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--color-card)] border-b border-[var(--color-border)] shrink-0">
        <span className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: activeCount > 0 ? '#f59e0b' : '#14b8a6' }} />
        <span className="text-[9px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em]">Fleet Status</span>
        <div className="flex items-center gap-3 ml-auto font-[var(--font-mono)] text-[8px]">
          <span className="text-[var(--color-txt3)]">
            avg bat <span className="font-bold tabular-nums" style={{ color: avgBc }}>{avgBat.toFixed(0)}%</span>
          </span>
          <div className="w-px h-3 bg-[var(--color-border2)]" />
          <span className="text-[var(--color-txt3)]">
            <span className="font-bold tabular-nums"
              style={{ color: activeCount > 0 ? '#f59e0b' : 'var(--color-txt3)' }}>{activeCount}</span>
            <span>/{drones.length} active</span>
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="overflow-y-auto custom-scroll p-2.5" style={{ maxHeight: '215px' }}>
        <div className="grid grid-cols-2 gap-1.5">
          {drones.map(d => {
            const dist = Math.hypot(d.x - SX, d.y - SY) / PPM
            return <DroneCard key={d.id} d={d} distM={dist.toFixed(0)} />
          })}
          {reserves.length > 0 && reserves.map(rd => <ReserveCard key={rd.id} rd={rd} />)}
        </div>
      </div>

    </div>
  )
}
