'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { reversePlaceName } from '@/lib/place'
import PageHeader from '@/components/PageHeader'

const TripSummaryMap = dynamic(() => import('@/components/TripSummaryMap'), { ssr: false })

const STATUS_STYLES = {
  requested: { label: 'Requested', className: 'bg-mist text-mute' },
  accepted: { label: 'Heading to pickup', className: 'bg-blue-50 text-blue-700' },
  arrived: { label: 'At pickup', className: 'bg-blue-50 text-blue-700' },
  ongoing: { label: 'In progress', className: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Completed', className: 'bg-[#e3f4ea] text-[#1f7a48]' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-600' },
}

function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  return `${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}, ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
}

// Passenger photo, falling back to their initial if there's no photo
// or it fails to load.
function PassengerAvatar({ url, name }) {
  const [failed, setFailed] = useState(false)

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name ? `${name}'s photo` : 'Passenger photo'}
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    )
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-bold text-ink">
      {name?.charAt(0).toUpperCase() || '?'}
    </div>
  )
}

function PlaceRow({ label, dotClass, name, loading }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
      <div className="min-w-0">
        <p className="text-[11px] leading-tight text-mute">{label}</p>
        {loading ? (
          <div className="mt-1 h-3.5 w-40 rounded bg-mist motion-safe:animate-pulse" />
        ) : (
          <p className="text-sm font-semibold leading-snug text-ink">{name || 'Location unavailable'}</p>
        )}
      </div>
    </div>
  )
}

