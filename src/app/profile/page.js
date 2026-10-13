'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LiveCamera from '@/components/LiveCamera'
import { uploadAvatar } from '@/lib/avatar'

export default function DriverProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [driver, setDriver] = useState(null)
  const [vehicle, setVehicle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [showCamera, setShowCamera] = useState(false)

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

  const handlePhoto = async (blob) => {
    setShowCamera(false)
    setUploading(true)
    setUploadError('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { url, error } = await uploadAvatar(user.id, blob)
    if (error) {
      setUploadError(error)
      setUploading(false)
      return
    }

    setProfile((prev) => ({ ...prev, avatar_url: url }))
    setUploading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white px-4 py-8 flex flex-col items-center">
      {showCamera && (
        <LiveCamera onCapture={handlePhoto} onCancel={() => setShowCamera(false)} />
      )}
      <button
        onClick={() => router.push('/dashboard')}
        className="self-start text-sm text-gray-500 underline mb-4"
      >
        ← Back to Dashboard
      </button>

      <h1 className="text-2xl font-bold text-green-600 mb-6">My Profile</h1>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt="Your photo"
            className="w-28 h-28 rounded-full object-cover mx-auto"
          />
        ) : (
          <div className="w-28 h-28 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-3xl mx-auto">
            {profile?.full_name?.charAt(0).toUpperCase() || '?'}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            disabled={uploading}
            className="inline-block bg-green-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : '📷 Take New Photo'}
          </button>
        </div>

        {uploadError && (
          <p className="text-red-600 text-sm">{uploadError}</p>
        )}

        <div className="text-left pt-4 border-t border-gray-100 space-y-2">
          <div>
            <p className="text-xs text-gray-500">Name</p>
            <p className="font-semibold text-gray-800">{profile?.full_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Phone</p>
            <p className="font-semibold text-gray-800">{profile?.phone}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">License Number</p>
            <p className="font-semibold text-gray-800">{driver?.license_number}</p>
          </div>
          {vehicle && (
            <div>
              <p className="text-xs text-gray-500">Vehicle</p>
              <p className="font-semibold text-gray-800">
                {vehicle.model} {vehicle.color ? `(${vehicle.color})` : ''}
              </p>
              <p className="text-sm text-gray-600">{vehicle.plate_number}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
