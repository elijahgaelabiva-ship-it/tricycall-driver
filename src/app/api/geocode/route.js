// Server-side proxy for Nominatim (OSM) geocoding.
//
// Nominatim's usage policy requires a valid, identifying User-Agent (or
// Referer) header on every request: https://operations.osmfoundation.org/policies/nominatim/
// Browsers won't let client-side fetch() set a custom User-Agent, so this
// route runs the request on the server instead, where we can.
//
// Update the User-Agent string below with your actual app name and a
// contact URL/email — that's what the policy asks for.

const USER_AGENT = 'Tricycall/1.0 (https://tricycall.com; contact@tricycall.com)'

export async function GET(request) {
  const { searchParams } = new URL(request.url)

  const params = new URLSearchParams({
    format: 'json',
    q: searchParams.get('q') || '',
    limit: searchParams.get('limit') || '5',
    addressdetails: '1',
  })

  const viewbox = searchParams.get('viewbox')
  if (viewbox) {
    params.set('viewbox', viewbox)
    params.set('bounded', searchParams.get('bounded') || '0')
  }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en',
      },
    })

    if (!res.ok) {
      return Response.json({ error: 'Geocoding request failed' }, { status: res.status })
    }

    const data = await res.json()
    return Response.json(data)
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}