export default function TripDetailsPage() {
  const { id } = useParams()
  const router = useRouter()
  const [trip, setTrip] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pickupName, setPickupName] = useState(null)
  const [dropoffName, setDropoffName] = useState(null)
  const [namesLoading, setNamesLoading] = useState(true)
  const [passenger, setPassenger] = useState(null)
  const [passengerLoading, setPassengerLoading] = useState(true)
  const [passengerError, setPassengerError] = useState('')

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .eq('driver_id', user.id)
        .single()

      setTrip(data)
      setLoading(false)
    }
    load()
  }, [id, router])

  // Passenger name + phone, via the same safe database function the live
  // trip screen uses (rather than reading profiles directly).
  useEffect(() => {
    if (!trip) return
    let cancelled = false

    const loadPassenger = async () => {
      setPassengerLoading(true)
      setPassengerError('')

      const { data, error } = await supabase.rpc('get_trip_passenger_contact', {
        target_trip_id: trip.id,
      })

      if (cancelled) return

      if (error) {
        console.log('Could not load passenger contact:', error.message)
        setPassengerError(error.message)
      } else if (data && data.length > 0) {
        setPassenger(data[0])
      }
      setPassengerLoading(false)
    }

    loadPassenger()
    return () => {
      cancelled = true
    }
  }, [trip])

  // Show a barangay / place name, never raw coordinates. Prefer a saved
  // address on the trip; otherwise look the name up from the coordinates.
  useEffect(() => {
    if (!trip) return
    let cancelled = false

    const resolve = async () => {
      setNamesLoading(true)

      const pickup =
        trip.pickup_address ||
        (await reversePlaceName(trip.pickup_lat, trip.pickup_lng))

      // Nominatim asks for at most ~1 request/second.
      const needsDropoffLookup = !trip.dropoff_address
      if (needsDropoffLookup && !trip.pickup_address) {
        await new Promise((r) => setTimeout(r, 1100))
      }

      const dropoff =
        trip.dropoff_address ||
        (await reversePlaceName(trip.dropoff_lat, trip.dropoff_lng))

      if (cancelled) return
      setPickupName(pickup)
      setDropoffName(dropoff)
      setNamesLoading(false)
    }

    resolve()
    return () => {
      cancelled = true
    }
  }, [trip])

  if (loading) {
    return (
      <div className="min-h-screen bg-mist" aria-busy="true">
        <div className="mx-auto w-full max-w-md">
          <div className="h-44 rounded-b-[28px] bg-ink" />
          <div className="mx-4 mt-4 h-64 rounded-2xl bg-white motion-safe:animate-pulse" />
        </div>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="min-h-screen bg-mist">
        <div className="mx-auto w-full max-w-md">
          <PageHeader title="Trip details" backHref="/history" backLabel="Trip history" />
          <p className="mx-4 mt-6 text-center text-sm text-mute">Trip not found.</p>
        </div>
      </div>
    )
  }

  const status = STATUS_STYLES[trip.status] || STATUS_STYLES.requested

  // Exact coordinates drive the pins; they are never displayed as text.
  const pickup =
    trip.pickup_lat != null && trip.pickup_lng != null
      ? { lat: Number(trip.pickup_lat), lng: Number(trip.pickup_lng) }
      : null
  const dropoff =
    trip.dropoff_lat != null && trip.dropoff_lng != null
      ? { lat: Number(trip.dropoff_lat), lng: Number(trip.dropoff_lng) }
      : null

  return (
    <div className="min-h-screen bg-mist">
      <div className="mx-auto w-full max-w-md pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <PageHeader title="Trip details" backHref="/history" backLabel="Trip history">
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-white/60">{trip.status === 'completed' ? 'You earned' : 'Fare'}</p>
              <p className="text-4xl font-extrabold tabular-nums">₱{Number(trip.fare || 0).toFixed(2)}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}>
              {status.label}
            </span>
          </div>
        </PageHeader>

        <main className="mx-4 mt-4 space-y-3">
          <section className="rounded-2xl border border-line bg-white px-3 py-2.5">
            <div className="space-y-2">
              <PlaceRow label="Pick-up" dotClass="bg-blue-600" name={pickupName} loading={namesLoading} />
              <PlaceRow label="Drop-off" dotClass="bg-red-500" name={dropoffName} loading={namesLoading} />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-white px-3 py-2.5">
            {passengerLoading ? (
              <div className="flex items-center gap-2.5 motion-safe:animate-pulse">
                <div className="h-9 w-9 rounded-full bg-mist" />
                <div className="space-y-1.5">
                  <div className="h-2.5 w-16 rounded bg-mist" />
                  <div className="h-3.5 w-28 rounded bg-mist" />
                </div>
              </div>
            ) : passenger ? (
              <div className="flex items-center gap-2.5">
                <PassengerAvatar url={passenger.avatar_url} name={passenger.full_name} />
                <div className="min-w-0">
                  <p className="text-[11px] leading-tight text-mute">Passenger</p>
                  <p className="truncate text-sm font-semibold text-ink">
                    {passenger.full_name || 'Passenger'}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[11px] leading-tight text-mute">Passenger</p>
                <p className="text-sm text-mute">
                  Details aren&apos;t available for this trip.
                  {passengerError && <span className="mt-1 block text-xs text-red-600">{passengerError}</span>}
                </p>
              </div>
            )}
          </section>

          {(pickup || dropoff) && (
            <section className="h-64 overflow-hidden rounded-2xl border border-line bg-white">
              <TripSummaryMap pickup={pickup} dropoff={dropoff} />
            </section>
          )}

          <section className="rounded-2xl border border-line bg-white p-4">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-mute">Distance</dt>
                <dd className="font-bold tabular-nums text-ink">
                  {Number(trip.distance_km || 0).toFixed(2)} km
                </dd>
              </div>
              <div>
                <dt className="text-xs text-mute">Requested</dt>
                <dd className="font-bold text-ink">{formatDateTime(trip.requested_at)}</dd>
              </div>
              {trip.completed_at && (
                <div className="col-span-2">
                  <dt className="text-xs text-mute">Completed</dt>
                  <dd className="font-bold text-ink">{formatDateTime(trip.completed_at)}</dd>
                </div>
              )}
            </dl>
          </section>
        </main>
      </div>
    </div>
  )
}
