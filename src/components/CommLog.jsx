const colorMap = {
  'cl-sos': 'text-[var(--color-danger)]',
  'cl-ack': 'text-[var(--color-mint)]',
  'cl-cnp': 'text-[var(--color-warn)]',
  'cl-bid': 'text-[var(--color-cyan)]',
  'cl-deploy': 'text-[var(--color-violet)]',
  'cl-arrive': 'text-[var(--color-mint)]',
  'cl-info': 'text-[var(--color-txt3)]',
  'cl-eval': 'text-[var(--color-pink)]',
  'cl-dock': 'text-[var(--color-teal)]',
}

export default function CommLog({ logs, count }) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[var(--color-card)] border-b border-[var(--color-border)] shrink-0">
        <span className="text-[var(--color-cyan)] text-xs">▪</span>
        <span className="text-[9px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em]">Communication Log</span>
        <span className="ml-auto bg-[var(--color-border2)] text-[var(--color-cyan)] font-[var(--font-mono)] text-[9px] font-bold px-2 py-0.5 rounded-full">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3.5 py-2.5 bg-[var(--color-bg)] font-[var(--font-mono)] text-[11px] leading-[2] log-scroll max-h-[320px]">
        {logs.length === 0 && (
          <div className="text-[var(--color-txt3)]">[SYS] Drones patrolling. Trigger an accident to begin.</div>
        )}
        {logs.map(l => (
          <div key={l.id} className={`py-0.5 border-b border-[var(--color-border)] ${colorMap[l.cls] || 'text-[var(--color-txt2)]'}`}>
            {l.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
