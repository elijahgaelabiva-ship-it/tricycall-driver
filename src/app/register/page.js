'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LiveCamera from '@/components/LiveCamera'
import { uploadAvatar } from '@/lib/avatar'
import { normalizePhone, isValidPhone, phoneToAuthEmail } from '@/lib/phone'
import AuthShell, { inputClass, labelClass } from '@/components/AuthShell'

export default function DriverRegisterPage() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [photo, setPhoto] = useState(null) // { blob, url }
  const router = useRouter()

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')

    const normalizedPhone = normalizePhone(phone)

    if (!isValidPhone(normalizedPhone)) {
      setError('Please enter a valid PH mobile number (e.g. 09171234567).')
      return
    }

    if (!photo) {
      setError('Please take your photo with the camera.')
      return
    }

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: phoneToAuthEmail(normalizedPhone),
      password,
    })

    if (signUpError) {
      if (signUpError.message.toLowerCase().includes('already registered')) {
        setError('This phone number is already registered. Try logging in instead.')
      } else {
        setError(signUpError.message)
      }
      setLoading(false)
      return
    }

    if (!data.session) {
      setError('Account created, but could not sign you in automatically. Please try logging in.')
      setLoading(false)
      return
    }

    const userId = data.user.id

    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      full_name: fullName,
      phone: normalizedPhone,
      role: 'driver',
    })

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    // Save the live camera photo. If this fails the account is still created
    // and the driver can retake it later from their profile page.
    const { error: photoError } = await uploadAvatar(userId, photo.blob)
    if (photoError) console.log('Photo upload error:', photoError)

    const { error: driverError } = await supabase.from('drivers').insert({
      id: userId,
      license_number: licenseNumber,
      is_approved: false,
      is_online: false,
    })

    if (driverError) {
      setError(driverError.message)
      setLoading(false)
      return
    }

    const { error: vehicleError } = await supabase.from('vehicles').insert({
      driver_id: userId,
      plate_number: plateNumber,
      model: vehicleModel,
    })

    if (vehicleError) {
      setError(vehicleError.message)
      setLoading(false)
      return
    }

    router.push('/pending-approval')
  }

  return (
    <AuthShell title="Become a driver" subtitle="Register your tricycle and start earning.">
      {showCamera && (
        <LiveCamera
          onCapture={(blob) => {
            setPhoto({ blob, url: URL.createObjectURL(blob) })
            setShowCamera(false)
          }}
          onCancel={() => setShowCamera(false)}
        />
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
        )}

        <div className="flex flex-col items-center gap-2">
          {photo ? (
            <img src={photo.url} alt="Your photo" className="h-24 w-24 rounded-full object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-mist text-mute">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            className="h-10 rounded-xl px-4 text-sm font-bold text-ink underline underline-offset-2 active:bg-mist"
          >
            {photo ? 'Retake photo' : 'Take your photo (required)'}
          </button>
          <p className="text-center text-xs text-mute">
            Your photo is taken with the camera. Gallery uploads aren't allowed.
          </p>
        </div>

        <div>
          <label htmlFor="fullName" className={labelClass}>
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            placeholder="Juan Dela Cruz"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone number
          </label>
          <input
            id="phone"
            type="tel"
            placeholder="09171234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            inputMode="tel"
            autoComplete="tel"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className={inputClass}
          />
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-sm font-extrabold text-ink">Your documents and tricycle</p>
          <p className="mt-0.5 text-xs text-mute">An admin reviews these before you can go online.</p>
        </div>

        <div>
          <label htmlFor="license" className={labelClass}>
            Driver's license number
          </label>
          <input
            id="license"
            type="text"
            placeholder="Your license number"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="plate" className={labelClass}>
            Tricycle plate number
          </label>
          <input
            id="plate"
            type="text"
            placeholder="ABC1234"
            value={plateNumber}
            onChange={(e) => setPlateNumber(e.target.value)}
            required
            autoCapitalize="characters"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="model" className={labelClass}>
            Tricycle model and color
          </label>
          <input
            id="model"
            type="text"
            placeholder="e.g. Honda TMX, green"
            value={vehicleModel}
            onChange={(e) => setVehicleModel(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="h-14 w-full rounded-2xl bg-signal text-base font-bold text-ink active:bg-signal-dark disabled:opacity-50"
        >
          {loading ? 'Registering...' : 'Register as driver'}
        </button>

        <p className="text-center text-sm text-mute">
          Already have an account?{' '}
          <a href="/login" className="font-bold text-ink underline underline-offset-2">
            Log in
          </a>
        </p>
      </form>
    </AuthShell>
  )
}
