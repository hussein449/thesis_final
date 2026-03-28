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

export default function Controls({ state, severity, paused, onTrigger, onPause, onReset, onSeverity }) {
  const disabled = state.simState !== 'idle' && state.simState !== 'arrived'

  const [lambda, setLambda] = useState(0.5) // events per second
  const [autoMode, setAutoMode] = useState(false)
  const [nextIn, setNextIn] = useState(null) // countdown in ms
  const timerRef = useRef(null)
  const countdownRef = useRef(null)

  // Auto-trigger logic
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

      // Countdown ticker
      const start = Date.now()
      clearInterval(countdownRef.current)
      countdownRef.current = setInterval(() => {
        const remaining = interval - (Date.now() - start)
        setNextIn(Math.max(0, remaining))
      }, 50)

      timerRef.current = setTimeout(() => {
        clearInterval(countdownRef.current)
        onTrigger()
        // Schedule next after a small delay to let sim reset
        setTimeout(scheduleNext, 200)
      }, interval)
    }

    scheduleNext()

    return () => {
      clearTimeout(timerRef.current)
      clearInterval(countdownRef.current)
    }
  }, [autoMode, lambda, paused])

  const handleAutoToggle = () => {
    setAutoMode(prev => !prev)
  }

  return (
    <div className="flex flex-col border-b border-[var(--color-border)]">
      {/* Main controls row */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-2.5 bg-[var(--color-bg2)]">
        <button onClick={onTrigger} disabled={disabled || autoMode}
          className="px-5 py-1.5 bg-[var(--color-accent)] text-white font-bold text-xs rounded-md border-none shadow-[0_0_20px_rgba(45,127,249,0.15)] hover:bg-[#1a5fc8] disabled:opacity-25 cursor-pointer disabled:cursor-default transition-all">
          ▶ Trigger Accident
        </button>
        <button onClick={onPause}
          className="px-3.5 py-1.5 text-[var(--color-txt2)] text-[11px] font-semibold border border-[var(--color-border2)] rounded-md bg-transparent hover:bg-[#111827] cursor-pointer transition-all">
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button onClick={onReset}
          className="px-3.5 py-1.5 text-[var(--color-txt2)] text-[11px] font-semibold border border-[var(--color-border2)] rounded-md bg-transparent hover:bg-[#111827] cursor-pointer transition-all">
          ↻ Reset
        </button>

        <div className="flex ml-2">
          <button onClick={() => onSeverity(0)}
            className={`px-3.5 py-1.5 text-[10px] font-semibold border rounded-l-md cursor-pointer transition-all ${severity === 0 ? 'bg-[#052e16] text-[var(--color-mint)] border-[var(--color-mint)]' : 'border-[var(--color-border2)] bg-transparent text-[var(--color-txt2)]'}`}>
            SEV 0 · Moderate
          </button>
          <button onClick={() => onSeverity(1)}
            className={`px-3.5 py-1.5 text-[10px] font-semibold border border-l-0 rounded-r-md cursor-pointer transition-all ${severity === 1 ? 'bg-[#450a0a] text-[var(--color-danger)] border-[var(--color-danger)]' : 'border-[var(--color-border2)] bg-transparent text-[var(--color-txt2)]'}`}>
            SEV 1 · Critical
          </button>
        </div>

        {/* Poisson auto-trigger toggle */}
        <div className="flex items-center gap-2 ml-3 pl-3 border-l border-[var(--color-border2)]">
          <button onClick={handleAutoToggle}
            className={`px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md border cursor-pointer transition-all ${autoMode
              ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/40'
              : 'bg-transparent text-[var(--color-txt2)] border-[var(--color-border2)] hover:bg-[#111827]'
            }`}>
            {autoMode ? '■ Stop Auto' : '⟳ Auto Poisson'}
          </button>
        </div>

        <div className="flex gap-2.5 ml-auto items-center">
          {legendItems.map(l => (
            <span key={l.label} className="flex items-center gap-1 text-[9px] text-[var(--color-txt2)]">
              <i className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Poisson config row */}
      <div className="flex items-center gap-4 px-5 py-2 bg-[#060a14] border-t border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">λ (events/s)</span>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={lambda}
            onChange={e => setLambda(parseFloat(e.target.value))}
            className="w-[120px] h-1 accent-[var(--color-accent)] bg-[var(--color-border)] rounded-full cursor-pointer"
          />
          <span className="text-[13px] font-extrabold text-[var(--color-cyan)] font-mono w-[40px]">{lambda.toFixed(1)}</span>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-[var(--color-txt2)]">
          <span>Mean interval: <span className="text-[var(--color-white)] font-bold font-mono">{(1 / lambda).toFixed(2)}s</span></span>
          <span>Expected rate: <span className="text-[var(--color-white)] font-bold font-mono">{(lambda * 60).toFixed(0)}/min</span></span>
        </div>

        {autoMode && nextIn !== null && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[9px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">Next trigger</span>
            <div className="flex items-center gap-1.5">
              <div className="w-[80px] h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-75"
                  style={{ width: `${Math.max(0, 100 - (nextIn / (1000 / lambda)) * 100)}%` }}
                />
              </div>
              <span className="text-[12px] font-bold text-[var(--color-accent)] font-mono w-[52px] text-right">
                {(nextIn / 1000).toFixed(2)}s
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}