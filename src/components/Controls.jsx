import { useState, useEffect, useRef } from "react";

const legendItems = [
  { color: 'var(--color-accent)', label: 'Sensor' },
  { color: 'var(--color-txt2)', label: 'Patrol' },
  { color: 'var(--color-mint)', label: 'ACK' },
  { color: 'var(--color-violet)', label: 'Deploy' },
  { color: 'var(--color-warn)', label: 'Backup' },
  { color: 'var(--color-teal)', label: 'Dock' },
  { color: 'var(--color-danger)', label: 'SOS' },
]

// Generate next Poisson inter-arrival time (exponential distribution)
function nextPoissonInterval(lambda) {
  // -ln(U) / λ  where U ~ Uniform(0,1)
  return -Math.log(1 - Math.random()) / lambda * 1000 // in ms
}

export default function Controls({ state, severity, paused, onTrigger, onPause, onReset, onSeverity, onOpenSettings }) {
  const disabled = state.simState !== 'idle' && state.simState !== 'arrived'

  const [lambda, setLambda] = useState(0.5)
  const [autoMode, setAutoMode] = useState(false)
  const [nextIn, setNextIn] = useState(null)
  const timerRef = useRef(null)
  const countdownRef = useRef(null)

  useEffect(() => {
    if (!autoMode || paused) {
      clearTimeout(timerRef.current)
      clearInterval(countdownRef.current)
      if (!autoMode) setNextIn(null)
      return
    }
    const scheduleNext = () => {
      const interval = nextPoissonInterval(lambda)
      setNextIn(interval)
      const start = Date.now()
      clearInterval(countdownRef.current)
      countdownRef.current = setInterval(() => {
        setNextIn(Math.max(0, interval - (Date.now() - start)))
      }, 50)
      timerRef.current = setTimeout(() => {
        clearInterval(countdownRef.current)
        onTrigger()
        setTimeout(scheduleNext, 200)
      }, interval)
    }
    scheduleNext()
    return () => { clearTimeout(timerRef.current); clearInterval(countdownRef.current) }
  }, [autoMode, lambda, paused])

  return (
    <div className="flex flex-col shrink-0 border-b border-[var(--color-border)]">

      {/* ── Toolbar row ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#050a16]">

        {/* Primary action */}
        <button onClick={onTrigger} disabled={disabled || autoMode}
          className="flex items-center gap-2 px-4 py-[6px] bg-[var(--color-accent)] text-white font-bold text-[11px] rounded-md shadow-[0_0_18px_rgba(45,127,249,0.22)] hover:bg-[#1a5fc8] hover:shadow-[0_0_24px_rgba(45,127,249,0.35)] disabled:opacity-25 disabled:cursor-default cursor-pointer transition-all shrink-0">
          <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg>
          Trigger Accident
        </button>

        {/* Secondary controls */}
        <div className="flex items-center gap-1 pl-2 border-l border-[var(--color-border2)]">
          <button onClick={onPause}
            className="flex items-center gap-1.5 px-3 py-[6px] text-[var(--color-txt2)] text-[10px] font-semibold border border-[var(--color-border2)] rounded-md bg-transparent hover:bg-[#0d1525] hover:text-[var(--color-white)] cursor-pointer transition-all">
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-[6px] text-[var(--color-txt2)] text-[10px] font-semibold border border-[var(--color-border2)] rounded-md bg-transparent hover:bg-[#0d1525] hover:text-[var(--color-white)] cursor-pointer transition-all">
            ↻ Reset
          </button>
        </div>

        {/* Severity selector */}
        <div className="flex pl-2 border-l border-[var(--color-border2)]">
          <button onClick={() => onSeverity(0)}
            className={`px-3 py-[6px] text-[10px] font-semibold border rounded-l-md cursor-pointer transition-all ${severity === 0
              ? 'bg-[#052e16] text-[var(--color-mint)] border-[var(--color-mint)]/60'
              : 'border-[var(--color-border2)] bg-transparent text-[var(--color-txt3)] hover:text-[var(--color-txt2)]'}`}>
            SEV 0 · Moderate
          </button>
          <button onClick={() => onSeverity(1)}
            className={`px-3 py-[6px] text-[10px] font-semibold border border-l-0 rounded-r-md cursor-pointer transition-all ${severity === 1
              ? 'bg-[#450a0a] text-[var(--color-danger)] border-[var(--color-danger)]/60'
              : 'border-[var(--color-border2)] bg-transparent text-[var(--color-txt3)] hover:text-[var(--color-txt2)]'}`}>
            SEV 1 · Critical
          </button>
        </div>

        {/* Auto-trigger */}
        <div className="flex items-center gap-2 pl-2 border-l border-[var(--color-border2)]">
          <button onClick={() => setAutoMode(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-[6px] text-[10px] font-bold uppercase tracking-widest rounded-md border cursor-pointer transition-all ${autoMode
              ? 'bg-[var(--color-accent)]/12 text-[var(--color-accent)] border-[var(--color-accent)]/35'
              : 'bg-transparent text-[var(--color-txt3)] border-[var(--color-border2)] hover:text-[var(--color-txt2)] hover:bg-[#0d1525]'}`}>
            <span className="text-[9px]">{autoMode ? '■' : '⟳'}</span>
            {autoMode ? 'Stop Auto' : 'Auto'}
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 pl-3 border-l border-[var(--color-border2)]">
          {legendItems.map(l => (
            <span key={l.label} className="flex items-center gap-1 text-[8.5px] text-[var(--color-txt3)]">
              <i className="w-[6px] h-[6px] rounded-full shrink-0 inline-block" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>

        {/* Settings */}
        <button onClick={onOpenSettings}
          className="ml-auto flex items-center gap-1.5 px-3 py-[6px] text-[10px] font-semibold rounded-md border border-[var(--color-border2)] text-[var(--color-txt2)] bg-transparent hover:bg-[#0d1525] hover:text-[var(--color-white)] cursor-pointer transition-all shrink-0">
          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          Settings
        </button>
      </div>

      {/* ── Poisson config row ── */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-[#030810] border-t border-[var(--color-border)]">
        <span className="text-[8px] font-bold text-[var(--color-txt3)] uppercase tracking-[0.14em] shrink-0">Poisson Config</span>
        <div className="w-px h-3 bg-[var(--color-border2)] shrink-0" />

        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[var(--color-txt3)] font-semibold shrink-0">λ</span>
          <input type="range" min="0.1" max="3" step="0.1" value={lambda}
            onChange={e => setLambda(parseFloat(e.target.value))}
            className="w-[100px] h-[3px] accent-[var(--color-accent)] cursor-pointer" />
          <span className="text-[12px] font-extrabold text-[var(--color-cyan)] font-mono w-[32px] tabular-nums">{lambda.toFixed(1)}</span>
          <span className="text-[8px] text-[var(--color-txt3)]">/s</span>
        </div>

        <div className="flex items-center gap-4 text-[9px] text-[var(--color-txt3)]">
          <span>Mean <span className="text-[var(--color-white)] font-bold font-mono">{(1/lambda).toFixed(2)}s</span></span>
          <span>Rate <span className="text-[var(--color-white)] font-bold font-mono">{(lambda*60).toFixed(0)}/min</span></span>
        </div>

        {autoMode && nextIn !== null && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[8px] text-[var(--color-txt3)] uppercase tracking-widest">Next</span>
            <div className="flex items-center gap-1.5">
              <div className="w-[72px] h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-75"
                  style={{ width: `${Math.max(0, 100 - (nextIn / (1000/lambda)) * 100)}%` }} />
              </div>
              <span className="text-[11px] font-bold text-[var(--color-accent)] font-mono w-[46px] text-right tabular-nums">
                {(nextIn/1000).toFixed(2)}s
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}