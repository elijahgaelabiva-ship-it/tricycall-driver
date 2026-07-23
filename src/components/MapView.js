'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'

const targetIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

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

function bearingDegrees(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI

  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng)

  const deg = toDeg(Math.atan2(y, x))
  return (deg + 360) % 360
}

function createDriverIcon(bearing) {
  const html = `
    <div style="
      width: 48px;
      height: 48px;
      position: relative;
      transform: rotate(${bearing}deg);
      transition: transform 0.3s linear;
    ">
      <div style="
        position: absolute;
        top: -10px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-bottom: 12px solid #0a7d34;
        z-index: 2;
      "></div>
      <img
        src="/icons/driver-marker-64.png"
        style="
          width: 48px;
          height: 48px;
          display: block;
          transform: rotate(${-bearing}deg);
        "
      />
    </div>
  `

  return L.divIcon({
    html,
    className: '',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  })
}

function DriverMarker({ location }) {
  const [bearing, setBearing] = useState(0)
  const prevLocationRef = useRef(null)

  useEffect(() => {
    if (!location) return

    const prev = prevLocationRef.current
    if (prev && distanceMeters(prev, location) > 3) {
      setBearing(bearingDegrees(prev, location))
    }

    prevLocationRef.current = location
  }, [location?.lat, location?.lng])

  return (
    <Marker
      position={[location.lat, location.lng]}
      icon={createDriverIcon(bearing)}
    />
  )
}

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
      <DriverMarker location={driverLocation} />
      {targetLocation && (
        <>
          <Marker position={[targetLocation.lat, targetLocation.lng]} icon={targetIcon} />
          <RouteLayer start={driverLocation} end={targetLocation} />
        </>
      )}
    </MapContainer>
  )
}