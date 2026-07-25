// Server-side proxy for the public OSRM routing demo server.
// Same reasoning as /api/geocode: a browser fetch() can't set a custom
// User-Agent, so we make the request here where we can identify the app
// as OSRM's usage policy asks: http://project-osrm.org/docs/v5.24.0/api/#general-options

const USER_AGENT = 'Tricycall/1.0 (https://tricycall.com; contact@tricycall.com)'

export async function GET(request) {
  const { searchParams } = new URL(request.url)

  const startLat = searchParams.get('startLat')
  const startLng = searchParams.get('startLng')
  const endLat = searchParams.get('endLat')
  const endLng = searchParams.get('endLng')

  if (!startLat || !startLng || !endLat || !endLng) {
    return Response.json({ error: 'Missing coordinates' }, { status: 400 })
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    })

    if (!res.ok) {
      return Response.json({ error: 'Routing request failed' }, { status: res.status })
    }

    const data = await res.json()
    return Response.json(data)
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}