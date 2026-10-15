'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { normalizePhone, isValidPhone, phoneToAuthEmail } from '@/lib/phone'
import AuthShell, { inputClass, labelClass } from '@/components/AuthShell'

export default function DriverLoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingIntro, setCheckingIntro] = useState(true)
  const router = useRouter()

  // Show the intro/onboarding slideshow every time someone lands on login —
  // except immediately after they just finished it (intro.html redirects
  // back here with ?from=intro), which prevents an infinite redirect loop
  // while still showing the intro on every fresh visit to the app.
  useEffect(() => {
    const init = async () => {
      // Already logged in (session saved on this phone)? Skip login and intro
      // and go straight to the dashboard.
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (session) {
        router.replace('/dashboard')
        return
      }

      const fromIntro = new URLSearchParams(window.location.search).get('from') === 'intro'

      if (!fromIntro) {
        window.location.href = '/intro.html'
        return
      }
      setCheckingIntro(false)
    }

    init()
  }, [router])

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

  if (checkingIntro) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mist">
        <p className="text-mute font-medium">Loading...</p>
      </div>
    )
  }

  return (
    <AuthShell title="Driver log in" subtitle="Log in to start receiving ride requests.">
      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>
        )}

        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone number
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="09171234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
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
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="h-14 w-full rounded-2xl bg-signal text-base font-bold text-ink active:bg-signal-dark disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>

        <p className="text-center text-sm text-mute">
          New driver?{' '}
          <a href="/register" className="font-bold text-ink underline underline-offset-2">
            Create an account
          </a>
        </p>
      </form>
    </AuthShell>
  )
}
