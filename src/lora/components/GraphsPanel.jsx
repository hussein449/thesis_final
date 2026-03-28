import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, ReferenceLine
} from 'recharts'
import { calculateLinkBudget } from '../lib/lora'

const URBAN_COLOR = '#ef4444'
const RURAL_COLOR = '#10b981'
const GRID_COLOR = '#141c2e'
const AXIS_COLOR = '#4e6080'

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
      <div className="mb-3">
        <h3 className="text-[12px] font-bold text-[var(--color-white)]">{title}</h3>
        {subtitle && <p className="text-[9px] text-[var(--color-txt2)] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function CustomTooltip({ active, payload, label, suffix }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#0c101a] border border-[var(--color-border)] rounded-md px-3 py-2 text-[10px] font-[var(--font-mono)] shadow-lg">
      <div className="text-[var(--color-txt2)] mb-1">Distance: {label} m</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value} {suffix || ''}
        </div>
      ))}
    </div>
  )
}

export default function GraphsPanel({ config }) {
  const data = useMemo(() => {
    const distances = [
      50, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000, 2500,
      3000, 4000, 5000, 6000, 7000, 8000, 10000, 12000, 15000
    ]
    const base = {
      freqMHz: config.freqMHz, txPower: config.txPower,
      txGain: config.txGain, rxGain: config.rxGain,
      cableLoss: config.cableLoss, fadingMargin: config.fadingMargin,
      payloadBytes: config.payloadBytes, sf: config.sf,
      bwKHz: config.bwKHz, droneSpeed: config.droneSpeed,
    }
    return distances.map(d => {
      const urban = calculateLinkBudget({ ...base, dist3D: d, model: 'cost231', hBase: 40, hMobile: 40 })
      const rural = calculateLinkBudget({ ...base, dist3D: d, model: 'friis', hBase: 60, hMobile: 60 })
      return {
        dist: d,
        urbanPL: urban.pathLoss, ruralPL: rural.pathLoss,
        urbanRx: urban.rxPower, ruralRx: rural.rxPower,
        urbanMargin: urban.linkMargin, ruralMargin: rural.linkMargin,
        urbanDelay: urban.totalDelayMs, ruralDelay: rural.totalDelayMs,
        urbanArrival: urban.arrivalTimeSec, ruralArrival: rural.arrivalTimeSec,
        sensitivity: urban.sensitivity,
      }
    })
  }, [config])

  const maxRangeData = useMemo(() => {
    const base = {
      freqMHz: config.freqMHz, txPower: config.txPower,
      txGain: config.txGain, rxGain: config.rxGain,
      cableLoss: config.cableLoss, fadingMargin: config.fadingMargin,
      payloadBytes: config.payloadBytes, bwKHz: config.bwKHz,
      droneSpeed: config.droneSpeed,
    }
    return [7, 8, 9, 10, 11, 12].map(sf => {
      const u = calculateLinkBudget({ ...base, dist3D: 1000, model: 'cost231', hBase: 40, hMobile: 40, sf })
      const r = calculateLinkBudget({ ...base, dist3D: 1000, model: 'friis', hBase: 60, hMobile: 60, sf })
      return { sf: `SF${sf}`, urban: Math.min(u.maxRange, 20000), rural: Math.min(r.maxRange, 50000) }
    })
  }, [config])

  return (
    <div className="px-5 py-5 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
      <div className="flex items-center gap-3 mb-5">
        <div className="text-[14px] font-bold text-[var(--color-white)]">Comparative Analysis</div>
        <div className="text-[10px] text-[var(--color-txt2)]">Urban (Beirut, COST-231) vs Rural (Bekaa, Friis)</div>
        <div className="ml-auto flex gap-4 text-[10px]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] inline-block" style={{ background: URBAN_COLOR }} /> Urban</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-[2px] inline-block" style={{ background: RURAL_COLOR }} /> Rural</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Path Loss vs Distance */}
        <ChartCard title="1. Path Loss vs Distance" subtitle="Signal attenuation — urban buildings cause significantly more loss">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="dist" tick={{ fill: AXIS_COLOR, fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${v/1000}k` : v} />
              <YAxis tick={{ fill: AXIS_COLOR, fontSize: 9 }} label={{ value: 'dB', position: 'insideTopLeft', fill: AXIS_COLOR, fontSize: 9 }} />
              <Tooltip content={<CustomTooltip suffix="dB" />} />
              <Line type="monotone" dataKey="urbanPL" name="Urban (COST-231)" stroke={URBAN_COLOR} strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="ruralPL" name="Rural (Friis)" stroke={RURAL_COLOR} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Received Power vs Distance */}
        <ChartCard title="2. Received Power vs Distance" subtitle="Rx power at receiver — dashed line = sensitivity threshold">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="dist" tick={{ fill: AXIS_COLOR, fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${v/1000}k` : v} />
              <YAxis tick={{ fill: AXIS_COLOR, fontSize: 9 }} label={{ value: 'dBm', position: 'insideTopLeft', fill: AXIS_COLOR, fontSize: 9 }} />
              <Tooltip content={<CustomTooltip suffix="dBm" />} />
              <ReferenceLine y={-124} stroke="#ef444466" strokeDasharray="6 4" label={{ value: 'Sensitivity -124dBm', fill: '#ef4444', fontSize: 8, position: 'right' }} />
              <Line type="monotone" dataKey="urbanRx" name="Urban" stroke={URBAN_COLOR} strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="ruralRx" name="Rural" stroke={RURAL_COLOR} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Link Margin vs Distance */}
        <ChartCard title="3. Link Margin vs Distance" subtitle="Below 0 dB = communication link fails">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="dist" tick={{ fill: AXIS_COLOR, fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${v/1000}k` : v} />
              <YAxis tick={{ fill: AXIS_COLOR, fontSize: 9 }} label={{ value: 'dB', position: 'insideTopLeft', fill: AXIS_COLOR, fontSize: 9 }} />
              <Tooltip content={<CustomTooltip suffix="dB" />} />
              <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" label={{ value: 'LINK LOST', fill: '#ef4444', fontSize: 9, position: 'right' }} />
              <Area type="monotone" dataKey="urbanMargin" name="Urban" stroke={URBAN_COLOR} fill={URBAN_COLOR} fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="ruralMargin" name="Rural" stroke={RURAL_COLOR} fill={RURAL_COLOR} fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. Communication Delay vs Distance */}
        <ChartCard title="4. One-Way Communication Delay" subtitle="Propagation delay + LoRa packet airtime">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="dist" tick={{ fill: AXIS_COLOR, fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${v/1000}k` : v} />
              <YAxis tick={{ fill: AXIS_COLOR, fontSize: 9 }} label={{ value: 'ms', position: 'insideTopLeft', fill: AXIS_COLOR, fontSize: 9 }} />
              <Tooltip content={<CustomTooltip suffix="ms" />} />
              <Line type="monotone" dataKey="urbanDelay" name="Urban" stroke={URBAN_COLOR} strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="ruralDelay" name="Rural" stroke={RURAL_COLOR} strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 5. Drone Arrival Time vs Distance */}
        <ChartCard title="5. Drone Arrival Time vs Distance" subtitle={`Flight time at ${config.droneSpeed} m/s to incident location`}>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="dist" tick={{ fill: AXIS_COLOR, fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${v/1000}k` : v} />
              <YAxis tick={{ fill: AXIS_COLOR, fontSize: 9 }} tickFormatter={v => v >= 60 ? `${(v/60).toFixed(0)}m` : `${v.toFixed(0)}s`} />
              <Tooltip content={<CustomTooltip suffix="sec" />} />
              <Area type="monotone" dataKey="urbanArrival" name="Urban" stroke={URBAN_COLOR} fill={URBAN_COLOR} fillOpacity={0.08} strokeWidth={2} />
              <Area type="monotone" dataKey="ruralArrival" name="Rural" stroke={RURAL_COLOR} fill={RURAL_COLOR} fillOpacity={0.08} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 6. Max Range by Spreading Factor */}
        <ChartCard title="6. Max Range by Spreading Factor" subtitle="Higher SF = longer range, slower data rate — urban vs rural gap">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={maxRangeData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="sf" tick={{ fill: AXIS_COLOR, fontSize: 9 }} />
              <YAxis tick={{ fill: AXIS_COLOR, fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}km` : `${v}m`} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div className="bg-[#0c101a] border border-[var(--color-border)] rounded-md px-3 py-2 text-[10px] font-[var(--font-mono)] shadow-lg">
                    <div className="text-[var(--color-txt2)] mb-1">{label}</div>
                    {payload.map((p, i) => (
                      <div key={i} style={{ color: p.color }} className="font-semibold">
                        {p.name}: {p.value >= 1000 ? `${(p.value/1000).toFixed(1)} km` : `${p.value.toFixed(0)} m`}
                      </div>
                    ))}
                  </div>
                )
              }} />
              <Bar dataKey="urban" name="Urban" fill={URBAN_COLOR} fillOpacity={0.7} radius={[3,3,0,0]} />
              <Bar dataKey="rural" name="Rural" fill={RURAL_COLOR} fillOpacity={0.7} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
