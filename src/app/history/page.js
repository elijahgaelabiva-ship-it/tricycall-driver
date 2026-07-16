'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function DriverHistoryPage() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const loadTrips = async () => {
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
        .eq('driver_id', user.id)
        .order('requested_at', { ascending: false })

      setTrips(data || [])
      setLoading(false)
    }

    loadTrips()
  }, [router])

  const completedTrips = trips.filter((t) => t.status === 'completed')
  const totalEarnings = completedTrips.reduce(
    (sum, t) => sum + Number(t.fare || 0),
    0
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white px-4 py-8">
      <h1 className="text-2xl font-bold text-green-600 text-center mb-2">
        Trip History
      </h1>
      <p className="text-center text-gray-500 mb-6">
        Total Earnings:{' '}
        <span className="font-bold text-green-700">
          ₱{totalEarnings.toFixed(2)}
        </span>{' '}
        ({completedTrips.length} completed trips)
      </p>

      {trips.length === 0 ? (
        <p className="text-center text-gray-400">No trips yet.</p>
      ) : (
        <div className="max-w-sm mx-auto space-y-3">
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold capitalize text-gray-700">
                  {trip.status}
                </span>
                <span className="text-sm text-gray-400">
                  {new Date(trip.requested_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Distance: {Number(trip.distance_km || 0).toFixed(2)} km
              </p>
              <p className="font-semibold text-green-700">
                ₱{Number(trip.fare || 0).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}