const colorMap = {
  'cl-sos':    'text-[var(--color-danger)]',
  'cl-ack':    'text-[var(--color-mint)]',
  'cl-cnp':    'text-[var(--color-warn)]',
  'cl-bid':    'text-[var(--color-cyan)]',
  'cl-deploy': 'text-[var(--color-violet)]',
  'cl-arrive': 'text-[var(--color-mint)]',
  'cl-info':   'text-[var(--color-txt3)]',
  'cl-eval':   'text-[var(--color-pink)]',
  'cl-dock':   'text-[var(--color-teal)]',
}

export default function CommLog({ logs, count }) {
  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--color-card)] border-b border-[var(--color-border)] shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-cyan)] shrink-0" />
        <span className="text-[9px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em]">Communication Log</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="font-[var(--font-mono)] text-[9px] font-bold text-[var(--color-txt3)]">CNP</span>
          <span
            className="font-[var(--font-mono)] text-[9px] font-bold px-2 py-[2px] rounded-full tabular-nums"
            style={{ background: 'var(--color-border2)', color: 'var(--color-cyan)' }}
          >
            {count}
          </span>
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-2 bg-[#02050e] font-[var(--font-mono)] text-[10.5px] leading-[1.85] log-scroll">
        {logs.length === 0 ? (
          <div className="text-[var(--color-txt3)] pt-1">
            [SYS] All drones patrolling. Trigger an accident to begin.
          </div>
        ) : (
          logs.map(l => (
            <div
              key={l.id}
              className={`py-[2px] border-b border-[#ffffff06] ${colorMap[l.cls] || 'text-[var(--color-txt2)]'}`}
            >
              {l.msg}
            </div>
          ))
        )}
      </div>

    </div>
  )
}
