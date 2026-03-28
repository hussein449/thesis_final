const badgeLabels = {
  idle: 'PATROL', reached: 'REACHED', ackSender: 'ACK SENT', deploy: 'PRIMARY',
  backup: 'BACKUP', flying: 'EN ROUTE', arrived: 'ON SITE', returning: 'TO DOCK', docked: 'DOCKED'
}

const borderColors = {
  ackSender: 'border-l-[var(--color-mint)]', deploy: 'border-l-[var(--color-violet)]',
  backup: 'border-l-[var(--color-warn)]', flying: 'border-l-[var(--color-violet)]',
  arrived: 'border-l-[var(--color-mint)]', returning: 'border-l-[var(--color-teal)]',
}

function batColor(b) { return b > 50 ? 'var(--color-mint)' : b > 30 ? 'var(--color-warn)' : 'var(--color-danger)' }

function DroneCard({ d, distM }) {
  const bc = borderColors[d.state] || 'border-l-transparent'
  return (
    <div className={`bg-[var(--color-card)] border border-[var(--color-border)] border-l-[3px] ${bc} rounded-md p-2.5 text-[10px] transition-colors`}>
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-bold text-[var(--color-white)] text-xs font-[var(--font-mono)]">D{d.id}</span>
        <span className="text-[7px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: batColor(d.battery) + '22', color: batColor(d.battery) }}>
          {badgeLabels[d.state] || d.state}
        </span>
      </div>
      <div className="flex justify-between text-[9px] text-[var(--color-txt2)]">
        <span>Bat: {d.battery.toFixed(0)}%</span>
        <span>Rng: {d.range} km</span>
      </div>
      <div className="flex justify-between text-[9px] text-[var(--color-txt2)] mt-0.5">
        <span>Dist: {distM}m</span>
        {d.bid > 0 && <span className="text-[var(--color-cyan)]">Bid: {d.bid.toFixed(1)}</span>}
      </div>
      <div className="h-[3px] rounded-full bg-[#1a2030] mt-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${d.battery}%`, background: batColor(d.battery) }} />
      </div>
    </div>
  )
}

function ReserveCard({ rd }) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-teal)]/30 border-l-[3px] border-l-[var(--color-teal)] rounded-md p-2.5 text-[10px] opacity-80">
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-bold text-[var(--color-white)] text-xs font-[var(--font-mono)]">{rd.id}</span>
        <span className="text-[7px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#0d3730]/30 text-[var(--color-teal)]">
          {rd.state === 'docked' ? 'CHARGING' : 'DEPLOYING'}
        </span>
      </div>
      <div className="flex justify-between text-[9px] text-[var(--color-txt2)]">
        <span>Bat: {rd.battery.toFixed(0)}%</span>
        <span>RESERVE</span>
      </div>
      <div className="h-[3px] rounded-full bg-[#1a2030] mt-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${rd.battery}%`, background: 'var(--color-teal)' }} />
      </div>
    </div>
  )
}

export default function FleetGrid({ drones, reserves, state }) {
  const { SX, SY, PPM } = state
  return (
    <div className="px-5 py-3.5 border-b border-[var(--color-border)]">
      <div className="text-[9px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-2.5">Drone Fleet Status</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-2">
        {drones.map(d => {
          const dist = Math.hypot(d.x - SX, d.y - SY) / PPM
          return <DroneCard key={d.id} d={d} distM={dist.toFixed(0)} />
        })}
        {reserves.map(rd => <ReserveCard key={rd.id} rd={rd} />)}
      </div>
    </div>
  )
}
