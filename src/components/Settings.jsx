function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <label className="min-w-[100px] text-[10px] text-[var(--color-txt2)] shrink-0">{label}</label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[var(--color-accent)]"
      />
      <span className="min-w-[58px] text-right text-[10px] text-[var(--color-cyan)] font-semibold font-[var(--font-mono)]">
        {value}{unit || ''}
      </span>
    </div>
  )
}

function Section({ title, color, children }) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-3.5">
      <div
        className="text-[8px] font-bold uppercase tracking-[0.14em] mb-3 pb-2 border-b border-[var(--color-border)]"
        style={{ color }}
      >
        {title}
      </div>
      {children}
    </div>
  )
}

export default function Settings({ open, onClose, config, onChange }) {
  if (!open) return null
  const set = key => val => onChange(key, val)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        style={{ backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full w-[460px] max-w-full bg-[var(--color-bg)] border-l border-[var(--color-border)] z-50 flex flex-col shadow-2xl"
        style={{ animation: 'loraDrawerIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] shrink-0 bg-gradient-to-b from-[#0a0e1a] to-[var(--color-bg)]">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 flex items-center justify-center bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-cyan)] rounded-lg text-white shrink-0">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-extrabold text-[var(--color-white)] tracking-tight">Simulation Parameters</div>
              <div className="text-[9px] text-[var(--color-txt2)] uppercase tracking-widest">Drone Fleet Configuration</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border2)] text-[var(--color-txt2)] hover:bg-[#1a2540] hover:text-white cursor-pointer transition-colors text-[13px] font-bold"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scroll p-4 flex flex-col gap-3">

          <Section title="Scenario" color="var(--color-accent)">
            <Slider label="Drones"       value={config.droneCount}  min={3}   max={8}  step={1}   onChange={set('droneCount')} />
            <Slider label="Drone speed"  value={config.droneSpeed}  min={2}   max={20} step={1}   unit=" m/s" onChange={set('droneSpeed')} />
            <Slider label="Wave speed"   value={config.waveSpeed}   min={1}   max={5}  step={1}   unit="x"   onChange={set('waveSpeed')} />
          </Section>

          <Section title="Radio" color="var(--color-cyan)">
            <Slider label="Frequency"    value={config.freq}        min={400} max={5800} step={50}  unit=" MHz" onChange={set('freq')} />
            <Slider label="Tx power"     value={config.txPwr}       min={-10} max={33}   step={1}   unit=" dBm" onChange={set('txPwr')} />
            <Slider label="Bat drain/s"  value={config.batDrain}    min={0.1} max={2}    step={0.1} unit="%"   onChange={set('batDrain')} />
          </Section>

          <Section title="Thresholds" color="var(--color-warn)">
            <Slider label="Min battery"    value={config.minBat}       min={10} max={50} step={5} unit="%" onChange={set('minBat')} />
            <Slider label="Low bat swap"   value={config.lowBat}       min={15} max={40} step={5} unit="%" onChange={set('lowBat')} />
            <Slider label="Reserve drones" value={config.reserveCount} min={1}  max={4}  step={1}     onChange={set('reserveCount')} />
          </Section>

          {/* Current config summary */}
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-3.5">
            <div className="text-[8px] font-bold text-[var(--color-txt3)] uppercase tracking-[0.14em] mb-2">Active Configuration</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-[var(--font-mono)]">
              <div><span className="text-[var(--color-txt3)]">Fleet:</span> <span className="text-[var(--color-cyan)]">{config.droneCount} drones ({config.reserveCount} reserve)</span></div>
              <div><span className="text-[var(--color-txt3)]">Speed:</span> <span className="text-[var(--color-cyan)]">{config.droneSpeed} m/s</span></div>
              <div><span className="text-[var(--color-txt3)]">Freq:</span> <span className="text-[var(--color-cyan)]">{config.freq} MHz</span></div>
              <div><span className="text-[var(--color-txt3)]">Tx:</span> <span className="text-[var(--color-cyan)]">{config.txPwr} dBm</span></div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--color-border)] shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-md bg-[var(--color-accent)] text-white text-[11px] font-bold tracking-wide cursor-pointer hover:opacity-90 transition-opacity"
          >
            Apply &amp; Close
          </button>
        </div>
      </div>
    </>
  )
}
