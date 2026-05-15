import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { DEFAULT_PARAMS } from '../lib/detection-sim'

// ── Dispatch strategy definitions ────────────────────────────────────────────
// Keys must match the rule names used by simulateWithDispatch and the
// columns produced by runDispatchSweep in monteCarlo.js.
const DISPATCH_STRATEGIES = [
  {
    key: 'nearest',
    label: 'Nearest drone',
    color: '#1D4ED8',
    description: 'Dispatch the patrolling drone closest to the accident location.',
  },
  {
    key: 'batteryFirst',
    label: 'Battery-aware',
    color: '#B45309',
    description: 'Dispatch the drone with the highest remaining battery — maximises range margin.',
  },
  {
    key: 'balanced',
    label: 'Balanced load',
    color: '#6D28D9',
    description: 'Dispatch the drone with the fewest prior dispatches — distributes wear evenly.',
  },
]

const grid = '#1e293b'
const textColor = '#64748b'

function CustomTooltip({ active, payload, label, xLabel = 'N', xUnit = ' drones' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-[var(--color-txt2)] mb-1">{xLabel} = {label}{xUnit}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[var(--color-txt2)]">{p.name}:</span>
          <span className="font-bold font-mono" style={{ color: p.color }}>
            {p.value != null ? p.value : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Pure renderer. Receives `data` precomputed by runDispatchSweep() in
 * monteCarlo.js — runs only when the user clicks "Run sweep" on the
 * Configure page. No auto-compute on tab switch.
 *
 * Props:
 *   data:    [{ N, nearest_avg, nearest_missedPct, ... }, ...] | null
 *   params:  the sim params used for the sweep (for display only)
 *   running: true while the main "Run sweep" is in progress
 */
export default function DispatchComparison({ data, params, running }) {
  const safeParams = params ?? {}
  const totalTimeSec = safeParams.totalTime ?? DEFAULT_PARAMS.totalTime
  const simDays = totalTimeSec / 86400
  const durLabel = simDays >= 1
    ? `${simDays.toFixed(simDays >= 10 ? 0 : 1)} simulated day${simDays === 1 ? '' : 's'}`
    : `${(totalTimeSec / 3600).toFixed(1)} h`
  const droneSpeed = safeParams.droneSpeed ?? DEFAULT_PARAMS.droneSpeed
  const fleetSizes = data ? data.map((r) => r.N) : []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">
          Dispatch strategy comparison — active-response model
        </div>
        <div className="text-[11px] text-[var(--color-txt3)] leading-relaxed max-w-3xl">
          When an accident occurs, a drone on the same road is actively selected and diverted.
          Detection time equals travel time at patrol speed ({droneSpeed} m/s).
          Allocation: Risk-aware (Hamilton method).{' '}
          {data
            ? <>Sweep ran on fleet sizes ({fleetSizes.join(', ')}), {durLabel} per trial.</>
            : <>Click <strong className="text-slate-300">Run sweep</strong> on the Configure page to compute the comparison.</>}
        </div>
        {/* Strategy cards */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DISPATCH_STRATEGIES.map((ds) => (
            <div
              key={ds.key}
              className="rounded-lg border px-3 py-2.5"
              style={{ borderColor: ds.color + '40', background: ds.color + '0d' }}
            >
              <div className="text-[10px] font-bold mb-0.5" style={{ color: ds.color }}>
                {ds.label}
              </div>
              <div className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
                {ds.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {data == null && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-8 text-center">
          {running ? (
            <div className="inline-flex items-center gap-2 text-[11px] text-[var(--color-txt2)]">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-500/30 animate-pulse" />
              Sweep in progress — dispatch comparison will appear when the run finishes.
            </div>
          ) : (
            <div className="text-[11px] text-[var(--color-txt2)]">
              No dispatch data yet. Go to <strong className="text-slate-200">Configure</strong> and click <strong className="text-slate-200">Run sweep</strong> — the dispatch comparison computes alongside the main Monte Carlo run.
            </div>
          )}
        </div>
      )}

      {data != null && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Mean detection time vs N */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">
            Mean detection time vs fleet size
          </div>
          <div className="text-[9.5px] text-[var(--color-txt3)] mb-3">
            Lower is better. Averaged over detected accidents only.
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="N" stroke={textColor} tick={{ fontSize: 10 }}
                label={{ value: 'Fleet size N', position: 'insideBottom', offset: -10, fill: textColor, fontSize: 10 }} />
              <YAxis stroke={textColor} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}s`}
                label={{ value: 'Mean detect. time (s)', angle: -90, position: 'insideLeft', fill: textColor, fontSize: 10 }} />
              <Tooltip content={<CustomTooltip xUnit=" drones" />} />
              <Legend verticalAlign="top" align="right" iconSize={9} wrapperStyle={{ fontSize: 10, color: textColor, paddingBottom: 6 }} />
              <ReferenceLine y={120} stroke="#B45309" strokeDasharray="4 3" strokeWidth={1}
                label={{ value: '2 min', position: 'insideTopRight', fill: '#B45309', fontSize: 9 }} />
              {DISPATCH_STRATEGIES.map((ds) => (
                <Line key={ds.key} type="monotone" dataKey={`${ds.key}_avg`}
                  name={ds.label} stroke={ds.color} strokeWidth={2}
                  dot={{ r: 3, fill: ds.color }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Missed % vs N */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">
            Missed accidents (%) vs fleet size
          </div>
          <div className="text-[9.5px] text-[var(--color-txt3)] mb-3">
            Accidents with no patrolling drone available at time of occurrence.
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="N" stroke={textColor} tick={{ fontSize: 10 }}
                label={{ value: 'Fleet size N', position: 'insideBottom', offset: -10, fill: textColor, fontSize: 10 }} />
              <YAxis stroke={textColor} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`}
                label={{ value: '% missed', angle: -90, position: 'insideLeft', fill: textColor, fontSize: 10 }} />
              <Tooltip content={<CustomTooltip xUnit=" drones" />} />
              <Legend verticalAlign="top" align="right" iconSize={9} wrapperStyle={{ fontSize: 10, color: textColor, paddingBottom: 6 }} />
              {DISPATCH_STRATEGIES.map((ds) => (
                <Bar key={ds.key} dataKey={`${ds.key}_missedPct`}
                  name={ds.label} fill={ds.color} opacity={0.8} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Interpretation */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-3">
        <div className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
          <span className="text-[var(--color-txt2)] font-semibold">Key insight: </span>
          In the active-dispatch model, <span className="text-[#1D4ED8] font-semibold">Nearest</span> minimises
          travel time but may repeatedly task the same drone, draining its battery.{' '}
          <span className="text-[#6D28D9] font-semibold">Balanced load</span> distributes dispatches evenly,
          keeping more drones mission-ready.{' '}
          <span className="text-[#B45309] font-semibold">Battery-aware</span> avoids dispatching a nearly-depleted
          drone, reducing mid-response docking events. Missed-accident rate depends primarily on
          fleet coverage — all strategies converge as N grows and coverage gaps close.
        </div>
      </div>
    </div>
  )
}
