'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'

const driverIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  className: 'hue-rotate-180',
})

const targetIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

// Distance in meters between two lat/lng points (haversine formula)
function distanceMeters(a, b) {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// Draws/updates the blue road-based route line without stacking duplicate
// layers, and without re-requesting a route on every tiny GPS jitter.
function RouteLayer({ start, end }) {
  const map = useMap()
  const routeLayerRef = useRef(null)
  const lastStartRef = useRef(null)
  const lastEndRef = useRef(null)
  const hasFitBoundsRef = useRef(false)

  const clearCurrentRoute = () => {
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }
  }

  const drawFallbackStraightLine = (start, end) => {
    clearCurrentRoute()
    const layer = L.polyline(
      [
        [start.lat, start.lng],
        [end.lat, end.lng],
      ],
      { color: '#2563eb', weight: 4, opacity: 0.6, dashArray: '6, 8' }
    ).addTo(map)
    routeLayerRef.current = layer
  }

  const drawRoute = async (start, end) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
      const res = await fetch(url)

      if (!res.ok) throw new Error('Routing request failed')

      const data = await res.json()
      const coords = data?.routes?.[0]?.geometry?.coordinates

      if (!coords || coords.length === 0) throw new Error('No route found')

      clearCurrentRoute()

      const latLngs = coords.map(([lng, lat]) => [lat, lng])
      const layer = L.polyline(latLngs, { color: '#2563eb', weight: 5, opacity: 0.85 }).addTo(map)
      routeLayerRef.current = layer

      if (!hasFitBoundsRef.current) {
        map.fitBounds(layer.getBounds(), { padding: [40, 40] })
        hasFitBoundsRef.current = true
      }
    } catch (err) {
      console.log('Route request failed, showing straight-line fallback:', err.message)
      drawFallbackStraightLine(start, end)
    }
  }

  useEffect(() => {
    if (!start || !end) return

    const startMoved =
      !lastStartRef.current || distanceMeters(lastStartRef.current, start) > 30
    const endChanged =
      !lastEndRef.current ||
      lastEndRef.current.lat !== end.lat ||
      lastEndRef.current.lng !== end.lng

    if (!startMoved && !endChanged) return

    // Re-frame the map when switching from the pickup route to the
    // destination route, but not on every small GPS movement in between.
    if (endChanged) {
      hasFitBoundsRef.current = false
    }

    lastStartRef.current = start
    lastEndRef.current = end

    drawRoute(start, end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.lat, start?.lng, end?.lat, end?.lng])

  useEffect(() => {
    return () => clearCurrentRoute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export default function MapView({ driverLocation, targetLocation }) {
  return (
    <MapContainer
      center={[driverLocation.lat, driverLocation.lng]}
      zoom={15}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
      />
      <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon} />
      {targetLocation && (
        <>
          <Marker position={[targetLocation.lat, targetLocation.lng]} icon={targetIcon} />
          <RouteLayer start={driverLocation} end={targetLocation} />
        </>
      )}
    </MapContainer>
  )
}