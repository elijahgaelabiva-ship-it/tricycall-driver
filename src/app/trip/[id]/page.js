'use client'

import { useEffect, useState } from 'react'
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

  // Keep tracking + broadcasting the driver's live GPS position while this trip is active.
  useEffect(() => {
    if (!trip) return
    if (['completed', 'cancelled'].includes(trip.status)) return
    if (!navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        setDriverLocation({ lat, lng })

        const { error } = await supabase
          .from('drivers')
          .update({ current_lat: lat, current_lng: lng })
          .eq('id', trip.driver_id)

        if (error) console.log('Location update error:', error)
      },
      (error) => console.log('Location error:', error),
      { enableHighAccuracy: true }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [trip?.status, trip?.driver_id])

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
    accepted: { label: 'I Have Arrived', next: 'arrived' },
    arrived: { label: 'Start Trip', next: 'ongoing' },
    ongoing: { label: 'Complete Trip', next: 'completed' },
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  const step = nextStepMap[trip.status]

  // Show the pickup point while heading to/waiting for the passenger,
  // switch to the dropoff point once the trip is ongoing.
  const targetLocation =
    trip.status === 'ongoing'
      ? { lat: trip.dropoff_lat, lng: trip.dropoff_lng }
      : { lat: trip.pickup_lat, lng: trip.pickup_lng }

  const showMap = driverLocation && !['completed', 'cancelled'].includes(trip.status)

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="text-center px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-green-600 capitalize">
          Trip {trip.status}
        </h1>

        <div className="text-gray-700 mt-1">
          <p>Fare: ₱{Number(trip.fare).toFixed(2)}</p>
          <p>Distance: {Number(trip.distance_km).toFixed(2)} km</p>
        </div>
      </div>

      {showMap && (
        <div style={{ height: '350px', width: '100%', position: 'relative' }}>
          <MapView driverLocation={driverLocation} targetLocation={targetLocation} />
        </div>
      )}

      {!showMap && !['completed', 'cancelled'].includes(trip.status) && (
        <p className="text-center text-sm text-gray-400 px-4 pb-2">
          Getting your location...
        </p>
      )}

      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="text-center space-y-4 w-full max-w-sm">
          {step && (
            <button
              onClick={() => updateStatus(step.next)}
              disabled={updating}
              className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold hover:bg-green-700 transition disabled:opacity-50"
            >
              {updating ? 'Updating...' : step.label}
            </button>
          )}

          {trip.status === 'arrived' && (
            <button
              onClick={reportNoShow}
              disabled={reportingNoShow}
              className="w-full bg-red-100 text-red-600 rounded-xl py-3 font-semibold hover:bg-red-200 transition disabled:opacity-50"
            >
              {reportingNoShow ? 'Reporting...' : 'Passenger No-Show'}
            </button>
          )}

          {noShowError && (
            <p className="text-red-600 text-sm">{noShowError}</p>
          )}

          {trip.status === 'completed' && (
            <p className="text-gray-500">This trip is complete. Nice work!</p>
          )}

          <button
            onClick={() => router.push('/history')}
            className="text-green-600 text-sm font-medium"
          >
            View Trip History
          </button>
        </div>
      </div>
    </div>
  )
}