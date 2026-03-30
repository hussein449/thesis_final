export default function SOSPanel({ state }) {
  const { sosFrame, simState } = state
  if (simState === 'idle') return null

  const isCritical = sosFrame.severity === 1
  const sevColor = isCritical ? '#ef4444' : '#f59e0b'

  const fields = [
    { label: 'Sensor ID',  value: `S-${String(sosFrame.sensorId).padStart(3, '0')}`, color: 'var(--color-accent)' },
    { label: 'Severity',   value: isCritical ? '1 · CRITICAL' : '0 · MODERATE',      color: sevColor },
    { label: 'Latitude',   value: `${sosFrame.lat.toFixed(5)}°N`,                     color: 'var(--color-mint)' },
    { label: 'Longitude',  value: `${sosFrame.lon.toFixed(5)}°E`,                     color: 'var(--color-mint)' },
    { label: 'Timestamp',  value: new Date(sosFrame.timestamp * 1000).toLocaleTimeString('en-GB'), color: 'var(--color-cyan)' },
    { label: 'Payload',    value: '15 bytes',                                         color: 'var(--color-txt2)' },
  ]

  return (
    <div
      className="shrink-0 border-b border-[var(--color-border)]"
      style={{ borderLeft: `2px solid ${sevColor}` }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3.5 py-[7px] border-b shrink-0"
        style={{ background: isCritical ? '#0c0305' : '#0a0802', borderBottomColor: sevColor + '28' }}
      >
        <div
          className="w-[7px] h-[7px] rounded-full shrink-0"
          style={{
            background: sevColor,
            boxShadow: `0 0 6px ${sevColor}`,
            animation: 'pulse-dot 1s infinite',
          }}
        />
        <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: sevColor }}>
          SOS · LoRa Broadcast
        </span>
        <div className="flex items-center gap-1.5 ml-auto font-[var(--font-mono)] text-[7.5px] text-[var(--color-txt3)]">
          <span>868 MHz</span>
          <span className="text-[var(--color-border2)]">·</span>
          <span>SF7</span>
          <span className="text-[var(--color-border2)]">·</span>
          <span>BW 250</span>
        </div>
      </div>

      {/* Data grid */}
      <div
        className="px-3.5 py-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5"
        style={{ background: isCritical ? '#070203' : '#060604' }}
      >
        {fields.map(f => (
          <div key={f.label}>
            <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-[0.12em] mb-[3px]">{f.label}</div>
            <div className="font-[var(--font-mono)] font-bold text-[10.5px]" style={{ color: f.color }}>
              {f.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
