'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'

const pickupIcon = new L.Icon({
  iconUrl: '/icons/passenger-marker.png',
  iconSize: [46, 46],
  iconAnchor: [4, 19],
})

const dropoffIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

const TILE_URL = `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY}`

function FitToPins({ pickup, dropoff }) {
  const map = useMap()

  useEffect(() => {
    const points = [pickup, dropoff].filter(Boolean).map((p) => [p.lat, p.lng])
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 16)
      return
    }
    map.fitBounds(points, { padding: [40, 40] })
  }, [map, pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng])

  return null
}

function useRouteState(pickup, dropoff) {
  const [route, setRoute] = useState(null)

  useEffect(() => {
    if (!pickup || !dropoff) return
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(
          `/api/route?startLat=${pickup.lat}&startLng=${pickup.lng}&endLat=${dropoff.lat}&endLng=${dropoff.lng}`
        )
        if (!res.ok) throw new Error('route failed')
        const data = await res.json()
        const coords = data?.routes?.[0]?.geometry?.coordinates
        if (!coords?.length) throw new Error('no route')
        if (!cancelled) setRoute(coords.map(([lng, lat]) => [lat, lng]))
      } catch {
        if (!cancelled) {
          setRoute([
            [pickup.lat, pickup.lng],
            [dropoff.lat, dropoff.lng],
          ])
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng])

  return route
}

// Read-only map for a past trip: exact pickup + drop-off pins and the
// driving route between them (straight line if routing is unavailable).
export default function TripSummaryMap({ pickup, dropoff }) {
  const route = useRouteState(pickup, dropoff)
  const center = pickup || dropoff || { lat: 15.186, lng: 120.141 }

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={15}
      zoomControl={false}
      attributionControl={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url={TILE_URL} />
      {route && <Polyline positions={route} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85 }} />}
      {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />}
      {dropoff && <Marker position={[dropoff.lat, dropoff.lng]} icon={dropoffIcon} />}
      <FitToPins pickup={pickup} dropoff={dropoff} />
    </MapContainer>
  )
}
