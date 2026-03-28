function Metric({ label, value, unit, color, small }) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-2.5">
      <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-widest font-bold mb-1">{label}</div>
      <div className={`font-bold font-[var(--font-mono)] ${small ? 'text-[13px]' : 'text-[16px]'} ${color || 'text-[var(--color-cyan)]'}`}>
        {value}
        {unit && <span className="text-[9px] text-[var(--color-txt2)] ml-1 font-normal">{unit}</span>}
      </div>
    </div>
  )
}

export default function MetricsPanel({ metrics, horizDist, config }) {
  const m = metrics

  const plColor = m.pathLoss > 120 ? 'text-[var(--color-danger)]' : m.pathLoss > 90 ? 'text-[var(--color-warn)]' : 'text-[var(--color-cyan)]'
  const rxColor = m.rxPower < -110 ? 'text-[var(--color-danger)]' : m.rxPower < -90 ? 'text-[var(--color-warn)]' : 'text-[var(--color-mint)]'
  const marginColor = m.linkMargin < 0 ? 'text-[var(--color-danger)]' : m.linkMargin < 10 ? 'text-[var(--color-warn)]' : 'text-[var(--color-mint)]'

  return (
    <div className="p-3 border-b border-[var(--color-border)] overflow-y-auto custom-scroll flex-1">
      <div className="text-[8px] font-bold text-[var(--color-txt2)] uppercase tracking-[0.12em] mb-2.5">Link Budget Analysis</div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Horizontal Distance" value={horizDist.toFixed(1)} unit="m" />
        <Metric label="3D Distance" value={m.distance.toFixed(1)} unit="m" />
        <Metric label="Path Loss" value={m.pathLoss.toFixed(1)} unit="dB" color={plColor} />
        <Metric label="Rx Power" value={m.rxPower.toFixed(1)} unit="dBm" color={rxColor} />
        <Metric label="Sensitivity" value={m.sensitivity} unit="dBm" small />
        <Metric label="Link Margin" value={m.linkMargin.toFixed(1)} unit="dB" color={marginColor} />
        <Metric label="Max Range" value={m.maxRange > 1000 ? (m.maxRange/1000).toFixed(1) : m.maxRange.toFixed(0)} unit={m.maxRange > 1000 ? 'km' : 'm'} />
        <Metric label="Propagation Delay" value={m.propDelayUs.toFixed(2)} unit="μs" small />
        <Metric label="Packet Airtime" value={m.airtimeMs.toFixed(2)} unit="ms" />
        <Metric label="Round-Trip Time" value={m.rttMs.toFixed(2)} unit="ms" />
        <Metric label="Total One-Way Delay" value={m.totalDelayMs.toFixed(2)} unit="ms" />
        <Metric label="Drone Arrival" value={m.arrivalTimeSec > 60 ? (m.arrivalTimeSec/60).toFixed(1) : m.arrivalTimeSec.toFixed(1)} unit={m.arrivalTimeSec > 60 ? 'min' : 'sec'} />
      </div>

      {/* LoRa Config Summary */}
      <div className="mt-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-md p-2.5">
        <div className="text-[7px] text-[var(--color-txt3)] uppercase tracking-widest font-bold mb-2">LoRa Configuration</div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[9px] font-[var(--font-mono)]">
          <div><span className="text-[var(--color-txt3)]">Freq:</span> <span className="text-[var(--color-cyan)]">{config.freqMHz} MHz</span></div>
          <div><span className="text-[var(--color-txt3)]">SF:</span> <span className="text-[var(--color-cyan)]">{config.sf}</span></div>
          <div><span className="text-[var(--color-txt3)]">BW:</span> <span className="text-[var(--color-cyan)]">{config.bwKHz} kHz</span></div>
          <div><span className="text-[var(--color-txt3)]">TxPwr:</span> <span className="text-[var(--color-cyan)]">{config.txPower} dBm</span></div>
          <div><span className="text-[var(--color-txt3)]">Payload:</span> <span className="text-[var(--color-cyan)]">{config.payloadBytes} B</span></div>
          <div><span className="text-[var(--color-txt3)]">Speed:</span> <span className="text-[var(--color-cyan)]">{config.droneSpeed} m/s</span></div>
        </div>
      </div>
    </div>
  )
}
