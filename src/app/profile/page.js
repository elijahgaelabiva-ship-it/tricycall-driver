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
      <div className="min-h-screen bg-mist" aria-busy="true">
        <div className="mx-auto w-full max-w-md">
          <div className="h-72 rounded-b-[28px] bg-ink" />
          <div className="mx-4 mt-4 space-y-3 motion-safe:animate-pulse">
            <div className="h-36 rounded-2xl bg-white" />
            <div className="h-40 rounded-2xl bg-white" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-mist">
      {showCamera && (
        <LiveCamera onCapture={handlePhoto} onCancel={() => setShowCamera(false)} />
      )}

      <div className="mx-auto w-full max-w-md pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="rounded-b-[28px] bg-ink px-5 pb-7 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
          <button
            onClick={() => router.push('/dashboard')}
            className="-ml-3 flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-white/80 active:bg-white/10"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Dashboard
          </button>

          <div className="mt-3 flex flex-col items-center text-center">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Your photo"
                className="h-28 w-28 rounded-full object-cover ring-2 ring-white/30 ring-offset-2 ring-offset-ink"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white/10 text-4xl font-bold">
                {profile?.full_name?.charAt(0).toUpperCase() || '?'}
              </div>
            )}

            <h1 className="mt-4 text-2xl font-bold">{profile?.full_name}</h1>
            <p className="text-sm text-white/70">TRICYCALL.SF Driver</p>

            <button
              type="button"
              onClick={() => setShowCamera(true)}
              disabled={uploading}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-white/10 px-5 text-sm font-semibold active:bg-white/20 disabled:opacity-50"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              {uploading ? 'Saving photo...' : 'Take new photo'}
            </button>

            {uploadError && (
              <p className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-100">
                {uploadError}
              </p>
            )}
          </div>
        </header>

        <section className="mx-4 mt-4 rounded-2xl border border-line bg-white px-4">
          <div className="flex items-center justify-between gap-4 border-b border-line py-3.5">
            <p className="text-sm text-mute">Phone</p>
            <p className="font-semibold text-ink">{profile?.phone || '—'}</p>
          </div>
          <div className="flex items-center justify-between gap-4 py-3.5">
            <p className="text-sm text-mute">License number</p>
            <p className="font-semibold text-ink">{driver?.license_number || '—'}</p>
          </div>
        </section>

        {vehicle && (
          <section className="mx-4 mt-3 rounded-2xl border border-line bg-white p-4">
            <p className="text-sm text-mute">Vehicle</p>

            <div className="relative mx-auto mt-3 w-fit max-w-full rounded-lg border-[3px] border-ink bg-white p-1">
              <div className="rounded-[5px] border border-ink/25 px-9 pb-1.5 pt-1 text-center">
                <p className="text-[9px] font-bold tracking-[0.3em] text-ink/70">PHILIPPINES</p>
                <p className="font-mono text-3xl font-black leading-tight tracking-[0.14em] text-ink">
                  {vehicle.plate_number}
                </p>
              </div>
              <span className="absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-ink/25" />
              <span className="absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-ink/25" />
            </div>

            <p className="mt-3 text-center font-semibold text-ink">
              {vehicle.model}
              {vehicle.color ? `, ${vehicle.color}` : ''}
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
