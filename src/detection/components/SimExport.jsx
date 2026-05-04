import { useMemo, useState } from 'react'
import { simulateDetailedLog, DEFAULT_PARAMS } from '../lib/detection-sim'
import { POLICIES } from '../lib/policies'

const EXPORT_N = 10
const EXPORT_SEED = 42
// Higher rate + longer sim → guaranteed meaningful accident records for export
const EXPORT_PARAMS = { accidentRateMultiplier: 300, totalTime: 3600 }

function toCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => {
        const v = r[h] ?? ''
        return String(v).includes(',') ? `"${v}"` : v
      }).join(',')
    ),
  ]
  return lines.join('\r\n')
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const FIELD_DESCRIPTIONS = {
  // accident log
  accident_id: 'Sequential ID for each accident event in this trial',
  corridor: 'Road name where the accident occurred',
  time_occurred_s: 'Simulation time (seconds) when accident occurred',
  status: '"detected" if a drone entered sensing range within the window, else "missed"',
  detection_time_s: 'Seconds from accident occurrence to drone detection (blank if missed)',
  responding_uav: 'ID of the drone that detected the accident (blank if missed)',
  // drone log
  time_s: 'Simulation timestamp of this sample (seconds)',
  uav_id: 'Drone identifier — format <road_shortName>-<index>',
  battery_pct: 'Battery level at sample time (%)',
  state: '"patrolling" | "returning" (to dock) | "docked" (charging)',
  arc_length_m: 'Position along the road polyline (metres from start)',
}

