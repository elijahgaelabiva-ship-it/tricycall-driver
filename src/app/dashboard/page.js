'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DriverDashboardPage() {
  const [profile, setProfile] = useState(null)
  const [driver, setDriver] = useState(null)
  const [vehicle, setVehicle] = useState(null)
  const [avgRating, setAvgRating] = useState(null)
  const [ratingCount, setRatingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [pendingTrips, setPendingTrips] = useState([])
const [skippedIds, setSkippedIds] = useState([])  
const [accepting, setAccepting] = useState(null)
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

      setProfile(profileData)
      setDriver(driverData)
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

  const toggleOnline = async () => {
    setToggling(true)

    const newStatus = !driver.is_online

    const { error } = await supabase
      .from('drivers')
      .update({ is_online: newStatus })
      .eq('id', driver.id)

    if (!error) {
      setDriver({ ...driver, is_online: newStatus })
    }

    setToggling(false)
  }

  const acceptTrip = async (tripId) => {
    setAccepting(tripId)

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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!driver?.is_approved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-green-600">Pending Approval</h1>
          <p className="text-gray-600">
            Hi {profile?.full_name}, your account is still awaiting admin approval.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white px-4 py-4 flex flex-col items-center">
      <div
        onClick={() => router.push('/profile')}
        className="w-full max-w-sm bg-white rounded-2xl shadow-md p-4 mb-4 cursor-pointer hover:shadow-lg transition"
      >
        <div className="flex flex-col items-center text-center">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name}
              className="w-24 h-24 rounded-full object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-3xl">
              {profile?.full_name?.charAt(0).toUpperCase() || '?'}
            </div>
          )}

          <p className="font-semibold text-gray-800 mt-2">{profile?.full_name}</p>
          <p className="text-xs text-gray-500">TRICYCALL.SF Driver</p>
          <p className="text-sm text-yellow-500 mt-1">
            {ratingCount > 0
              ? `★ ${avgRating.toFixed(1)} (${ratingCount} ratings)`
              : 'New driver — no ratings yet'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-4 text-left">
          <div>
            <p className="text-xs text-gray-500">Contact Number</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{profile?.phone}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">License Number</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{driver?.license_number}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Plate Number</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{vehicle?.plate_number || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Vehicle Model</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{vehicle?.model || '—'}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-100">
          <p
            className={`text-sm font-bold ${
              driver.is_online ? 'text-green-600' : 'text-gray-400'
            }`}
          >
            {driver.is_online ? '● Online' : '● Offline'}
          </p>

          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleOnline()
            }}
            disabled={toggling}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
              driver.is_online
                ? 'bg-gray-400 hover:bg-gray-500'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {toggling ? '...' : driver.is_online ? 'Go Offline' : 'Go Online'}
          </button>
        </div>
      </div>

      {driver.is_online && (
        <div className="w-full max-w-sm flex-1">
          <h2 className="text-lg font-bold text-gray-700 mb-3">
            Ride Requests
          </h2>

          {pendingTrips.length === 0 ? (
            <p className="text-gray-400 text-sm text-center">
              No ride requests right now. Waiting...
            </p>
          ) : (
            <div className="space-y-3">
              {pendingTrips.map((trip) => (
                <div
                  key={trip.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                >
                  <p className="text-sm text-gray-500 mb-1">
                    Distance: {Number(trip.distance_km).toFixed(2)} km
                  </p>
                  <p className="font-semibold text-green-700 mb-3">
                    Fare: ₱{Number(trip.fare).toFixed(2)}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptTrip(trip.id)}
                      disabled={accepting === trip.id}
                      className="flex-1 bg-green-600 text-white rounded-xl py-2 font-semibold hover:bg-green-700 transition disabled:opacity-50"
                    >
                      {accepting === trip.id ? 'Accepting...' : 'Accept'}
                    </button>
                    <button
                      onClick={() => {
                        setSkippedIds((prev) => [...prev, trip.id])
                        setPendingTrips((prev) => prev.filter((t) => t.id !== trip.id))
                      }}
                      className="flex-1 bg-gray-200 text-gray-700 rounded-xl py-2 font-semibold hover:bg-gray-300 transition"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}