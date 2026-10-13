// Called by a Supabase Database Webhook whenever a row is inserted into `trips`.
// Finds online drivers within NOTIFY_RADIUS_KM of the pickup point and sends
// them a push notification (works even when the app is closed).

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const RADIUS_KM = Number(process.env.NOTIFY_RADIUS_KM || 3)

function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export async function POST(request) {
  if (request.headers.get('x-webhook-secret') !== process.env.WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json()
  const trip = payload?.record
  if (payload?.type !== 'INSERT' || !trip || trip.status !== 'requested') {
    return Response.json({ skipped: true })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contact@tricycall.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Online drivers with a known location
  const debug = {}
  const { data: drivers, error: driversError } = await supabase
    .from('drivers')
    .select('id, current_lat, current_lng')
    .eq('is_online', true)
    .not('current_lat', 'is', null)
    .not('current_lng', 'is', null)
  if (driversError) debug.driversError = driversError.message
  debug.onlineDrivers = (drivers || []).length

  // Drivers already busy with an unfinished trip are skipped
  const { data: busy, error: busyError } = await supabase
    .from('trips')
    .select('driver_id')
    .in('status', ['accepted', 'arrived', 'ongoing'])
  if (busyError) debug.busyError = busyError.message
  const busyIds = new Set((busy || []).map((t) => t.driver_id))

  const nearby = (drivers || []).filter(
    (d) =>
      !busyIds.has(d.id) &&
      distanceKm(d.current_lat, d.current_lng, trip.pickup_lat, trip.pickup_lng) <= RADIUS_KM
  )
  debug.nearby = nearby.length
  if (nearby.length === 0) return Response.json({ notified: 0, debug })

  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, subscription')
    .in('driver_id', nearby.map((d) => d.id))
  if (subsError) debug.subsError = subsError.message
  debug.subscriptions = (subs || []).length
  debug.sendErrors = []

  const message = JSON.stringify({
    title: 'New ride request',
    body: trip.pickup_address
      ? `Pickup: ${trip.pickup_address}${trip.fare ? ` • ₱${trip.fare}` : ''}`
      : 'A passenger near you needs a ride.',
    tag: `trip-${trip.id}`,
    url: '/dashboard',
  })

  let sent = 0
  await Promise.all(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, message)
        sent++
      } catch (err) {
        // Subscription expired or was revoked: remove it
        if (err.statusCode === 404 || err.statusCode === 410) {
          debug.sendErrors.push(`${err.statusCode}: subscription expired, removed`)
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        } else {
          console.log('Push error:', err.statusCode, err.body)
          debug.sendErrors.push(`${err.statusCode || 'ERR'}: ${String(err.body || err.message).slice(0, 120)}`)
        }
      }
    })
  )

  return Response.json({ notified: sent, debug })
}
