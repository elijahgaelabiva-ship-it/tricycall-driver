// Called every ~15 minutes by a Supabase scheduled job (pg_cron).
//  1. Online drivers inactive for CHECK_AFTER hours get an "Are you still available?" push.
//  2. Drivers who got that push and still haven't opened the app after GRACE hours
//     are set offline.
// Opening the app (or any location update) resets the driver's activity time.

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const HOUR = 60 * 60 * 1000
const CHECK_AFTER_HOURS = Number(process.env.AVAILABILITY_CHECK_AFTER_HOURS || 4)
const GRACE_HOURS = Number(process.env.AVAILABILITY_GRACE_HOURS || 2)

async function pushToDrivers(supabase, driverIds, payload) {
  if (driverIds.length === 0) return 0

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, subscription')
    .in('driver_id', driverIds)

  const message = JSON.stringify(payload)
  let sent = 0

  await Promise.all(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, message, { urgency: 'high', TTL: 3600 })
        sent++
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        } else {
          console.log('Availability push error:', err.statusCode, err.body)
        }
      }
    })
  )
  return sent
}

export async function POST(request) {
  if (request.headers.get('x-webhook-secret') !== process.env.WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
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

  const now = Date.now()
  const checkBefore = new Date(now - CHECK_AFTER_HOURS * HOUR).toISOString()
  const graceBefore = new Date(now - GRACE_HOURS * HOUR).toISOString()
  const result = { checksSent: 0, setOffline: 0 }

  // Drivers in the middle of a trip are never touched
  const { data: busy } = await supabase
    .from('trips')
    .select('driver_id')
    .in('status', ['accepted', 'arrived', 'ongoing'])
  const busyIds = new Set((busy || []).map((t) => t.driver_id))

  // 1. Ask inactive online drivers if they are still available
  const { data: toCheck, error: checkError } = await supabase
    .from('drivers')
    .select('id')
    .eq('is_online', true)
    .is('availability_check_sent_at', null)
    .lt('last_active_at', checkBefore)
  if (checkError) result.checkError = checkError.message

  const checkIds = (toCheck || []).map((d) => d.id).filter((id) => !busyIds.has(id))
  if (checkIds.length > 0) {
    result.checksSent = await pushToDrivers(supabase, checkIds, {
      title: 'Are you still available?',
      body: `Tap to stay online. You'll be set offline in ${GRACE_HOURS} hour(s) if you don't.`,
      tag: 'availability-check',
      url: '/dashboard',
    })
    await supabase
      .from('drivers')
      .update({ availability_check_sent_at: new Date().toISOString() })
      .in('id', checkIds)
  }

  // 2. Set offline anyone who ignored the check for GRACE_HOURS
  const { data: expired, error: expiredError } = await supabase
    .from('drivers')
    .select('id, last_active_at, availability_check_sent_at')
    .eq('is_online', true)
    .not('availability_check_sent_at', 'is', null)
    .lt('availability_check_sent_at', graceBefore)
  if (expiredError) result.expiredError = expiredError.message

  const offlineIds = (expired || [])
    .filter(
      (d) =>
        !busyIds.has(d.id) &&
        new Date(d.last_active_at).getTime() < new Date(d.availability_check_sent_at).getTime()
    )
    .map((d) => d.id)

  if (offlineIds.length > 0) {
    await supabase
      .from('drivers')
      .update({ is_online: false, availability_check_sent_at: null })
      .in('id', offlineIds)
    result.setOffline = offlineIds.length

    await pushToDrivers(supabase, offlineIds, {
      title: 'You were set offline',
      body: 'Open the app to go back online and receive ride requests.',
      tag: 'availability-offline',
      url: '/dashboard',
    })
  }

  return Response.json(result)
}
