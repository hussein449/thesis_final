import { useState } from 'react'
import { DEFAULT_PARAMS } from '../lib/detection-sim'

function NumberField({ label, value, onChange, hint, min, max, step = 1, disabled = false, disabledHint }) {
  return (
    <label className={`flex flex-col gap-1.5 ${disabled ? 'opacity-50' : ''}`}>
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
        disabled={disabled}
        title={disabled && disabledHint ? disabledHint : undefined}
        className="bg-slate-700/50 ring-1 ring-slate-800 rounded-lg px-2.5 py-1.5 text-[12px] font-mono text-slate-100 focus:outline-none focus:ring-blue-700/60 transition disabled:cursor-not-allowed"
      />
      {(disabled && disabledHint) ? (
        <span className="text-[9px] text-amber-700 italic">{disabledHint}</span>
      ) : hint ? (
        <span className="text-[9px] text-slate-500">{hint}</span>
      ) : null}
    </label>
  )
}

function SelectField({ label, value, onChange, options, hint }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[9px] text-slate-500 uppercase tracking-[0.14em] font-semibold">
        {label}
      </span>
      <select
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? null : Number(v))
        }}
        className="bg-slate-700/50 ring-1 ring-slate-800 rounded-lg px-2 py-1.5 text-[12px] font-mono text-slate-100 focus:outline-none focus:ring-blue-700/60 transition cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value == null ? 'auto' : String(o.value)} value={o.value == null ? '' : String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <span className="text-[9px] text-slate-500">{hint}</span>
      )}
    </label>
  )
}

const TIME_SLOT_OPTIONS = [
  { value: null, label: 'Auto — normal day' },
  { value: 1, label: '1 · Night 00–06' },
  { value: 2, label: '2 · Morning rush 06–10' },
  { value: 3, label: '3 · Normal day 10–16' },
  { value: 4, label: '4 · Evening rush 16–20' },
  { value: 5, label: '5 · Late evening 20–24' },
]

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
          label="Drone counts (M)"
          value={config.droneCountsText}
          onChange={(v) => setField('droneCountsText', v)}
          hint="comma-separated, e.g. 1, 2, 3, 5, …, 20"
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
          label="Sim duration (days)"
          value={+(params.totalTime / 86400).toFixed(2)}
          onChange={(v) => setParam('totalTime', Math.max(3600, v * 86400))}
          hint="per trial · real-rate (no multiplier)"
          step={0.5}
          min={0.04}
          max={365}
        />
        <SelectField
          label="Time-of-day mode"
          value={params.forceTimeSlot}
          onChange={(v) => setParam('forceTimeSlot', v)}
          options={TIME_SLOT_OPTIONS}
          hint="Auto = normal day (all 5 slots cycle); pick a slot to lock the entire trial to that risk profile"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <NumberField
          label="Trial start hour"
          value={params.simStartHour}
          onChange={(v) => setParam('simStartHour', Math.max(0, Math.min(23, v)))}
          hint="time-of-day clock starts here (0–23)"
          min={0}
          max={23}
          disabled={params.forceTimeSlot != null}
          disabledHint="Ignored — slot locked by Time-of-day mode"
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
        <div className="mt-4 pt-4 border-t border-slate-600/70 grid grid-cols-2 lg:grid-cols-3 gap-3">
          <NumberField
            label="IoT range R_IoT (m)"
            value={params.sensingRange}
            onChange={(v) => setParam('sensingRange', v)}
            hint="Sim default 200 m (well below Ra-02 physical max so R_IoT binds)"
            min={20}
            max={15000}
            step={50}
          />
          <NumberField
            label="Drone speed v (m/s)"
            value={params.droneSpeed}
            onChange={(v) => setParam('droneSpeed', v)}
            min={1}
            max={40}
          />
          <NumberField
            label="Battery drain (%/s)"
            value={params.batteryDrainRate}
            onChange={(v) => setParam('batteryDrainRate', v)}
            hint="only when battery model is on"
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
