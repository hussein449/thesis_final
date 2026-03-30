import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { BEIRUT_CENTER, BEIRUT_ZOOM } from '../lib/roads'

// ────────────────────────────────────────────────────────────────────────────
// Drone SVG icon
// ────────────────────────────────────────────────────────────────────────────
function droneIcon(color, idx) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="36" viewBox="0 0 30 36">
    <circle cx="15" cy="13" r="11" fill="${color}1a" stroke="${color}" stroke-width="1.5"/>
    <line x1="9"  y1="9"  x2="5"  y2="5"  stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="21" y1="9"  x2="25" y2="5"  stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="9"  y1="17" x2="5"  y2="21" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="21" y1="17" x2="25" y2="21" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="5"  cy="5"  r="2.5" fill="${color}" opacity="0.8"/>
    <circle cx="25" cy="5"  r="2.5" fill="${color}" opacity="0.8"/>
    <circle cx="5"  cy="21" r="2.5" fill="${color}" opacity="0.8"/>
    <circle cx="25" cy="21" r="2.5" fill="${color}" opacity="0.8"/>
    <circle cx="15" cy="13" r="4" fill="${color}"/>
    <text x="15" y="32" text-anchor="middle" font-family="Outfit,sans-serif"
          font-size="8" font-weight="700" fill="${color}">${idx}</text>
  </svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [30, 36], iconAnchor: [15, 13] })
}

// ────────────────────────────────────────────────────────────────────────────
// Interpolate a point along a polyline at parameter t ∈ [0,1]
// ────────────────────────────────────────────────────────────────────────────
function interpolate(coords, t) {
  const n = coords.length
  if (n === 1) return coords[0]
  const clamped = Math.max(0, Math.min(1, t))
  const pos = clamped * (n - 1)
  const seg = Math.min(Math.floor(pos), n - 2)
  const frac = pos - seg
  const a = coords[seg]
  const b = coords[seg + 1]
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────
export default function PartitionMap({ allocations, selectedRoadId, onSelectRoad }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const polylinesRef = useRef({})
  const droneLayerRef = useRef([])

  // Init map once
  useEffect(() => {
    if (mapInstanceRef.current) return
    const map = L.map(mapRef.current, {
      center: BEIRUT_CENTER,
      zoom: BEIRUT_ZOOM,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    mapInstanceRef.current = map
    return () => { map.remove(); mapInstanceRef.current = null }
  }, []) // eslint-disable-line

  // Redraw polylines when allocations change
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !allocations?.length) return

    Object.values(polylinesRef.current).forEach(pl => pl.remove())
    polylinesRef.current = {}

    allocations.forEach(({ road, score, drones }) => {
      const isSelected = road.id === selectedRoadId

      const pl = L.polyline(road.polyline, {
        color: road.color,
        weight: isSelected ? 9 : 5,
        opacity: drones === 0 ? 0.35 : isSelected ? 1.0 : 0.80,
      }).addTo(map)

      pl.on('click', () => onSelectRoad(road.id))
      pl.bindTooltip(
        `<div style="font-family:Outfit,sans-serif;font-size:11px;
          color:#e8edf5;background:#0c101a;border:1px solid ${road.color}55;
          padding:5px 10px;border-radius:7px;white-space:nowrap">
          <strong style="color:${road.color}">${road.name}</strong><br/>
          <span style="color:#4e6080">Risk&nbsp;</span>
          <span style="color:#22d3ee;font-family:JetBrains Mono,monospace">${(score * 100).toFixed(1)}</span>
          <span style="color:#4e6080"> &nbsp;·&nbsp; Drones&nbsp;</span>
          <span style="color:#22d3ee;font-family:JetBrains Mono,monospace">${drones}</span>
        </div>`,
        { sticky: true, className: '' }
      )

      polylinesRef.current[road.id] = pl
    })
  }, [allocations]) // eslint-disable-line

  // Highlight selected polyline on click without full redraw
  useEffect(() => {
    if (!allocations) return
    allocations.forEach(({ road, drones }) => {
      const pl = polylinesRef.current[road.id]
      if (!pl) return
      const isSelected = road.id === selectedRoadId
      pl.setStyle({ weight: isSelected ? 9 : 5, opacity: drones === 0 ? 0.35 : isSelected ? 1.0 : 0.80 })
      if (isSelected) pl.bringToFront()
    })
  }, [selectedRoadId, allocations])

  // Place drone markers
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !allocations?.length) return

    droneLayerRef.current.forEach(m => m.remove())
    droneLayerRef.current = []

    allocations.forEach(({ road, drones }) => {
      if (drones === 0) return
      for (let i = 0; i < drones; i++) {
        const t = drones === 1 ? 0.5 : i / (drones - 1)
        const pos = interpolate(road.polyline, t)
        const m = L.marker(pos, {
          icon: droneIcon(road.color, i + 1),
          interactive: false,
        }).addTo(map)
        droneLayerRef.current.push(m)
      }
    })
  }, [allocations])

  return <div ref={mapRef} className="w-full h-full" />
}