export default function SimExport({ params }) {
  const [policyKey, setPolicyKey] = useState('riskAware')
  const [format, setFormat] = useState('csv')

  const { accidentLog, droneLog } = useMemo(() => {
    const allocation = POLICIES[policyKey].allocate(EXPORT_N)
    return simulateDetailedLog({
      allocation,
      params: { ...DEFAULT_PARAMS, ...EXPORT_PARAMS },
      seed: EXPORT_SEED,
      sampleInterval: 60,
    })
  }, [policyKey])

  function handleDownload(table, name) {
    const rows = table === 'accident' ? accidentLog : droneLog
    const filename = `drone-sim_${name}_N${EXPORT_N}_${policyKey}_seed${EXPORT_SEED}`
    if (format === 'csv') {
      downloadBlob(toCSV(rows), `${filename}.csv`, 'text/csv')
    } else {
      downloadBlob(JSON.stringify(rows, null, 2), `${filename}.json`, 'application/json')
    }
  }

  const detected = accidentLog.filter((r) => r.status === 'detected').length
  const missed = accidentLog.filter((r) => r.status === 'missed').length

  return (
    <div className="space-y-4">
      {/* Config bar */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[#0d1225] px-5 py-4">
        <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">
          Simulation log export
        </div>
        <div className="text-[11px] text-[var(--color-txt3)] leading-relaxed mb-4">
          One deterministic trial — N = {EXPORT_N}, seed = {EXPORT_SEED}, 60 min simulated at {EXPORT_PARAMS.accidentRateMultiplier}× accident rate.
          Download the accident event log and per-drone state log as CSV or JSON.
        </div>

        <div className="flex flex-wrap gap-6 items-end">
          {/* Policy */}
          <div>
            <div className="text-[9px] text-[var(--color-txt3)] uppercase tracking-wider mb-1.5">Allocation policy</div>
            <div className="flex gap-2">
              {Object.values(POLICIES).map((pol) => {
                const active = pol.key === policyKey
                return (
                  <button key={pol.key} onClick={() => setPolicyKey(pol.key)}
                    className="px-3 py-1 text-[10px] font-semibold rounded border transition-colors cursor-pointer"
                    style={active ? { background: pol.color + '20', borderColor: pol.color + '60', color: pol.color }
                      : { borderColor: 'var(--color-border2)', color: 'var(--color-txt2)' }}>
                    {pol.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Format */}
          <div>
            <div className="text-[9px] text-[var(--color-txt3)] uppercase tracking-wider mb-1.5">File format</div>
            <div className="flex gap-2">
              {['csv', 'json'].map((f) => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`px-3 py-1 text-[10px] font-semibold rounded border transition-colors cursor-pointer
                    ${f === format
                      ? 'bg-[var(--color-accent)]/20 border-[var(--color-accent)]/40 text-[var(--color-accent)]'
                      : 'border-[var(--color-border2)] text-[var(--color-txt2)]'}`}>
                  .{f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="ml-auto flex gap-4 text-[10px]">
            <div className="text-center">
              <div className="font-mono text-[18px] font-bold text-emerald-400">{detected}</div>
              <div className="text-[var(--color-txt3)]">detected</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[18px] font-bold text-red-400">{missed}</div>
              <div className="text-[var(--color-txt3)]">missed</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[18px] font-bold text-[var(--color-txt2)]">{droneLog.length}</div>
              <div className="text-[var(--color-txt3)]">drone samples</div>
            </div>
          </div>
        </div>
      </div>

      {/* Download cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Accident log */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[#0d1225] p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
                Accident event log
              </div>
              <div className="text-[9.5px] text-[var(--color-txt3)] mt-0.5">
                {accidentLog.length} rows — one per accident event
              </div>
            </div>
            <button onClick={() => handleDownload('accident', 'accident-log')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer shrink-0">
              ⬇ Download .{format.toUpperCase()}
            </button>
          </div>

          {/* Field glossary */}
          <div className="space-y-1.5">
            {Object.keys(accidentLog[0] ?? {}).map((field) => (
              <div key={field} className="flex gap-2 text-[9.5px]">
                <span className="font-mono text-[var(--color-accent)] shrink-0 w-36">{field}</span>
                <span className="text-[var(--color-txt3)]">{FIELD_DESCRIPTIONS[field] ?? ''}</span>
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border2)] bg-[#080d1a]">
            <table className="w-full text-[8.5px] font-mono">
              <thead>
                <tr className="border-b border-[var(--color-border2)]">
                  {Object.keys(accidentLog[0] ?? {}).map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left text-[var(--color-txt3)] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accidentLog.slice(0, 6).map((row, i) => (
                  <tr key={i} className="border-b border-[var(--color-border2)]/40">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className={`px-2 py-1 whitespace-nowrap
                        ${v === 'detected' ? 'text-emerald-400' : v === 'missed' ? 'text-red-400' : 'text-[var(--color-txt2)]'}`}>
                        {String(v === '' ? '—' : v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {accidentLog.length > 6 && (
              <div className="px-2 py-1 text-[8.5px] text-[var(--color-txt3)]">
                … {accidentLog.length - 6} more rows in the downloaded file
              </div>
            )}
          </div>
        </div>

        {/* Drone state log */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[#0d1225] p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold">
                Drone state log
              </div>
              <div className="text-[9.5px] text-[var(--color-txt3)] mt-0.5">
                {droneLog.length} rows — sampled every 60 s per drone
              </div>
            </div>
            <button onClick={() => handleDownload('drone', 'drone-log')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer shrink-0">
              ⬇ Download .{format.toUpperCase()}
            </button>
          </div>

          {/* Field glossary */}
          <div className="space-y-1.5">
            {Object.keys(droneLog[0] ?? {}).map((field) => (
              <div key={field} className="flex gap-2 text-[9.5px]">
                <span className="font-mono text-[var(--color-accent)] shrink-0 w-36">{field}</span>
                <span className="text-[var(--color-txt3)]">{FIELD_DESCRIPTIONS[field] ?? ''}</span>
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border2)] bg-[#080d1a]">
            <table className="w-full text-[8.5px] font-mono">
              <thead>
                <tr className="border-b border-[var(--color-border2)]">
                  {Object.keys(droneLog[0] ?? {}).map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left text-[var(--color-txt3)] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {droneLog.slice(0, 6).map((row, i) => (
                  <tr key={i} className="border-b border-[var(--color-border2)]/40">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className={`px-2 py-1 whitespace-nowrap
                        ${v === 'docked' ? 'text-amber-400' : v === 'returning' ? 'text-orange-400' : 'text-[var(--color-txt2)]'}`}>
                        {String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {droneLog.length > 6 && (
              <div className="px-2 py-1 text-[8.5px] text-[var(--color-txt3)]">
                … {droneLog.length - 6} more rows in the downloaded file
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[#0d1225] px-5 py-3">
        <div className="text-[9.5px] text-[var(--color-txt3)] leading-relaxed">
          <span className="text-[var(--color-txt2)] font-semibold">Export schema: </span>
          Both files share the same trial parameters (N = {EXPORT_N}, seed = {EXPORT_SEED}).
          CSV uses comma delimiters with a header row. JSON is a flat array of objects.
          The drone state log records battery and state every 60 sim-seconds per drone —
          useful for verifying the charging cycle model. The accident log records all Poisson-generated
          events including undetected ones, enabling independent analysis of miss rate vs detection window.
        </div>
      </div>
    </div>
  )
}
