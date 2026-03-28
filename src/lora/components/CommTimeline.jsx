export default function CommTimeline({ metrics, config }) {
  const m = metrics
  const totalWidth = 100 // percentage

  // Proportional widths
  const total = m.propDelayUs / 1000 + m.preambleMs + m.payloadMs
  const propW = Math.max(2, (m.propDelayUs / 1000) / total * totalWidth)
  const preambleW = Math.max(8, m.preambleMs / total * totalWidth)
  const payloadW = Math.max(8, m.payloadMs / total * totalWidth)

  return (
    <div className="p-3 border-t border-[var(--color-border)] shrink-0">
      <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-3">SOS Transmission Timeline</div>

      {/* D1 → D2: SOS */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-bold text-[var(--color-accent)] font-[var(--font-mono)]">D1 → D2 : SOS Frame ({config.payloadBytes} bytes)</span>
          <span className="text-[9px] font-[var(--font-mono)] text-[var(--color-cyan)]">{m.totalDelayMs.toFixed(2)} ms</span>
        </div>
        <div className="flex h-6 rounded overflow-hidden border border-[var(--color-border)]">
          <div className="flex items-center justify-center text-[7px] font-bold text-white/80"
               style={{ width: `${propW}%`, background: '#1e3a5a' }}>
            {m.propDelayUs > 0.5 ? `${m.propDelayUs.toFixed(1)}μs` : ''}
          </div>
          <div className="flex items-center justify-center text-[7px] font-bold text-white/80"
               style={{ width: `${preambleW}%`, background: '#1a4a2a' }}>
            Preamble {m.preambleMs.toFixed(1)}ms
          </div>
          <div className="flex items-center justify-center text-[7px] font-bold text-white/80"
               style={{ width: `${payloadW}%`, background: '#2d7ff9' }}>
            Payload {m.payloadMs.toFixed(1)}ms
          </div>
        </div>
        <div className="flex text-[7px] text-[var(--color-txt3)] mt-0.5">
          <span style={{ width: `${propW}%` }} className="text-center">Propagation</span>
          <span style={{ width: `${preambleW}%` }} className="text-center">Preamble</span>
          <span style={{ width: `${payloadW}%` }} className="text-center">Data</span>
        </div>
      </div>

      {/* D2 → D1: ACK */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-bold text-[var(--color-mint)] font-[var(--font-mono)]">D2 → D1 : ACK (5 bytes)</span>
          <span className="text-[9px] font-[var(--font-mono)] text-[var(--color-cyan)]">≈ {(m.totalDelayMs * 0.6).toFixed(2)} ms</span>
        </div>
        <div className="flex h-5 rounded overflow-hidden border border-[var(--color-border)]">
          <div className="flex items-center justify-center text-[7px] font-bold text-white/70"
               style={{ width: `${propW}%`, background: '#1e3a5a' }} />
          <div className="flex items-center justify-center text-[7px] font-bold text-white/70"
               style={{ width: `${preambleW}%`, background: '#0e3020' }}>
            Preamble
          </div>
          <div className="flex items-center justify-center text-[7px] font-bold text-white/70"
               style={{ width: `${Math.max(5, payloadW * 0.4)}%`, background: '#10b981' }}>
            ACK
          </div>
        </div>
      </div>

      {/* Total RTT */}
      <div className="flex items-center justify-between bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-2 mt-2">
        <span className="text-[9px] text-[var(--color-txt2)] font-bold">Complete Round-Trip (SOS + ACK)</span>
        <span className="text-[13px] font-bold font-[var(--font-mono)] text-[var(--color-cyan)]">{m.rttMs.toFixed(2)} ms</span>
      </div>

      {/* Drone travel */}
      <div className="flex items-center justify-between bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-2 mt-1.5">
        <span className="text-[9px] text-[var(--color-txt2)] font-bold">Drone Flight to Incident @ {config.droneSpeed} m/s</span>
        <span className="text-[13px] font-bold font-[var(--font-mono)] text-[var(--color-warn)]">
          {m.arrivalTimeSec > 60 ? `${(m.arrivalTimeSec/60).toFixed(1)} min` : `${m.arrivalTimeSec.toFixed(1)} sec`}
        </span>
      </div>
    </div>
  )
}
