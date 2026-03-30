function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <label className="min-w-[95px] text-[10px] text-[var(--color-txt2)] shrink-0">{label}</label>
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

export default function SettingsPanel({ config, onChange, onClose }) {
  const set = key => val => onChange(prev => ({ ...prev, [key]: val }))

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
        className="fixed top-0 right-0 h-full w-[460px] max-w-full bg-[var(--color-bg)] border-l border-[var(--color-border)] z-50 flex flex-col shadow-[−8px_0_40px_rgba(0,0,0,0.6)]"
        style={{ animation: 'loraDrawerIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] shrink-0 bg-gradient-to-b from-[#0a0e1a] to-[var(--color-bg)]">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 flex items-center justify-center bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-violet)] rounded-lg text-white shrink-0">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-extrabold text-[var(--color-white)] tracking-tight">LoRa Parameters</div>
              <div className="text-[9px] text-[var(--color-txt2)] uppercase tracking-widest">Radio Link Configuration</div>
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

          <Section title="Transmitter" color="var(--color-accent)">
            <Slider label="Frequency"  value={config.freqMHz}  min={400}  max={2000} step={50}  unit=" MHz" onChange={set('freqMHz')} />
            <Slider label="Tx Power"   value={config.txPower}  min={-10}  max={30}   step={1}   unit=" dBm" onChange={set('txPower')} />
            <Slider label="Tx Gain"    value={config.txGain}   min={0}    max={12}   step={0.5} unit=" dBi" onChange={set('txGain')} />
          </Section>

          <Section title="Receiver" color="var(--color-mint)">
            <Slider label="Rx Gain"        value={config.rxGain}       min={0}  max={12} step={0.5} unit=" dBi" onChange={set('rxGain')} />
            <Slider label="Cable Loss"     value={config.cableLoss}    min={0}  max={5}  step={0.1} unit=" dB"  onChange={set('cableLoss')} />
            <Slider label="Fading Margin"  value={config.fadingMargin} min={0}  max={20} step={1}   unit=" dB"  onChange={set('fadingMargin')} />
          </Section>

          <Section title="LoRa Modulation" color="var(--color-violet)">
            <Slider label="Spreading Factor" value={config.sf}           min={7}   max={12}  step={1}   onChange={set('sf')} />
            <Slider label="Bandwidth"        value={config.bwKHz}        min={125} max={500} step={125} unit=" kHz" onChange={set('bwKHz')} />
            <Slider label="Payload Size"     value={config.payloadBytes} min={5}   max={50}  step={1}   unit=" B"   onChange={set('payloadBytes')} />
          </Section>

          <Section title="Drone Platform" color="var(--color-cyan)">
            <Slider label="Speed"       value={config.droneSpeed} min={5}  max={30}  step={1}  unit=" m/s" onChange={set('droneSpeed')} />
            <Slider label="Altitude D1" value={config.alt1}       min={10} max={150} step={5}  unit=" m"   onChange={set('alt1')} />
            <Slider label="Altitude D2" value={config.alt2}       min={10} max={150} step={5}  unit=" m"   onChange={set('alt2')} />
          </Section>

          {/* Quick reference */}
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-3.5">
            <div className="text-[8px] font-bold text-[var(--color-txt3)] uppercase tracking-[0.14em] mb-2">Quick Reference</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-[var(--font-mono)]">
              <div><span className="text-[var(--color-txt3)]">SF7 airtime ~</span> <span className="text-[var(--color-cyan)]">56 ms</span></div>
              <div><span className="text-[var(--color-txt3)]">SF12 airtime ~</span> <span className="text-[var(--color-cyan)]">2.8 s</span></div>
              <div><span className="text-[var(--color-txt3)]">868 MHz sens.</span> <span className="text-[var(--color-mint)]">−137 dBm</span></div>
              <div><span className="text-[var(--color-txt3)]">915 MHz sens.</span> <span className="text-[var(--color-mint)]">−137 dBm</span></div>
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
