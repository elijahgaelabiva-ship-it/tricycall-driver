'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

export default function DriverTripPage() {
  const { id } = useParams()
  const router = useRouter()
  const [trip, setTrip] = useState(null)
  const [updating, setUpdating] = useState(false)
  const [driverLocation, setDriverLocation] = useState(null)
  const [reportingNoShow, setReportingNoShow] = useState(false)
  const [noShowError, setNoShowError] = useState('')
  const [passenger, setPassenger] = useState(null)
  const [passengerError, setPassengerError] = useState('')
  const tripStatusRef = useRef(null)
  const watchIdRef = useRef(null)

  useEffect(() => {
    const loadTrip = async () => {
      const { data } = await supabase.from('trips').select('*').eq('id', id).single()
      setTrip(data)
    }
    loadTrip()

    const channel = supabase
      .channel(`driver-trip-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trips',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          setTrip(payload.new)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])

  // Load the passenger's name + phone once we know the trip, via a safe
  // database function (rather than querying profiles directly).
  useEffect(() => {
    if (!trip) return

    const loadPassengerContact = async () => {
      const { data, error } = await supabase.rpc('get_trip_passenger_contact', {
        target_trip_id: id,
      })

      if (error) {
        console.log('Could not load passenger contact:', error.message)
        setPassengerError(error.message)
        return
      }

      if (data && data.length > 0) {
        setPassenger(data[0])
      }
    }

    loadPassengerContact()
  }, [trip?.id, id])

  // Keep a ref of the latest status (so the GPS watcher's closure, which is
  // only created once per driver_id rather than on every status change,
  // can still see up-to-date status) and explicitly stop GPS tracking the
  // moment the trip actually ends.
  useEffect(() => {
    tripStatusRef.current = trip?.status
    if (['completed', 'cancelled'].includes(trip?.status) && watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [trip?.status])

  // Keep tracking + broadcasting the driver's live GPS position for the
  // whole trip lifecycle. This watcher is intentionally NOT torn down on
  // every status change (accepted -> arrived -> ongoing) — only when the
  // trip actually ends or the driver changes — so there's no gap in
  // tracking at each transition. Local state updates on every GPS tick for
  // a responsive self-view, but the database write (and therefore what the
  // passenger sees over realtime) is throttled to avoid hammering Supabase
  // and burning mobile data on every single GPS callback.
  useEffect(() => {
    if (!trip?.driver_id) return
    if (!navigator.geolocation) return
    if (['completed', 'cancelled'].includes(tripStatusRef.current)) return

    const lastWriteRef = { current: null } // { lat, lng, time }
    const MIN_WRITE_INTERVAL_MS = 6000
    const MIN_WRITE_DISTANCE_M = 15

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

        // Always update local state immediately for a smooth self-view.
        setDriverLocation({ lat, lng })

        // Stop writing once the trip has ended, even if the watcher is
        // still momentarily active during cleanup.
        if (['completed', 'cancelled'].includes(tripStatusRef.current)) return

        const now = Date.now()
        const last = lastWriteRef.current
        const movedEnough = !last || distanceMeters(last, { lat, lng }) > MIN_WRITE_DISTANCE_M
        const enoughTimePassed = !last || now - last.time > MIN_WRITE_INTERVAL_MS

        if (!movedEnough && !enoughTimePassed) return

        lastWriteRef.current = { lat, lng, time: now }

        const { error } = await supabase
          .from('drivers')
          .update({ current_lat: lat, current_lng: lng })
          .eq('id', trip.driver_id)

        if (error) console.log('Location update error:', error)
      },
      (error) => console.log('Location error:', error),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )

    watchIdRef.current = watchId

    return () => {
      navigator.geolocation.clearWatch(watchId)
      watchIdRef.current = null
    }
  }, [trip?.driver_id])

  const updateStatus = async (newStatus) => {
    setUpdating(true)

    const updates = { status: newStatus }
    if (newStatus === 'completed') {
      updates.completed_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('trips')
      .update(updates)
      .eq('id', id)

    if (error) {
      alert('Error updating trip: ' + error.message)
    } else {
      setTrip({ ...trip, ...updates })
    }

    setUpdating(false)
  }

  const reportNoShow = async () => {
    setReportingNoShow(true)
    setNoShowError('')

    const { error } = await supabase.rpc('report_no_show', {
      target_trip_id: id,
    })

    if (error) {
      setNoShowError(error.message)
      setReportingNoShow(false)
      return
    }

    setTrip({ ...trip, status: 'cancelled' })
    router.push('/dashboard')
  }

  const nextStepMap = {
    accepted: { label: "I've arrived", next: 'arrived' },
    arrived: { label: 'Start trip', next: 'ongoing' },
    ongoing: { label: 'Complete trip', next: 'completed' },
  }

  const statusMessages = {
    accepted: { title: 'Head to the pickup', sub: 'Your passenger is waiting for you.' },
    arrived: { title: 'Waiting for passenger', sub: "Start the trip once they're on board." },
    ongoing: { title: 'Trip in progress', sub: 'Take your passenger to the drop-off point.' },
    completed: { title: 'Trip completed', sub: 'Nice work!' },
    cancelled: { title: 'Trip cancelled', sub: 'This ride was cancelled.' },
  }

  if (!trip) {
    return (
      <div className="min-h-screen bg-mist" aria-busy="true">
        <div className="mx-auto w-full max-w-md">
          <div className="h-48 rounded-b-[28px] bg-ink" />
          <div className="mx-4 mt-4 h-64 rounded-2xl bg-white motion-safe:animate-pulse" />
        </div>
      </div>
    )
  }

  const step = nextStepMap[trip.status]
  const message = statusMessages[trip.status] || { title: `Trip ${trip.status}`, sub: '' }

  // Show the pickup point while heading to/waiting for the passenger,
  // switch to the dropoff point once the trip is ongoing.
  const targetLocation =
    trip.status === 'ongoing'
      ? { lat: trip.dropoff_lat, lng: trip.dropoff_lng }
      : { lat: trip.pickup_lat, lng: trip.pickup_lng }

  const showMap = !['completed', 'cancelled'].includes(trip.status)
  const showPassengerCard = passenger && !['completed', 'cancelled'].includes(trip.status)

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-mist">
      {/* Status header */}
      <header className="shrink-0 rounded-b-[28px] bg-ink px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <span className="text-sm font-bold text-white/80">TRICYCALL.SF</span>

        <h1 className="mt-4 text-2xl font-extrabold leading-tight">{message.title}</h1>
        <p className="mt-1 text-sm text-white/70">{message.sub}</p>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-white/60">Fare</p>
            <p className="text-3xl font-extrabold tabular-nums">
              ₱{Number(trip.fare).toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/60">Distance</p>
            <p className="text-lg font-bold tabular-nums">
              {Number(trip.distance_km).toFixed(2)} km
            </p>
          </div>
        </div>
      </header>

      {showMap ? (
        <div className="relative min-h-0 flex-1 [&_.leaflet-bottom]:mb-6">
          <div className="absolute inset-0">
            <MapView
              driverLocation={driverLocation}
              targetLocation={targetLocation}
              targetIsPassenger={trip.status !== 'ongoing'}
            />
          </div>
        </div>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-5">
          <div className="rounded-2xl border border-line bg-white p-5 text-center">
            {trip.status === 'completed' ? (
              <>
                <p className="text-xs text-mute">You earned</p>
                <p className="text-4xl font-extrabold tabular-nums text-ink">
                  ₱{Number(trip.fare).toFixed(2)}
                </p>
                <p className="mt-2 text-sm text-mute">This trip is complete. Nice work!</p>
              </>
            ) : (
              <>
                <p className="font-bold text-ink">This trip was cancelled</p>
                <p className="mt-1 text-sm text-mute">
                  You'll be notified when another request comes in.
                </p>
              </>
            )}
          </div>
        </main>
      )}

      {/* Bottom sheet */}
      <div
        className="relative shrink-0 rounded-t-[28px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_24px_rgba(23,33,43,0.12)]"
        style={{ zIndex: 1100, marginTop: showMap ? '-1.5rem' : 0 }}
      >
        {showPassengerCard && (
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mist text-lg font-bold text-ink">
              {passenger.full_name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-mute">Passenger</p>
              <p className="truncate font-bold text-ink">{passenger.full_name}</p>
              <p className="text-sm text-mute">{passenger.phone}</p>
            </div>
            <a
              href={`tel:${passenger.phone}`}
              className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white active:bg-ink/90"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z" />
              </svg>
              Call
            </a>
          </div>
        )}

        {passengerError && !showPassengerCard && (
          <p className="text-xs text-red-600">
            Could not load passenger contact: {passengerError}
          </p>
        )}

        {step && (
          <button
            onClick={() => updateStatus(step.next)}
            disabled={updating}
            className={`h-14 w-full rounded-2xl bg-signal text-base font-bold text-ink active:bg-signal-dark disabled:opacity-60 ${
              showPassengerCard ? 'mt-4' : ''
            }`}
          >
            {updating ? 'Updating...' : step.label}
          </button>
        )}

        {trip.status === 'arrived' && (
          <button
            onClick={reportNoShow}
            disabled={reportingNoShow}
            className="mt-2 h-12 w-full rounded-2xl border border-red-200 font-semibold text-red-600 active:bg-red-50 disabled:opacity-50"
          >
            {reportingNoShow ? 'Reporting...' : 'Passenger no-show'}
          </button>
        )}

        {noShowError && <p className="mt-2 text-sm text-red-600">{noShowError}</p>}

        {['completed', 'cancelled'].includes(trip.status) && (
          <button
            onClick={() => router.push('/dashboard')}
            className="h-14 w-full rounded-2xl bg-signal text-base font-bold text-ink active:bg-signal-dark"
          >
            Back to dashboard
          </button>
        )}

        <button
          onClick={() => router.push('/history')}
          className="mt-2 h-10 w-full rounded-xl text-sm font-semibold text-mute active:bg-mist"
        >
          View trip history
        </button>
      </div>
    </div>
  )
}
