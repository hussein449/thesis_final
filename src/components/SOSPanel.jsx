export default function SOSPanel({ state }) {
  const { sosFrame, simState } = state
  const visible = simState !== 'idle'
  if (!visible) return null

  const fields = [
    { label: 'Sensor ID', value: `S-${String(sosFrame.sensorId).padStart(3,'0')}`, bytes: '2 B', bg: 'bg-[#12103a]' },
    { label: 'Latitude', value: `${sosFrame.lat.toFixed(4)}°`, bytes: '4 B', bg: 'bg-[#0f1e05]' },
    { label: 'Longitude', value: `${sosFrame.lon.toFixed(4)}°`, bytes: '4 B', bg: 'bg-[#0f1e05]' },
    { label: 'Timestamp', value: new Date(sosFrame.timestamp * 1000).toLocaleTimeString('en-GB'), bytes: '4 B', bg: 'bg-[#1a1200]' },
    { label: 'Severity', value: sosFrame.severity === 0 ? '0 (MOD)' : '1 (HIGH)', bytes: '1 B', bg: 'bg-[#1e0808]',
      cls: sosFrame.severity === 1 ? 'text-[var(--color-danger)]' : 'text-[var(--color-warn)]' },
  ]

  return (
    <div className="p-3 bg-[var(--color-card)] border-b border-[var(--color-border)] animate-[sos-flash_0.4s_ease-out]">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-2 h-2 rounded-full bg-[var(--color-danger)] animate-[pulse-dot_1s_infinite]" />
        <span className="text-[10px] font-bold text-[var(--color-danger)] tracking-widest">SOS FRAME — LoRa BROADCAST</span>
      </div>
      <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] font-[var(--font-mono)] text-[10px]">
        {fields.map((f, i) => (
          <div key={i} className={`flex-1 py-2 px-1.5 text-center ${f.bg} ${i < fields.length - 1 ? 'border-r border-black/30' : ''}`}>
            <div className="text-[7px] text-[var(--color-txt2)] uppercase tracking-widest mb-1">{f.label}</div>
            <div className={`font-bold text-[11px] ${f.cls || 'text-[var(--color-white)]'}`}>{f.value}</div>
            <div className="text-[7px] text-[var(--color-txt3)] mt-0.5">{f.bytes}</div>
          </div>
        ))}
      </div>
      <div className="text-[8px] text-[var(--color-txt3)] text-center mt-2 font-[var(--font-mono)] tracking-wider">
        15-byte payload · 868 MHz · SF7 · BW 250 kHz
      </div>
    </div>
  )
}
