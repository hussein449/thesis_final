import { useEffect, useRef } from 'react'
import L from 'leaflet'

// Custom drone icon SVG
function droneIcon(color, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    <circle cx="18" cy="18" r="16" fill="${color}22" stroke="${color}" stroke-width="2"/>
    <circle cx="18" cy="18" r="5" fill="${color}"/>
    <text x="18" y="38" text-anchor="middle" font-family="Outfit,sans-serif" font-size="10" font-weight="700" fill="${color}">${label}</text>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [36, 44],
    iconAnchor: [18, 22],
  })
}

export default function MapView({ scenario, drone1, drone2, onDrag, linkOk, linkMargin }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({ m1: null, m2: null, line: null })

  // Determine link line color from margin
  const lineColor = !linkOk ? '#ef4444' : linkMargin > 20 ? '#10b981' : linkMargin > 10 ? '#f59e0b' : '#ef4444'
  const lineOpacity = linkOk ? 0.7 : 0.4

  useEffect(() => {
    if (mapInstanceRef.current) return // already initialized
    const map = L.map(mapRef.current, {
      center: scenario.center,
      zoom: scenario.zoom,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    mapInstanceRef.current = map

    // Markers
    const m1 = L.marker([drone1.lat, drone1.lon], { draggable: true, icon: droneIcon('#2d7ff9', 'D1') }).addTo(map)
    const m2 = L.marker([drone2.lat, drone2.lon], { draggable: true, icon: droneIcon('#a855f7', 'D2') }).addTo(map)
    const line = L.polyline([[drone1.lat, drone1.lon], [drone2.lat, drone2.lon]], {
      color: lineColor, weight: 2, dashArray: '8,6', opacity: lineOpacity
    }).addTo(map)

    m1.on('drag', (e) => {
      const { lat, lng } = e.latlng
      onDrag(1, lat, lng)
      line.setLatLngs([[lat, lng], m2.getLatLng()])
    })
    m2.on('drag', (e) => {
      const { lat, lng } = e.latlng
      onDrag(2, lat, lng)
      line.setLatLngs([m1.getLatLng(), [lat, lng]])
    })

    markersRef.current = { m1, m2, line }

    return () => { map.remove(); mapInstanceRef.current = null; }
  }, []) // eslint-disable-line

  // Update on scenario change
  useEffect(() => {
    const map = mapInstanceRef.current
    const { m1, m2, line } = markersRef.current
    if (!map || !m1 || !m2 || !line) return

    map.setView(scenario.center, scenario.zoom)
    m1.setLatLng([drone1.lat, drone1.lon])
    m2.setLatLng([drone2.lat, drone2.lon])
    line.setLatLngs([[drone1.lat, drone1.lon], [drone2.lat, drone2.lon]])
  }, [scenario.name]) // eslint-disable-line

  // Update line color + positions reactively
  useEffect(() => {
    const { m1, m2, line } = markersRef.current
    if (!line || !m1 || !m2) return
    line.setLatLngs([[drone1.lat, drone1.lon], [drone2.lat, drone2.lon]])
    line.setStyle({ color: lineColor, opacity: lineOpacity })
  }, [drone1, drone2, lineColor, lineOpacity])

  return <div ref={mapRef} className="w-full h-full" />
}
