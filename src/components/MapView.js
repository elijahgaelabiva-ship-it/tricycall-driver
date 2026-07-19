'use client'

import { MapContainer, TileLayer, Marker } from 'react-leaflet'
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

export default function MapView({ driverLocation, targetLocation }) {
  return (
    <MapContainer
      center={[driverLocation.lat, driverLocation.lng]}
      zoom={15}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon} />
      {targetLocation && (
        <Marker position={[targetLocation.lat, targetLocation.lng]} icon={targetIcon} />
      )}
    </MapContainer>
  )
}