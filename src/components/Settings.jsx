import { useState } from 'react'

function Slider({ label, value, min, max, step, unit, onChange }) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <label className="min-w-[82px] text-[10px] text-[var(--color-txt2)] shrink-0">{label}</label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[var(--color-accent)]" />
      <span className="min-w-[52px] text-right text-[10px] text-[var(--color-cyan)] font-semibold font-[var(--font-mono)]">
        {value}{unit || ''}
      </span>
    </div>
  )
}

export default function Settings({ config, onChange }) {
  const [open, setOpen] = useState(true)
  const set = (key) => (val) => onChange(key, val)

  return (
    <div className="bg-[var(--color-bg2)] border-b border-[var(--color-border)]">
      <button onClick={() => setOpen(!open)}
        className="w-full text-left px-5 py-2.5 text-[10px] font-bold text-[var(--color-txt2)] uppercase tracking-widest border-b border-[var(--color-border)] bg-transparent hover:bg-[#111827] cursor-pointer transition-colors">
        {open ? '▾' : '▸'} Simulation Parameters
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 p-4">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-2">Scenario</div>
            <Slider label="Drones" value={config.droneCount} min={3} max={8} step={1} onChange={set('droneCount')} />
            <Slider label="Drone speed" value={config.droneSpeed} min={2} max={20} step={1} unit=" m/s" onChange={set('droneSpeed')} />
            <Slider label="Wave speed" value={config.waveSpeed} min={1} max={5} step={1} unit="x" onChange={set('waveSpeed')} />
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-2">Radio</div>
            <Slider label="Frequency" value={config.freq} min={400} max={5800} step={50} unit=" MHz" onChange={set('freq')} />
            <Slider label="Tx power" value={config.txPwr} min={-10} max={33} step={1} unit=" dBm" onChange={set('txPwr')} />
            <Slider label="Bat drain/s" value={config.batDrain} min={0.1} max={2} step={0.1} unit="%" onChange={set('batDrain')} />
          </div>
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-3">
            <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-2">Thresholds</div>
            <Slider label="Min battery %" value={config.minBat} min={10} max={50} step={5} unit="%" onChange={set('minBat')} />
            <Slider label="Low bat swap" value={config.lowBat} min={15} max={40} step={5} unit="%" onChange={set('lowBat')} />
            <Slider label="Reserve drones" value={config.reserveCount} min={1} max={4} step={1} onChange={set('reserveCount')} />
          </div>
        </div>
      )}
    </div>
  )
}
