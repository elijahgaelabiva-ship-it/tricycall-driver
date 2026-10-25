// Turns coordinates into a human-readable place name (barangay level) so the
// UI never has to show raw lat/lng to the driver. The exact coordinates are
// still used for map pins — this is display text only.

const cache = new Map()

function pickBarangay(address = {}) {
  return (
    address.suburb ||
    address.neighbourhood ||
    address.quarter ||
    address.village ||
    address.hamlet ||
    address.city_district ||
    null
  )
}

function pickTown(address = {}) {
  return address.municipality || address.town || address.city || address.county || null
}

export async function reversePlaceName(lat, lng) {
  if (lat == null || lng == null) return null

  const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`
  if (cache.has(key)) return cache.get(key)

  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lng),
      zoom: '16', // ~barangay / neighbourhood level
      addressdetails: '1',
    })
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { 'Accept-Language': 'en' },
    })
    if (!res.ok) throw new Error('Reverse geocoding failed')

    const data = await res.json()
    const barangay = pickBarangay(data.address)
    const town = pickTown(data.address)

    const name =
      [barangay, town].filter(Boolean).join(', ') ||
      data.name ||
      (data.display_name ? data.display_name.split(',').slice(0, 2).join(',').trim() : null)

    cache.set(key, name)
    return name
  } catch (err) {
    console.log('Reverse geocode failed:', err.message)
    return null
  }
}
