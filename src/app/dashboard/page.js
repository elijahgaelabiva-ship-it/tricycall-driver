'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { enablePush } from '@/lib/push'

const ACTIVE_STATUSES = ['accepted', 'arrived', 'ongoing']

export default function DriverDashboardPage() {
  const [profile, setProfile] = useState(null)
  const [driver, setDriver] = useState(null)
  const [vehicle, setVehicle] = useState(null)
  const [avgRating, setAvgRating] = useState(null)
  const [ratingCount, setRatingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [pendingTrips, setPendingTrips] = useState([])
const [skippedIds, setSkippedIds] = useState([])  
const [accepting, setAccepting] = useState(null)
  const [pushStatus, setPushStatus] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const loadData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      const { data: driverData } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', user.id)
        .single()

      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('*')
        .eq('driver_id', user.id)
        .maybeSingle()

      // If the driver still has an unfinished trip (e.g. they closed the app
      // without tapping "Complete Trip"), send them back to it.
      const { data: activeTrip } = await supabase
        .from('trips')
        .select('id')
        .eq('driver_id', user.id)
        .in('status', ACTIVE_STATUSES)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (activeTrip) {
        router.replace(`/trip/${activeTrip.id}`)
        return
      }

      // No Online/Offline button: a logged-in, approved driver is online.
      // (Logging out sets them offline.)
      let currentDriver = driverData
      if (driverData?.is_approved && !driverData.is_suspended) {
        if (!driverData.is_online) {
          const { error: onlineError } = await supabase
            .from('drivers')
            .update({ is_online: true })
            .eq('id', user.id)
          if (!onlineError) currentDriver = { ...driverData, is_online: true }
        }

        // Opening the app counts as "I'm still here" for the availability check.
        // Best effort: ignore errors so the dashboard still works if this fails.
        await supabase
          .from('drivers')
          .update({ last_active_at: new Date().toISOString(), availability_check_sent_at: null })
          .eq('id', user.id)
      }

      setProfile(profileData)
      setDriver(currentDriver)
      setVehicle(vehicleData)
      setLoading(false)
    }

    loadData()
  }, [router])

  // GPS tracking while online
  useEffect(() => {
    if (!driver?.is_online) return
    if (!navigator.geolocation) return

    const lastWriteRef = { current: null } // { lat, lng, time }
    const MIN_WRITE_INTERVAL_MS = 8000 // idle/waiting drivers can update a bit less often than active-trip drivers
    const MIN_WRITE_DISTANCE_M = 20

    const toRad = (d) => (d * Math.PI) / 180
    const distanceMeters = (a, b) => {
      const R = 6371000
      const dLat = toRad(b.lat - a.lat)
      const dLng = toRad(b.lng - a.lng)
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        const now = Date.now()
        const last = lastWriteRef.current
        const movedEnough = !last || distanceMeters(last, { lat, lng }) > MIN_WRITE_DISTANCE_M
        const enoughTimePassed = !last || now - last.time > MIN_WRITE_INTERVAL_MS

        if (!movedEnough && !enoughTimePassed) return

        lastWriteRef.current = { lat, lng, time: now }

        const { error } = await supabase
          .from('drivers')
          .update({ current_lat: lat, current_lng: lng })
          .eq('id', driver.id)

        if (error) console.log('Update error:', error)
      },
      (error) => console.log('Location error:', error),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [driver?.is_online, driver?.id])

  // Re-register this device for push whenever the dashboard opens while online
  // (only if permission was already granted, so no surprise prompts)
  useEffect(() => {
    if (driver?.is_online && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      enablePush(driver.id).then(setPushStatus)
    }
  }, [driver?.is_online, driver?.id])

  // Load pending trip requests while online
  useEffect(() => {
    if (!driver?.is_online) {
      setPendingTrips([])
      return
    }

const loadPendingTrips = async () => {
      const { data } = await supabase
        .from('trips')
        .select('*')
        .eq('status', 'requested')
        .order('requested_at', { ascending: false })

      setPendingTrips((data || []).filter((t) => !skippedIds.includes(t.id)))
    }

    loadPendingTrips()

    // Refresh every 5 seconds so new requests show up
    const interval = setInterval(loadPendingTrips, 5000)
    return () => clearInterval(interval)
  }, [driver?.is_online])

  // Load the driver's average rating from past trips
  useEffect(() => {
    if (!driver?.id) return

    const loadRatings = async () => {
      const { data } = await supabase
        .from('ratings')
        .select('rating')
        .eq('driver_id', driver.id)

      if (data && data.length > 0) {
        const avg = data.reduce((sum, r) => sum + r.rating, 0) / data.length
        setAvgRating(avg)
        setRatingCount(data.length)
      } else {
        setAvgRating(null)
        setRatingCount(0)
      }
    }

    loadRatings()
  }, [driver?.id])

  const handleLogout = async () => {
    setLoggingOut(true)

    try {
      // Remove this phone's notification registration so a logged-out phone
      // stops receiving ride requests.
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration('/sw.js')
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
          await subscription.unsubscribe()
        }
      }

      // Go offline so passengers/requests no longer reach this driver
      if (driver?.id) {
        await supabase.from('drivers').update({ is_online: false }).eq('id', driver.id)
      }
    } catch (err) {
      console.log('Logout cleanup error:', err)
    }

    await supabase.auth.signOut()
    router.replace('/login')
  }

  const acceptTrip = async (tripId) => {
    setAccepting(tripId)

    // Don't let a driver take a new trip while another is still unfinished.
    const { data: existing } = await supabase
      .from('trips')
      .select('id')
      .eq('driver_id', driver.id)
      .in('status', ACTIVE_STATUSES)
      .limit(1)
      .maybeSingle()

    if (existing) {
      setAccepting(null)
      router.push(`/trip/${existing.id}`)
      return
    }

    const { error } = await supabase
      .from('trips')
      .update({
        driver_id: driver.id,
        status: 'accepted',
      })
      .eq('id', tripId)
      .eq('status', 'requested') // prevents accepting a trip someone else already took

    if (error) {
      alert('Could not accept trip: ' + error.message)
      setAccepting(null)
      return
    }

    router.push(`/trip/${tripId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist">
        <p className="text-mute font-medium">Loading your dashboard...</p>
      </div>
    )
  }

  if (driver?.is_suspended) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist px-6">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-line p-6 text-center">
          <h1 className="text-xl font-extrabold text-ink">Account suspended</h1>
          <p className="mt-2 text-sm text-mute leading-relaxed">
            Hi {profile?.full_name}, your account was suspended after several trips were
            abandoned while active. Contact TRICYCALL.SF support to resolve this.
          </p>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="mt-5 h-11 w-full rounded-xl border border-line font-semibold text-ink disabled:opacity-50"
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </div>
    )
  }

  if (!driver?.is_approved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist px-6">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-line p-6 text-center">
          <h1 className="text-xl font-extrabold text-ink">Waiting for approval</h1>
          <p className="mt-2 text-sm text-mute leading-relaxed">
            Hi {profile?.full_name}, an admin is reviewing your account. You'll be able to
            receive ride requests as soon as it's approved.
          </p>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="mt-5 h-11 w-full rounded-xl border border-line font-semibold text-ink disabled:opacity-50"
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </div>
    )
  }

  const online = driver.is_online

  return (
    <div className="min-h-screen bg-mist">
      <div className="mx-auto w-full max-w-md pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Status band */}
        <header className="bg-ink text-white rounded-b-[28px] px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white/80">TRICYCALL.SF</span>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="-mr-3 rounded-lg px-3 py-2 text-sm font-semibold text-white/80 active:bg-white/10 disabled:opacity-50"
            >
              {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
          </div>

          <button
            onClick={() => router.push('/profile')}
            aria-label="Open your profile"
            className="mt-4 flex w-full items-center gap-4 text-left"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className={`h-16 w-16 rounded-full object-cover ring-2 ring-offset-2 ring-offset-ink ${
                  online ? 'ring-live' : 'ring-white/30'
                }`}
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl font-bold">
                {profile?.full_name?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-bold">{profile?.full_name}</p>
              <p className="text-sm text-white/70">
                {ratingCount > 0 ? (
                  <>
                    <span className="text-[#ffb703]">★</span> {avgRating.toFixed(1)} ·{' '}
                    {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}
                  </>
                ) : (
                  'New driver, no ratings yet'
                )}
              </p>
            </div>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-white/50"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          <div className="mt-6 flex items-center gap-3">
            <span className="relative flex h-3.5 w-3.5 shrink-0">
              {online && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-60 motion-safe:animate-ping" />
              )}
              <span
                className={`relative inline-flex h-3.5 w-3.5 rounded-full ${
                  online ? 'bg-live' : 'bg-white/40'
                }`}
              />
            </span>
            <div>
              <p className="text-2xl font-extrabold leading-tight">
                {online ? "You're online" : "You're offline"}
              </p>
              <p className="text-sm text-white/70">
                {online
                  ? 'Passengers nearby can send you ride requests.'
                  : 'Open the app again to go back online.'}
              </p>
            </div>
          </div>

          {online && (
            <div className="mt-4">
              {pushStatus?.ok ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90">
                  <BellIcon />
                  Alerts are on for this phone
                </span>
              ) : (
                <div className="rounded-xl bg-[#ffb703]/15 px-3.5 py-3 text-sm text-[#ffd77a]">
                  <p className="flex items-start gap-2">
                    <BellIcon />
                    <span>
                      {pushStatus?.message ||
                        'Alerts are off. Turn them on to get ride requests when the app is closed.'}
                    </span>
                  </p>
                  <button
                    onClick={async () => setPushStatus(await enablePush(driver.id))}
                    className="mt-3 h-10 rounded-lg bg-signal px-4 text-sm font-bold text-ink active:bg-signal-dark"
                  >
                    Turn on alerts
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Vehicle */}
        <section className="mx-4 mt-4 rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-md border-2 border-ink px-3 py-1 text-lg font-extrabold tracking-wider text-ink">
              {vehicle?.plate_number || 'No plate'}
            </span>
            <span className="truncate text-sm font-semibold text-mute">
              {vehicle?.model || 'Vehicle not set'}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div className="min-w-0">
              <dt className="text-xs text-mute">License number</dt>
              <dd className="mt-0.5 truncate font-semibold text-ink">
                {driver?.license_number || '—'}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-mute">Contact number</dt>
              <dd className="mt-0.5 truncate font-semibold text-ink">{profile?.phone || '—'}</dd>
            </div>
          </dl>
        </section>

        {/* Ride requests */}
        {online && (
          <section className="mx-4 mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-ink">Ride requests</h2>
              {pendingTrips.length > 0 && (
                <span className="rounded-full bg-signal px-2.5 py-0.5 text-sm font-bold text-ink">
                  {pendingTrips.length}
                </span>
              )}
            </div>

            {pendingTrips.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-line px-5 py-8 text-center">
                <p className="font-bold text-ink">Waiting for passengers</p>
                <p className="mx-auto mt-1 max-w-[17rem] text-sm leading-relaxed text-mute">
                  New requests appear here right away. With alerts on, you'll also be
                  notified when the app is closed.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {pendingTrips.map((trip) => (
                  <article
                    key={trip.id}
                    className="rounded-2xl border border-line bg-white p-4"
                  >
                    <div className="flex items-end justify-between gap-3">
                      <p className="text-3xl font-extrabold tabular-nums text-ink">
                        ₱{Number(trip.fare).toFixed(2)}
                      </p>
                      <p className="pb-1 text-sm font-semibold text-mute">
                        {Number(trip.distance_km).toFixed(2)} km trip
                      </p>
                    </div>

                    {trip.pickup_address && (
                      <p className="mt-2 flex items-start gap-2 text-sm text-ink">
                        <PinIcon />
                        <span className="min-w-0">{trip.pickup_address}</span>
                      </p>
                    )}

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => acceptTrip(trip.id)}
                        disabled={accepting === trip.id}
                        className="h-12 flex-1 rounded-xl bg-signal font-bold text-ink active:bg-signal-dark disabled:opacity-60"
                      >
                        {accepting === trip.id ? 'Accepting...' : 'Accept ride'}
                      </button>
                      <button
                        onClick={() => {
                          setSkippedIds((prev) => [...prev, trip.id])
                          setPendingTrips((prev) => prev.filter((t) => t.id !== trip.id))
                        }}
                        className="h-12 rounded-xl px-4 font-semibold text-mute active:bg-mist"
                      >
                        Skip
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function BellIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-px shrink-0"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-signal"
      aria-hidden="true"
    >
      <path d="M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}
