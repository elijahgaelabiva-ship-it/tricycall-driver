'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { normalizePhone, isValidPhone, phoneToAuthEmail } from '@/lib/phone'

export default function DriverLoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')

    const normalizedPhone = normalizePhone(phone)

    if (!isValidPhone(normalizedPhone)) {
      setError('Please enter a valid PH mobile number (e.g. 09171234567).')
      return
    }

    setLoading(true)

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: phoneToAuthEmail(normalizedPhone),
      password,
    })

    if (loginError) {
      setError('Incorrect phone number or password.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-4"
      >
        <h1 className="text-2xl font-bold text-center text-green-600">
          Driver Login
        </h1>
        <p className="text-center text-gray-500 text-sm">TRICYCALL.SF</p>

        {error && (
          <p className="text-red-600 text-sm text-center bg-red-50 p-2 rounded">
            {error}
          </p>
        )}

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
          className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold hover:bg-green-700 transition disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>

        <p className="text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <a href="/register" className="text-green-600 font-medium">
            Register
          </a>
        </p>
      </form>
    </div>
  )
}