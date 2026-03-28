import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts'

const COLORS = ['#00e5ff', '#a78bfa', '#34d399', '#f97316', '#f472b6', '#facc15', '#60a5fa', '#e879f9']

const chartTheme = {
  bg: '#0a0e1a',
  grid: '#1e293b',
  text: '#64748b',
  tooltip: '#111827',
}

function ChartCard({ title, children, className = '' }) {
  return (
    <div className={`rounded-xl border border-[var(--color-border)] bg-[#0d1225] p-4 ${className}`}>
      <div className="text-[9px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-3">{title}</div>
      {children}
    </div>
  )
}

function CustomTooltip({ active, payload, label, unit = 'ms' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#111827] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[10px] text-[var(--color-txt2)] mb-1">{label}{unit === 'ms' ? ' ms' : ''}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[var(--color-txt2)]">{p.name}:</span>
          <span className="font-bold font-mono" style={{ color: p.color }}>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function ResultsPage({ state, history, onBack }) {
  const { drones = [], severity, simMs, primaryIdx, backupIdx, simState } = state
  const { batterySnapshots, responseEvents, messageCounts, trajectories } = history

  const phase = simState === 'broadcasting' ? 'SOS BROADCAST'
    : simState === 'evaluating' ? 'EVALUATE'
    : simState === 'flying' ? 'DEPLOYING'
    : simState === 'arrived' ? 'COMPLETE'
    : 'IDLE'

  const primary = primaryIdx >= 0 ? drones[primaryIdx] : null
  const backup = backupIdx >= 0 ? drones[backupIdx] : null

  // Get drone IDs for battery chart lines
  const droneIds = drones.map(d => d.id)

  // Format battery data for chart
  const batteryData = batterySnapshots.map(snap => ({
    t: (snap.t / 1000).toFixed(1),
    ...Object.fromEntries(droneIds.map(id => [`D${id}`, snap[`d${id}`]]))
  }))

  // Response time bar chart
  const responseData = responseEvents.map(e => ({
    name: `#${e.id}`,
    responseMs: e.responseMs,
    drone: `D${e.droneId}`,
  }))

  // Message counts area chart
  const msgData = messageCounts.map(m => ({
    t: (m.t / 1000).toFixed(1),
    SOS: m.sos,
    ACK: m.ack,
    Propose: m.propose,
    Deploy: m.deploy,
  }))

  // Trajectory scatter data per drone
  const trajectoryByDrone = droneIds.map(id => {
    const points = trajectories.map(snap => {
      const d = snap.drones.find(dr => dr.id === id)
      return d ? { x: Math.round(d.x), y: Math.round(d.y), t: snap.t } : null
    }).filter(Boolean)
    return { id, points }
  })

  const noData = batterySnapshots.length === 0

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-white)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-gradient-to-b from-[#0a0e1a] to-[var(--color-bg)]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest border border-[var(--color-border)] text-[var(--color-txt2)] hover:text-[var(--color-white)] hover:border-[var(--color-cyan)] transition-colors"
          >
            ← Back
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-cyan)] text-sm">⬡</span>
            <h1 className="text-[16px] font-extrabold tracking-tight">Simulation Results</h1>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-[var(--color-txt2)] font-mono">
          <span>{phase}</span>
          <span>{Math.floor(simMs)} ms</span>
          <span>{responseEvents.length} events recorded</span>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Summary cards */}
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'Phase', value: phase },
            { label: 'Elapsed', value: `${(simMs / 1000).toFixed(1)}s` },
            { label: 'Severity', value: severity === 0 ? 'MODERATE' : 'HIGH' },
            { label: 'Events', value: responseEvents.length },
            { label: 'Avg Response', value: responseEvents.length > 0 ? `${(responseEvents.reduce((a, e) => a + e.responseMs, 0) / responseEvents.length).toFixed(0)} ms` : '—' },
          ].map(c => (
            <div key={c.label} className="rounded-xl bg-[#0d1225] border border-[var(--color-border)] p-4">
              <div className="text-[9px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">{c.label}</div>
              <div className="text-[18px] font-extrabold text-[var(--color-cyan)] font-mono">{c.value}</div>
            </div>
          ))}
        </div>

        {noData && (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center">
            <div className="text-[14px] text-[var(--color-txt2)]">No data collected yet. Trigger some accidents and come back!</div>
          </div>
        )}

        {!noData && (
          <>
            {/* Row 1: Battery + Response Time */}
            <div className="grid grid-cols-2 gap-4">
              <ChartCard title="Battery Levels Over Time">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={batteryData}>
                    <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="t" stroke={chartTheme.text} tick={{ fontSize: 10 }} label={{ value: 'Time (s)', position: 'insideBottom', offset: -2, style: { fontSize: 10, fill: chartTheme.text } }} />
                    <YAxis stroke={chartTheme.text} tick={{ fontSize: 10 }} domain={[0, 100]} label={{ value: 'Battery %', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: chartTheme.text } }} />
                    <Tooltip content={<CustomTooltip unit="s" />} />
                    {droneIds.map((id, i) => (
                      <Line key={id} type="monotone" dataKey={`D${id}`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Response Time per Event">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={responseData}>
                    <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke={chartTheme.text} tick={{ fontSize: 10 }} />
                    <YAxis stroke={chartTheme.text} tick={{ fontSize: 10 }} label={{ value: 'ms', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: chartTheme.text } }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="responseMs" fill="#00e5ff" radius={[4, 4, 0, 0]} name="Response" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Row 2: Messages + Trajectories */}
            <div className="grid grid-cols-2 gap-4">
              <ChartCard title="Cumulative Message Exchange">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={msgData}>
                    <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="t" stroke={chartTheme.text} tick={{ fontSize: 10 }} label={{ value: 'Time (s)', position: 'insideBottom', offset: -2, style: { fontSize: 10, fill: chartTheme.text } }} />
                    <YAxis stroke={chartTheme.text} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip unit="s" />} />
                    <Line type="monotone" dataKey="SOS" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="ACK" stroke="#34d399" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Propose" stroke="#a78bfa" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Deploy" stroke="#f97316" strokeWidth={2} dot={false} />
                    <Legend wrapperStyle={{ fontSize: 10, color: chartTheme.text }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Drone Trajectories (X/Y)">
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart>
                    <CartesianGrid stroke={chartTheme.grid} strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="x" stroke={chartTheme.text} tick={{ fontSize: 10 }} name="X" />
                    <YAxis type="number" dataKey="y" stroke={chartTheme.text} tick={{ fontSize: 10 }} name="Y" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const p = payload[0]?.payload
                      return (
                        <div className="bg-[#111827] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl text-[11px]">
                          <div className="text-[var(--color-cyan)] font-mono">({p?.x}, {p?.y})</div>
                        </div>
                      )
                    }} />
                    {trajectoryByDrone.map((td, i) => (
                      <Scatter key={td.id} name={`D${td.id}`} data={td.points} fill={COLORS[i % COLORS.length]} r={2} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 10, color: chartTheme.text }} />
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </>
        )}

        {/* Fleet table */}
        <div className="rounded-xl border border-[var(--color-border)] p-4">
          <div className="text-[9px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-3">Fleet Overview</div>
          <div className="grid grid-cols-5 gap-3 text-[9px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold pb-2 border-b border-[var(--color-border)]">
            <span>ID</span><span>Battery</span><span>Distance</span><span>Position</span><span>Role</span>
          </div>
          {drones.map((d, i) => {
            const role = i === primaryIdx ? 'PRIMARY' : i === backupIdx ? 'BACKUP' : '—'
            const roleColor = i === primaryIdx ? 'text-[var(--color-mint)]' : i === backupIdx ? 'text-[var(--color-violet)]' : 'text-[var(--color-txt2)]'
            return (
              <div key={d.id} className="grid grid-cols-5 gap-3 text-[12px] font-mono py-1.5 border-b border-[var(--color-border)]/30">
                <span className="text-[var(--color-white)] font-bold">D{d.id}</span>
                <span className="text-[var(--color-cyan)]">{d.battery ?? '—'}%</span>
                <span className="text-[var(--color-cyan)]">{d.dist != null ? `${d.dist.toFixed(1)}m` : '—'}</span>
                <span className="text-[var(--color-cyan)]">({d.x?.toFixed(0)}, {d.y?.toFixed(0)})</span>
                <span className={`font-bold text-[11px] ${roleColor}`}>{role}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}