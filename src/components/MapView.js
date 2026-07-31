'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'

const destinationIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

const passengerIcon = new L.Icon({
  iconUrl: '/icons/passenger-marker.png',
  iconSize: [46, 46], // true square canvas — artwork padded, not stretched or cropped
  iconAnchor: [4, 19], // the pointing fingertip
})

// San Felipe, Zambales fallback center. The map must render immediately on
// open rather than waiting for GPS permission/fix.
const SAN_FELIPE_CENTER = { lat: 15.186, lng: 120.141 }

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

// Builds the tricycle marker icon, rotated to face the direction of travel.
// This is a top-down image, so rotating it directly shows the tricycle
// turning left/right/etc. as it moves — no separate arrow needed.
function createDriverIcon(bearing) {
  const html = `
    <img
      src="/icons/driver-marker-v2.png"
      style="
        width: 48px;
        height: 48px;
        display: block;
        transform: rotate(${bearing}deg);
        transition: transform 0.3s linear;
      "
    />
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
  const [renderPosition, setRenderPosition] = useState(location)
  const prevLocationRef = useRef(location)
  const lastUpdateTimeRef = useRef(null)
  const animRef = useRef(null)

  useEffect(() => {
    if (!location) return

    const prev = prevLocationRef.current
    if (prev && distanceMeters(prev, location) > 3) {
      setBearing(bearingDegrees(prev, location))
    }

    const from = prevLocationRef.current || location
    const to = location
    prevLocationRef.current = location

    const now = performance.now()
    const prevUpdateTime = lastUpdateTimeRef.current
    lastUpdateTimeRef.current = now

    let duration = 900
    if (prevUpdateTime) {
      const elapsed = now - prevUpdateTime
      duration = Math.min(8000, Math.max(900, elapsed))
    }

    if (animRef.current) cancelAnimationFrame(animRef.current)

    const start = now

    const tick = (t2) => {
      const t = Math.min(1, (t2 - start) / duration)
      setRenderPosition({
        lat: from.lat + (to.lat - from.lat) * t,
        lng: from.lng + (to.lng - from.lng) * t,
      })
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick)
      }
    }

    animRef.current = requestAnimationFrame(tick)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.lat, location?.lng])

  if (!renderPosition) return null

  return (
    <Marker
      position={[renderPosition.lat, renderPosition.lng]}
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
  const requestIdRef = useRef(0)

  const clearCurrentRoute = () => {
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }
  }

  const drawFallbackStraightLine = (start, end, requestId) => {
    if (requestId !== requestIdRef.current) return
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
    const requestId = ++requestIdRef.current

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
      const res = await fetch(url)

      if (!res.ok) throw new Error('Routing request failed')

      const data = await res.json()
      const coords = data?.routes?.[0]?.geometry?.coordinates

      if (!coords || coords.length === 0) throw new Error('No route found')

      if (requestId !== requestIdRef.current) return // superseded by a newer request

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
      drawFallbackStraightLine(start, end, requestId)
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

// Flies the map to a location whenever it changes (e.g. after the passenger
// picks an address from the search box).
function FlyToLocation({ location }) {
  const map = useMap()
  const lastRef = useRef(null)

  useEffect(() => {
    if (!location) return
    const last = lastRef.current
    if (last && last.lat === location.lat && last.lng === location.lng) return
    lastRef.current = location
    map.flyTo([location.lat, location.lng], 16, { duration: 1 })
  }, [location?.lat, location?.lng])

  return null
}

// "Where to?" search box overlaid on the map. Debounces requests to
// Nominatim (OSM's free geocoder) as the passenger types, shows matching
// addresses, and reports the chosen lat/lng back to the parent.
function DestinationSearchBox({ onSelect, biasCenter }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query || query.trim().length < 3) {
      setSuggestions([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          format: 'json',
          q: query,
          limit: '5',
          addressdetails: '1',
        })

        // Nudge results toward the passenger's current area without
        // hard-restricting them to it.
        if (biasCenter) {
          const delta = 0.3
          params.set(
            'viewbox',
            [
              biasCenter.lng - delta,
              biasCenter.lat + delta,
              biasCenter.lng + delta,
              biasCenter.lat - delta,
            ].join(',')
          )
          params.set('bounded', '0')
        }

        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          headers: { 'Accept-Language': 'en' },
        })
        const data = await res.json()
        setSuggestions(data || [])
      } catch (err) {
        console.log('Geocoding search failed:', err.message)
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 450)

    return () => clearTimeout(debounceRef.current)
  }, [query, biasCenter?.lat, biasCenter?.lng])

  const handleSelect = (place) => {
    const location = { lat: parseFloat(place.lat), lng: parseFloat(place.lon) }
    setQuery(place.display_name)
    setSuggestions([])
    onSelect(location, place.display_name)
  }

  return (
    <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1000 }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Where to?"
        style={{
          width: '100%',
          padding: '14px 18px',
          borderRadius: 999,
          border: 'none',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          fontSize: 16,
          textAlign: 'center',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      {loading && (
        <div
          style={{
            background: 'white',
            borderRadius: 12,
            marginTop: 6,
            padding: '10px 16px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
            fontSize: 14,
            color: '#666',
          }}
        >
          Searching...
        </div>
      )}

      {!loading && suggestions.length > 0 && (
        <div
          style={{
            background: 'white',
            borderRadius: 12,
            marginTop: 6,
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          }}
        >
          {suggestions.map((place) => (
            <div
              key={place.place_id}
              onClick={() => handleSelect(place)}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #eee',
                cursor: 'pointer',
                fontSize: 14,
                textAlign: 'left',
              }}
            >
              {place.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Recenters the map exactly once, the moment the driver's real GPS
// location first arrives. Does not fight manual panning afterward.
function RecenterOnFirstFix({ location, hasRealFix }) {
  const map = useMap()
  const didRecenterRef = useRef(false)

  useEffect(() => {
    if (!hasRealFix || didRecenterRef.current || !location) return
    didRecenterRef.current = true
    map.setView([location.lat, location.lng], 16)
  }, [hasRealFix, location?.lat, location?.lng, map])

  return null
}

export default function MapView({ driverLocation, targetLocation, targetIsPassenger, onDestinationSelect }) {
  const hasRealFix = Boolean(driverLocation)
  const mapCenter = driverLocation || SAN_FELIPE_CENTER

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {onDestinationSelect && (
        <DestinationSearchBox onSelect={onDestinationSelect} biasCenter={mapCenter} />
      )}
      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        />
        {driverLocation && <DriverMarker location={driverLocation} />}
        {targetLocation && (
          <>
            <Marker
              position={[targetLocation.lat, targetLocation.lng]}
              icon={targetIsPassenger ? passengerIcon : destinationIcon}
            />
            {driverLocation && <RouteLayer start={driverLocation} end={targetLocation} />}
            <FlyToLocation location={targetLocation} />
          </>
        )}
        <RecenterOnFirstFix location={driverLocation} hasRealFix={hasRealFix} />
      </MapContainer>
    </div>
  )
}