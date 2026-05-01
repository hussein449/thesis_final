import { useState } from 'react'
import { DEFAULT_PARAMS } from '../lib/detection-sim'

function NumberField({ label, value, onChange, hint, min, max, step = 1 }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] text-[var(--color-txt3)] uppercase tracking-wider font-semibold">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="bg-[#0a0e1a] border border-[var(--color-border2)] rounded px-2 py-1 text-[11px] font-mono text-[var(--color-txt)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      {hint && (
        <span className="text-[9px] text-[var(--color-txt3)]">{hint}</span>
      )}
    </label>
  )
}

function TextField({ label, value, onChange, hint }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] text-[var(--color-txt3)] uppercase tracking-wider font-semibold">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#0a0e1a] border border-[var(--color-border2)] rounded px-2 py-1 text-[11px] font-mono text-[var(--color-txt)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      {hint && (
        <span className="text-[9px] text-[var(--color-txt3)]">{hint}</span>
      )}
    </label>
  )
}

function CheckboxField({ label, value, onChange, hint }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span className="flex flex-col">
        <span className="text-[10px] text-[var(--color-txt)] font-semibold">{label}</span>
        {hint && (
          <span className="text-[9px] text-[var(--color-txt3)]">{hint}</span>
        )}
      </span>
    </label>
  )
}

export default function SweepConfig({
  config,
  onChange,
  onRun,
  onCancel,
  isRunning,
  progress,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const setField = (key, val) => onChange({ ...config, [key]: val })
  const setParam = (key, val) =>
    onChange({ ...config, params: { ...config.params, [key]: val } })

  const params = { ...DEFAULT_PARAMS, ...config.params }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[#0d1225] p-4">
      <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-3">
        Sweep configuration
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TextField
          label="Drone counts"
          value={config.droneCountsText}
          onChange={(v) => setField('droneCountsText', v)}
          hint="comma-separated"
        />
        <NumberField
          label="Trials per point"
          value={config.trialsPerPoint}
          onChange={(v) => setField('trialsPerPoint', v)}
          hint="more trials = smoother curves"
          min={1}
          max={200}
        />
        <NumberField
          label="Sim time (min)"
          value={Math.round(params.totalTime / 60)}
          onChange={(v) => setParam('totalTime', Math.max(60, v * 60))}
          hint="per trial"
          min={1}
          max={120}
        />
        <NumberField
          label="Accident multiplier"
          value={params.accidentRateMultiplier}
          onChange={(v) => setParam('accidentRateMultiplier', v)}
          hint="× real-world rate"
          min={1}
          max={500}
        />
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--color-border)]/60 flex flex-wrap items-center gap-3">
        <CheckboxField
          label="Enable battery + docking model"
          value={params.enableOperational}
          onChange={(v) => setParam('enableOperational', v)}
          hint="Step 3 — adds availability tracking"
        />
        <button
          onClick={() => setShowAdvanced((s) => !s)}
          className="ml-auto text-[10px] text-[var(--color-txt2)] hover:text-[var(--color-accent)] underline cursor-pointer"
        >
          {showAdvanced ? 'Hide' : 'Show'} operational rules
        </button>
      </div>

      {showAdvanced && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)]/60 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <NumberField
            label="Sensing range (m)"
            value={params.sensingRange}
            onChange={(v) => setParam('sensingRange', v)}
            min={20}
            max={1000}
          />
          <NumberField
            label="Drone speed (m/s)"
            value={params.droneSpeed}
            onChange={(v) => setParam('droneSpeed', v)}
            min={1}
            max={40}
          />
          <NumberField
            label="Battery drain (%/s)"
            value={params.batteryDrainRate}
            onChange={(v) => setParam('batteryDrainRate', v)}
            step={0.001}
            min={0}
            max={1}
          />
          <NumberField
            label="Low-battery threshold (%)"
            value={params.lowBatteryThreshold}
            onChange={(v) => setParam('lowBatteryThreshold', v)}
            min={0}
            max={100}
          />
          <NumberField
            label="Ready threshold (%)"
            value={params.readyThreshold}
            onChange={(v) => setParam('readyThreshold', v)}
            min={0}
            max={100}
          />
          <NumberField
            label="Dock transit (s)"
            value={params.dockTransitTime}
            onChange={(v) => setParam('dockTransitTime', v)}
            min={0}
            max={600}
          />
          <NumberField
            label="Reserve count"
            value={params.reserveCount}
            onChange={(v) => setParam('reserveCount', v)}
            hint="hot spares for replacement"
            min={0}
            max={10}
          />
          <NumberField
            label="Reserve dispatch (s)"
            value={params.reserveDispatchDelay}
            onChange={(v) => setParam('reserveDispatchDelay', v)}
            min={0}
            max={300}
          />
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-[var(--color-border)]/60 flex items-center gap-3">
        {!isRunning ? (
          <button
            onClick={onRun}
            className="px-4 py-1.5 text-[11px] font-bold rounded-md bg-[var(--color-accent)] text-white hover:brightness-110 transition cursor-pointer"
          >
            ▶ Run sweep
          </button>
        ) : (
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-[11px] font-bold rounded-md bg-[var(--color-danger)] text-white hover:brightness-110 transition cursor-pointer"
          >
            ■ Stop
          </button>
        )}
        {progress && (
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent)] transition-all"
                style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-[var(--color-txt2)] font-mono w-20 text-right">
              {progress.done}/{progress.total}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
