'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DriverTripPage() {
  const { id } = useParams()
  const router = useRouter()
  const [trip, setTrip] = useState(null)
  const [updating, setUpdating] = useState(false)

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center space-y-4 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-green-600 capitalize">
          Trip {trip.status}
        </h1>

        <div className="text-gray-700">
          <p>Fare: ₱{Number(trip.fare).toFixed(2)}</p>
          <p>Distance: {Number(trip.distance_km).toFixed(2)} km</p>
        </div>

        {step && (
          <button
            onClick={() => updateStatus(step.next)}
            disabled={updating}
            className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold hover:bg-green-700 transition disabled:opacity-50"
          >
            {updating ? 'Updating...' : step.label}
          </button>
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
  )
}