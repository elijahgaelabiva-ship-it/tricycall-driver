'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { enablePush } from '@/lib/push'

const ACTIVE_STATUSES = ['accepted', 'arrived', 'ongoing']

function timeAgo(iso) {
  if (!iso) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.floor(minutes / 60)} hr ago`
}

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
  const [today, setToday] = useState({ trips: 0, earned: 0 })
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

  // Today's completed trips and earnings
  useEffect(() => {
    if (!driver?.id || !driver?.is_approved) return

    const loadToday = async () => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)

      const { data } = await supabase
        .from('trips')
        .select('fare')
        .eq('driver_id', driver.id)
        .eq('status', 'completed')
        .gte('completed_at', start.toISOString())

      const rows = data || []
      setToday({
        trips: rows.length,
        earned: rows.reduce((sum, t) => sum + Number(t.fare || 0), 0),
      })
    }

    loadToday()
  }, [driver?.id, driver?.is_approved])

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
      <div className="min-h-screen bg-mist" aria-busy="true">
        <div className="mx-auto w-full max-w-md">
          <div className="h-64 rounded-b-[28px] bg-ink" />
          <div className="mx-4 mt-4 space-y-3 motion-safe:animate-pulse">
            <div className="h-20 rounded-2xl bg-white" />
            <div className="h-32 rounded-2xl bg-white" />
          </div>
        </div>
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
    <div className="h-dvh overflow-hidden bg-mist">
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        {/* Header: identity, plate, status */}
        <header className="shrink-0 rounded-b-[28px] bg-ink px-5 pb-5 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
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
            className="mt-1 flex w-full items-center gap-3.5 text-left"
          >
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className={`h-14 w-14 rounded-full object-cover ring-2 ring-offset-2 ring-offset-ink ${
                  online ? 'ring-live' : 'ring-white/30'
                }`}
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-xl font-bold">
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

          <div className="mt-4 flex items-start justify-between gap-3">
            {/* Plate with the model underneath */}
            <div className="min-w-0">
              <div className="relative w-fit max-w-full rounded-lg border-[3px] border-white bg-white p-0.5 text-ink">
                <div className="rounded-[5px] border border-ink/30 px-7 pb-1 pt-0.5 text-center">
                  <p className="text-[8px] font-bold tracking-[0.3em] text-ink/70">PHILIPPINES</p>
                  <p className="font-mono text-xl font-black leading-tight tracking-[0.12em]">
                    {vehicle?.plate_number || 'NO PLATE'}
                  </p>
                </div>
                <span className="absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ink/25" />
                <span className="absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ink/25" />
              </div>
              <p className="mt-1.5 truncate text-sm font-semibold text-white/70">
                {vehicle?.model || 'Vehicle model not set'}
              </p>
            </div>

            {/* Status */}
            <div className="min-w-0 text-right">
              <p className="flex items-center justify-end gap-2 text-base font-bold leading-tight">
                <span className="relative flex h-3 w-3 shrink-0">
                  {online && (
                    <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-60 motion-safe:animate-ping" />
                  )}
                  <span
                    className={`relative inline-flex h-3 w-3 rounded-full ${
                      online ? 'bg-live' : 'bg-white/40'
                    }`}
                  />
                </span>
                {online ? "You're online" : "You're offline"}
              </p>

              {online &&
                (pushStatus?.ok ? (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white/70">
                    <BellIcon />
                    Alerts on
                  </p>
                ) : (
                  <button
                    onClick={async () => setPushStatus(await enablePush(driver.id))}
                    className="mt-1.5 h-8 rounded-lg bg-signal px-3 text-xs font-bold text-ink active:bg-signal-dark"
                  >
                    Turn on alerts
                  </button>
                ))}
            </div>
          </div>

          {online && !pushStatus?.ok && pushStatus?.message && (
            <p className="mt-3 rounded-lg bg-[#ffb703]/15 px-3 py-2 text-xs leading-snug text-[#ffd77a]">
              {pushStatus.message}
            </p>
          )}
        </header>

        {/* Ride requests: fills the space, scrolls inside if there are many */}
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-ink">Ride requests</h2>
            {online && pendingTrips.length > 0 && (
              <span className="rounded-full bg-signal px-2.5 py-0.5 text-sm font-bold text-ink">
                {pendingTrips.length}
              </span>
            )}
          </div>

          {!online ? (
            <div className="mt-3 rounded-2xl border border-dashed border-line px-5 py-8 text-center">
              <p className="font-bold text-ink">You're offline</p>
              <p className="mx-auto mt-1 max-w-[17rem] text-sm leading-relaxed text-mute">
                Open the app again to go back online and receive requests.
              </p>
            </div>
          ) : pendingTrips.length === 0 ? (
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
                <article key={trip.id} className="rounded-2xl border border-line bg-white p-4">
                  <div className="flex items-end justify-between gap-3">
                    <p className="text-3xl font-extrabold tabular-nums text-ink">
                      ₱{Number(trip.fare).toFixed(2)}
                    </p>
                    <p className="pb-1 text-sm font-semibold text-mute">
                      {Number(trip.distance_km).toFixed(2)} km trip
                    </p>
                  </div>

                  <p className="mt-1 text-xs text-mute">{timeAgo(trip.requested_at)}</p>

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
        </main>

        {/* Today's numbers + history, pinned to the bottom */}
        <nav className="shrink-0 border-t border-line bg-white px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          <div className="grid grid-cols-3 divide-x divide-line">
            <div className="px-2 py-1 text-center">
              <p className="text-xs text-mute">Trips today</p>
              <p className="text-xl font-extrabold tabular-nums text-ink">{today.trips}</p>
            </div>
            <div className="px-2 py-1 text-center">
              <p className="text-xs text-mute">Earned today</p>
              <p className="text-xl font-extrabold tabular-nums text-ink">
                ₱{today.earned.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <button
              onClick={() => router.push('/history')}
              className="flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-ink active:bg-mist"
            >
              <HistoryIcon />
              <span className="text-xs font-semibold">Trip history</span>
            </button>
          </div>
        </nav>
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

function HistoryIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
