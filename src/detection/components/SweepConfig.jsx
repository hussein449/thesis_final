import { useState } from 'react'
import { DEFAULT_PARAMS } from '../lib/detection-sim'

function NumberField({ label, value, onChange, hint, min, max, step = 1 }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[9px] text-slate-500 uppercase tracking-[0.14em] font-semibold">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="bg-slate-700/50 ring-1 ring-slate-800 rounded-lg px-2.5 py-1.5 text-[12px] font-mono text-slate-100 focus:outline-none focus:ring-blue-700/60 transition"
      />
      {hint && (
        <span className="text-[9px] text-slate-500">{hint}</span>
      )}
    </label>
  )
}

function TextField({ label, value, onChange, hint }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[9px] text-slate-500 uppercase tracking-[0.14em] font-semibold">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-700/50 ring-1 ring-slate-800 rounded-lg px-2.5 py-1.5 text-[12px] font-mono text-slate-100 focus:outline-none focus:ring-blue-700/60 transition"
      />
      {hint && (
        <span className="text-[9px] text-slate-500">{hint}</span>
      )}
    </label>
  )
}

function CheckboxField({ label, value, onChange, hint }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none group">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-blue-500"
      />
      <span className="flex flex-col">
        <span className="text-[10.5px] text-slate-200 font-medium group-hover:text-slate-50 transition-colors">{label}</span>
        {hint && (
          <span className="text-[9px] text-slate-500">{hint}</span>
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
    <div className="rounded-2xl ring-1 ring-slate-600/80 bg-slate-700/40 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-600/70">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-800 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
            Sweep configuration
          </span>
          <span className="text-slate-700 text-[10px]">/</span>
          <span className="text-[9.5px] text-slate-500 uppercase tracking-[0.14em]">Step 1 of 4</span>
        </div>
        <button
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-[10.5px] font-medium text-slate-400 hover:text-slate-200 cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-700/50 transition-colors"
        >
          <span className="text-slate-500">{showAdvanced ? '▾' : '▸'}</span>
          {showAdvanced ? 'Hide' : 'Show'} operational rules
        </button>
      </div>

      <div className="p-5">

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

      <div className="mt-4 pt-4 border-t border-slate-600/70 flex flex-wrap items-center gap-3">
        <CheckboxField
          label="Enable battery + docking model"
          value={params.enableOperational}
          onChange={(v) => setParam('enableOperational', v)}
          hint="Step 3 — adds availability tracking"
        />
      </div>

      {showAdvanced && (
        <div className="mt-4 pt-4 border-t border-slate-600/70 grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      <div className="mt-5 pt-4 border-t border-slate-600/70 flex items-center gap-3">
        {!isRunning ? (
          <button
            onClick={onRun}
            className="px-5 py-2 text-[12px] font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-800 transition cursor-pointer ring-1 ring-blue-700/30 shadow-[0_4px_18px_-6px_rgba(59,130,246,0.5)]"
          >
            ▶ Run sweep
          </button>
        ) : (
          <button
            onClick={onCancel}
            className="px-5 py-2 text-[12px] font-semibold rounded-lg bg-rose-500 text-white hover:bg-rose-400 transition cursor-pointer ring-1 ring-rose-400/30"
          >
            ■ Stop
          </button>
        )}
        {progress && (
          <div className="flex-1 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-slate-700/50/80 overflow-hidden ring-1 ring-slate-800">
              <div
                className="h-full bg-blue-800 transition-all"
                style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
            <span className="text-[10.5px] text-slate-400 font-mono tabular-nums w-20 text-right">
              {progress.done}/{progress.total}
            </span>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
