export default function LinkBudgetBar({ metrics, config }) {
  const m = metrics
  const steps = [
    { label: 'Tx Power', value: `+${config.txPower}`, unit: 'dBm', color: 'var(--color-accent)', type: 'gain' },
    { label: 'Tx Gain', value: `+${config.txGain}`, unit: 'dBi', color: 'var(--color-mint)', type: 'gain' },
    { label: 'Cable Loss', value: `-${config.cableLoss}`, unit: 'dB', color: 'var(--color-danger)', type: 'loss' },
    { label: 'Path Loss', value: `-${m.pathLoss.toFixed(1)}`, unit: 'dB', color: 'var(--color-danger)', type: 'loss' },
    { label: 'Fading Margin', value: `-${config.fadingMargin}`, unit: 'dB', color: 'var(--color-warn)', type: 'loss' },
    { label: 'Rx Gain', value: `+${config.rxGain}`, unit: 'dBi', color: 'var(--color-mint)', type: 'gain' },
    { label: 'Rx Power', value: m.rxPower.toFixed(1), unit: 'dBm', color: m.linkOk ? 'var(--color-mint)' : 'var(--color-danger)', type: 'result' },
  ]

  return (
    <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg2)]">
      <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-3">Link Budget Chain</div>
      <div className="flex items-center gap-1 overflow-x-auto">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <div className={`text-center px-3 py-2 rounded-md border ${s.type === 'result' ? 'border-2' : 'border'}`}
                 style={{ borderColor: s.color, background: s.color + '0a' }}>
              <div className="text-[7px] uppercase tracking-widest font-bold mb-1" style={{ color: s.color + '99' }}>{s.label}</div>
              <div className="text-[14px] font-bold font-[var(--font-mono)]" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[8px] text-[var(--color-txt3)]">{s.unit}</div>
            </div>
            {i < steps.length - 1 && (
              <div className="text-[var(--color-txt3)] text-lg px-0.5">→</div>
            )}
          </div>
        ))}
        {/* Sensitivity comparison */}
        <div className="text-[var(--color-txt3)] text-lg px-1">vs</div>
        <div className="text-center px-3 py-2 rounded-md border border-[var(--color-txt3)]" style={{ background: 'var(--color-txt3)' + '0a' }}>
          <div className="text-[7px] uppercase tracking-widest font-bold mb-1 text-[var(--color-txt2)]">Sensitivity</div>
          <div className="text-[14px] font-bold font-[var(--font-mono)] text-[var(--color-txt2)]">{m.sensitivity}</div>
          <div className="text-[8px] text-[var(--color-txt3)]">dBm</div>
        </div>
        <div className="text-[var(--color-txt3)] text-lg px-1">=</div>
        <div className={`text-center px-4 py-2 rounded-md border-2 ${m.linkOk ? 'border-[var(--color-mint)] bg-[#052e16]' : 'border-[var(--color-danger)] bg-[#450a0a]'}`}>
          <div className="text-[7px] uppercase tracking-widest font-bold mb-1 text-[var(--color-txt2)]">Margin</div>
          <div className={`text-[16px] font-bold font-[var(--font-mono)] ${m.linkOk ? 'text-[var(--color-mint)]' : 'text-[var(--color-danger)]'}`}>
            {m.linkMargin.toFixed(1)} dB
          </div>
          <div className={`text-[8px] font-bold ${m.linkOk ? 'text-[var(--color-mint)]' : 'text-[var(--color-danger)]'}`}>
            {m.linkOk ? '✓ VIABLE' : '✗ FAILED'}
          </div>
        </div>
      </div>
    </div>
  )
}
