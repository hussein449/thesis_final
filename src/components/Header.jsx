const phaseColors = {
  IDLE: 'text-[var(--color-txt2)]',
  'SOS BROADCAST': 'text-[var(--color-danger)]',
  EVALUATE: 'text-[var(--color-pink)]',
  DEPLOYING: 'text-[var(--color-violet)]',
  COMPLETE: 'text-[var(--color-mint)]',
  DENIED: 'text-[var(--color-danger)]',
  FAILED: 'text-[var(--color-danger)]',
}

export default function Header({ state, onNavigateResults }) {
  const { simState, simMs, severity, primaryIdx, backupIdx, drones = [] } = state

  const phase = simState === 'broadcasting' ? 'SOS BROADCAST'
    : simState === 'evaluating' ? 'EVALUATE'
    : simState === 'flying' ? 'DEPLOYING'
    : simState === 'arrived' ? 'COMPLETE'
    : 'IDLE'

  const stats = [
    { label: 'Phase', value: phase, cls: phaseColors[phase] || '' },
    { label: 'Sim Time', value: `${Math.floor(simMs)} ms` },
    { label: 'Severity', value: severity === 0 ? '0 · MOD' : '1 · HIGH', cls: severity === 1 ? 'text-[var(--color-danger)]' : 'text-[var(--color-warn)]' },
    { label: 'Primary', value: primaryIdx >= 0 ? `D${drones[primaryIdx]?.id}` : '—' },
    { label: 'Backup', value: backupIdx >= 0 ? `D${drones[backupIdx]?.id}` : '—' },
  ]

  return (
    <header className="flex items-center justify-between px-5 py-3 bg-gradient-to-b from-[#0a0e1a] to-[var(--color-bg)] border-b border-[var(--color-border)]">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-violet)] rounded-lg text-white text-sm">◆</div>
        <div>
          <h1 className="text-[15px] font-extrabold text-[var(--color-white)] tracking-tight">Drone Swarm Patrol</h1>
          <p className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest">Decentralized SOS Response · CNP Deployment</p>
        </div>
      </div>
      <div className="flex gap-5 items-center">
        {stats.map(s => (
          <div key={s.label} className="text-center min-w-[56px]">
            <div className="text-[8px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">{s.label}</div>
            <div className={`text-[13px] font-bold font-[var(--font-mono)] mt-0.5 ${s.cls || 'text-[var(--color-cyan)]'}`}>{s.value}</div>
          </div>
        ))}
        <button
          onClick={onNavigateResults}
          className="ml-2 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest border border-[var(--color-cyan)]/30 text-[var(--color-cyan)] bg-[var(--color-cyan)]/5 hover:bg-[var(--color-cyan)]/15 transition-colors flex items-center gap-1.5"
        >
          <span className="text-[13px]">⬡</span>
          Results
        </button>
      </div>
    </header>
  )
}