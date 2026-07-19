'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { normalizePhone, isValidPhone, phoneToAuthEmail } from '@/lib/phone'

export default function DriverRegisterPage() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [plateNumber, setPlateNumber] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')

    const normalizedPhone = normalizePhone(phone)

    if (!isValidPhone(normalizedPhone)) {
      setError('Please enter a valid PH mobile number (e.g. 09171234567).')
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
    <div className="min-h-screen flex items-center justify-center bg-white px-4 py-8">
      <form
        onSubmit={handleRegister}
        className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center text-green-600">
          Driver Registration
        </h1>
        <p className="text-center text-gray-500 text-sm">TRICYCALL.SF</p>

        {error && (
          <p className="text-red-600 text-sm text-center bg-red-50 p-2 rounded">
            {error}
          </p>
        )}

        <input
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <input
          type="tel"
          placeholder="Phone Number (e.g. 09171234567)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <input
          type="text"
          placeholder="Driver's License Number"
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <input
          type="text"
          placeholder="Tricycle Plate Number"
          value={plateNumber}
          onChange={(e) => setPlateNumber(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <input
          type="text"
          placeholder="Tricycle Model/Color"
          value={vehicleModel}
          onChange={(e) => setVehicleModel(e.target.value)}
          required
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold hover:bg-green-700 transition disabled:opacity-50"
        >
          {loading ? 'Registering...' : 'Register as Driver'}
        </button>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <a href="/login" className="text-green-600 font-medium">
            Login
          </a>
        </p>
      </form>
    </div>
  )
}