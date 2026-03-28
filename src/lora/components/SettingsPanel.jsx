import { useState } from 'react'

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <label className="min-w-[90px] text-[10px] text-[var(--color-txt2)] shrink-0">{label}</label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[var(--color-accent)]" />
      <span className="min-w-[55px] text-right text-[10px] text-[var(--color-cyan)] font-semibold font-[var(--font-mono)]">
        {value}{unit || ''}
      </span>
    </div>
  )
}

export default function SettingsPanel({ config, onChange }) {
  const [open, setOpen] = useState(true)
  const set = (key) => (val) => onChange(prev => ({ ...prev, [key]: val }))

  return (
    <div className="bg-[var(--color-bg2)] border-b border-[var(--color-border)]">
      <button onClick={() => setOpen(!open)}
        className="w-full text-left px-5 py-2.5 text-[10px] font-bold text-[var(--color-txt2)] uppercase tracking-widest border-b border-[var(--color-border)] bg-transparent hover:bg-[#111827] cursor-pointer transition-colors">
        {open ? '▾' : '▸'} LoRa Parameters
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 p-4">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-2">Transmitter</div>
            <Slider label="Frequency" value={config.freqMHz} min={400} max={2000} step={50} unit=" MHz" onChange={set('freqMHz')} />
            <Slider label="Tx Power" value={config.txPower} min={-10} max={30} step={1} unit=" dBm" onChange={set('txPower')} />
            <Slider label="Tx Gain" value={config.txGain} min={0} max={12} step={0.5} unit=" dBi" onChange={set('txGain')} />
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-2">Receiver</div>
            <Slider label="Rx Gain" value={config.rxGain} min={0} max={12} step={0.5} unit=" dBi" onChange={set('rxGain')} />
            <Slider label="Cable Loss" value={config.cableLoss} min={0} max={5} step={0.1} unit=" dB" onChange={set('cableLoss')} />
            <Slider label="Fading Margin" value={config.fadingMargin} min={0} max={20} step={1} unit=" dB" onChange={set('fadingMargin')} />
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-2">LoRa Modulation</div>
            <Slider label="Spreading F." value={config.sf} min={7} max={12} step={1} onChange={set('sf')} />
            <Slider label="Bandwidth" value={config.bwKHz} min={125} max={500} step={125} unit=" kHz" onChange={set('bwKHz')} />
            <Slider label="Payload" value={config.payloadBytes} min={5} max={50} step={1} unit=" B" onChange={set('payloadBytes')} />
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-2">Drone</div>
            <Slider label="Speed" value={config.droneSpeed} min={5} max={30} step={1} unit=" m/s" onChange={set('droneSpeed')} />
            <Slider label="Altitude D1" value={config.alt1} min={10} max={150} step={5} unit=" m" onChange={set('alt1')} />
            <Slider label="Altitude D2" value={config.alt2} min={10} max={150} step={5} unit=" m" onChange={set('alt2')} />
          </div>
        </div>
      )}
    </div>
  )
}
