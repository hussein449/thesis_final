import { useEffect, useRef, useState } from 'react'
import { fetchHardwareEvents, SUPABASE_URL } from './supabase-config'

const POLL_MS = 3000
const ROW_LIMIT = 100

// Tint per source so the rows are scannable at a glance. New sources
// not in the map render slate-neutral.
const SOURCE_COLOR = {
  'Drone 1':    '#1D4ED8',  // blue-700  (matches Uniform policy colour)
  'Drone 2':    '#0E7490',  // cyan-700  (matches Sections / cyan accent)
  'Tilt Node':  '#B91C1C',  // red-700   (severity-red sensor)
  HQ:           '#7C3AED',  // violet-600 (matches Patrol overlay)
}

function formatTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour12: false,
      year: '2-digit', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    return iso
  }
}

function ago(iso) {
  if (!iso) return '—'
  const dt = (Date.now() - new Date(iso).getTime()) / 1000
  if (dt < 0) return 'just now'
  if (dt < 60) return `${Math.floor(dt)}s ago`
  if (dt < 3600) return `${Math.floor(dt / 60)}m ago`
  if (dt < 86400) return `${Math.floor(dt / 3600)}h ago`
  return `${Math.floor(dt / 86400)}d ago`
}

export default function HardwareEventsPage() {
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('idle')   // 'idle' | 'loading' | 'ok' | 'error'
  const [error, setError] = useState(null)
  const [paused, setPaused] = useState(false)
  const [lastFetched, setLastFetched] = useState(null)
  // Force a re-render every second so the "X seconds ago" column stays
  // accurate between polls.
  const [, tick] = useState(0)
  const inFlightRef = useRef(false)

  async function refresh() {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setStatus((s) => (s === 'ok' ? 'ok' : 'loading'))
    try {
      const rows = await fetchHardwareEvents({ limit: ROW_LIMIT })
      setEvents(rows)
      setStatus('ok')
      setError(null)
      setLastFetched(new Date())
    } catch (e) {
      setStatus('error')
      setError(e.message || String(e))
    } finally {
      inFlightRef.current = false
    }
  }

  // Initial fetch + polling loop. Restarts whenever `paused` flips.
  useEffect(() => {
    refresh()
    if (paused) return
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])

  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // KPI math
  const now = Date.now()
  const lastHour = events.filter(
    (e) => now - new Date(e.timestamp).getTime() < 3600 * 1000
  ).length
  const last24h = events.filter(
    (e) => now - new Date(e.timestamp).getTime() < 86400 * 1000
  ).length
  const distinctSources = [...new Set(events.map((e) => e.source))]
  const latest = events[0]

  const statusColor =
    status === 'ok' ? '#10b981'
    : status === 'loading' ? '#3b82f6'
    : status === 'error' ? '#ef4444'
    : '#64748b'

  const statusLabel =
    status === 'ok' ? (paused ? 'paused' : `polling every ${POLL_MS / 1000}s`)
    : status === 'loading' ? 'fetching…'
    : status === 'error' ? 'error'
    : 'idle'

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] text-[var(--color-txt2)] uppercase tracking-widest font-semibold mb-1">
              Hardware Link — live events
            </div>
            <div className="text-[11px] text-[var(--color-txt3)] leading-relaxed max-w-3xl">
              Events posted by the ESP32 Home Base to Supabase as soon as a Tilt
              Node, Drone 1, or Drone 2 sensor fires. Polls{' '}
              <span className="font-mono text-slate-300">
                {SUPABASE_URL.replace(/^https?:\/\//, '')}/rest/v1/hardware_events
              </span>{' '}
              every {POLL_MS / 1000} seconds.
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="flex items-center gap-1.5 text-[10.5px] text-slate-300 ring-1 ring-slate-600/70 px-2.5 py-1 rounded-md">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: statusColor }}
              />
              {statusLabel}
            </span>
            <button
              onClick={() => setPaused((p) => !p)}
              className="px-3 py-1.5 text-[10.5px] font-semibold rounded-md ring-1 ring-slate-600/70 text-slate-300 hover:text-slate-100 hover:bg-slate-700/50 cursor-pointer transition-colors"
            >
              {paused ? '▶ Resume' : '❚❚ Pause'}
            </button>
            <button
              onClick={refresh}
              className="px-3 py-1.5 text-[10.5px] font-semibold rounded-md ring-1 ring-slate-600/70 text-slate-300 hover:text-slate-100 hover:bg-slate-700/50 cursor-pointer transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 rounded-md ring-1 ring-rose-700/40 bg-rose-500/[0.08] text-[10.5px] text-rose-200">
            Could not reach Supabase: <span className="font-mono">{error}</span>
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Last hour"    value={lastHour}      tint="rgba(245, 158, 11, 0.10)" dot="#B45309" />
        <KpiCard label="Last 24h"     value={last24h}       tint="rgba(96, 165, 250, 0.10)" dot="#1D4ED8" />
        <KpiCard label="Total cached" value={events.length} hint={`max ${ROW_LIMIT} rows`} tint="rgba(148, 163, 184, 0.10)" dot="#94a3b8" />
        <KpiCard
          label="Latest"
          value={latest ? ago(latest.timestamp) : '—'}
          hint={latest ? `from ${latest.source}` : 'no events yet'}
          tint="rgba(52, 211, 153, 0.10)"
          dot="#047857"
        />
      </div>

      {/* Distinct sources chip strip */}
      {distinctSources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[9.5px] text-slate-500 uppercase tracking-[0.14em] font-semibold">
            Active sources
          </span>
          {distinctSources.map((src) => {
            const color = SOURCE_COLOR[src] ?? '#94a3b8'
            const count = events.filter((e) => e.source === src).length
            return (
              <span
                key={src}
                className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full ring-1"
                style={{
                  color,
                  background: color + '15',
                  borderColor: color + '40',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {src}
                <span className="text-slate-400">· {count}</span>
              </span>
            )
          })}
        </div>
      )}

      {/* Events table card */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-600/70 flex items-center gap-2.5 flex-wrap">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-800" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
            Event log
          </span>
          <span className="text-slate-600 text-[10px]">/</span>
          <span className="text-[10.5px] font-mono text-slate-400">
            {events.length} rows
          </span>
          {lastFetched && (
            <span className="ml-auto text-[9.5px] text-slate-500">
              Last fetched {lastFetched.toLocaleTimeString(undefined, { hour12: false })}
            </span>
          )}
        </div>

        <div className="max-h-[560px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="px-5 py-12 text-center text-[11px] text-slate-500">
              {status === 'error'
                ? 'No events to show — check the connection above.'
                : 'No events yet. Trigger a sensor on any node to populate the log.'}
            </div>
          ) : (
            <table className="w-full text-[10.5px] font-mono">
              <thead className="sticky top-0 bg-[var(--color-card)] z-10">
                <tr className="text-[9px] uppercase tracking-[0.12em] text-slate-500 border-b border-slate-600/70">
                  <th className="text-left py-2 px-4 font-semibold">Timestamp</th>
                  <th className="text-left py-2 px-4 font-semibold">Ago</th>
                  <th className="text-left py-2 px-4 font-semibold">Source</th>
                  <th className="text-left py-2 px-4 font-semibold">Event</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const color = SOURCE_COLOR[e.source] ?? '#94a3b8'
                  return (
                    <tr key={e.id} className="border-b border-slate-600/40 hover:bg-slate-700/40">
                      <td className="py-1.5 px-4 text-slate-300 tabular-nums whitespace-nowrap">
                        {formatTime(e.timestamp)}
                      </td>
                      <td className="py-1.5 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                        {ago(e.timestamp)}
                      </td>
                      <td className="py-1.5 px-4">
                        <span className="inline-flex items-center gap-1.5" style={{ color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                          {e.source}
                        </span>
                      </td>
                      <td className="py-1.5 px-4 text-slate-200">{e.event}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, hint, tint, dot }) {
  return (
    <div
      className="rounded-lg ring-1 ring-slate-600/70 px-3 py-2.5"
      style={{ background: tint }}
    >
      <div className="flex items-center gap-1.5 text-[8.5px] uppercase tracking-[0.14em] font-semibold text-slate-400">
        <span className="w-1 h-1 rounded-full" style={{ background: dot }} />
        {label}
      </div>
      <div className="font-mono font-semibold text-[18px] leading-snug tabular-nums text-slate-100 mt-0.5">
        {value}
      </div>
      {hint && <div className="text-[8.5px] text-slate-500 leading-none">{hint}</div>}
    </div>
  )
}
