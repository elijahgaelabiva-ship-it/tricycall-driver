'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'

const STATUS_STYLES = {
  requested: { label: 'Requested', className: 'bg-mist text-mute' },
  accepted: { label: 'Heading to pickup', className: 'bg-blue-50 text-blue-700' },
  arrived: { label: 'At pickup', className: 'bg-blue-50 text-blue-700' },
  ongoing: { label: 'In progress', className: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Completed', className: 'bg-[#e3f4ea] text-[#1f7a48]' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-600' },
}

const PERIODS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
]

// First moment of the day / week (Monday) / month / year containing `date`.
function startOfPeriod(date, period) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (period === 'month') d.setDate(1)
  if (period === 'year') d.setMonth(0, 1)
  return d
}

// Moves a period start forward/back by n periods.
function shiftPeriod(start, period, n) {
  const d = new Date(start)
  if (period === 'day') d.setDate(d.getDate() + n)
  if (period === 'week') d.setDate(d.getDate() + 7 * n)
  if (period === 'month') d.setMonth(d.getMonth() + n)
  if (period === 'year') d.setFullYear(d.getFullYear() + n)
  return d
}

function periodLabel(start, period) {
  const fmt = (d, opts) => d.toLocaleDateString('en-PH', opts)

  if (period === 'day') {
    return fmt(start, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (period === 'week') {
    const end = shiftPeriod(start, 'day', 6)
    const sameYear = start.getFullYear() === end.getFullYear()
    return `${fmt(start, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} – ${fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  if (period === 'month') return fmt(start, { month: 'long', year: 'numeric' })
  return String(start.getFullYear())
}

function currentPeriodName(period) {
  return { day: 'Today', week: 'This week', month: 'This month', year: 'This year' }[period]
}

// A completed trip counts toward the day it was completed; anything else
// toward the day it was requested.
function tripDate(trip) {
  const raw = trip.status === 'completed' && trip.completed_at ? trip.completed_at : trip.requested_at
  return new Date(raw)
}

function money(n) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ChevronButton({ direction, onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20 disabled:opacity-30"
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
        <path d={direction === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
      </svg>
    </button>
  )
}

export default function DriverHistoryPage() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('day')
  const [anchor, setAnchor] = useState(() => new Date())
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

  const start = useMemo(() => startOfPeriod(anchor, period), [anchor, period])
  const end = useMemo(() => shiftPeriod(start, period, 1), [start, period])

  const now = new Date()
  const isCurrent = now >= start && now < end
  const canGoNext = end <= now

  const periodTrips = useMemo(
    () =>
      trips
        .filter((t) => {
          const d = tripDate(t)
          return d >= start && d < end
        })
        .sort((a, b) => tripDate(b) - tripDate(a)),
    [trips, start, end]
  )

  const completedTrips = periodTrips.filter((t) => t.status === 'completed')
  const totalEarnings = completedTrips.reduce((sum, t) => sum + Number(t.fare || 0), 0)
  const totalKm = completedTrips.reduce((sum, t) => sum + Number(t.distance_km || 0), 0)

  const goPrev = () => setAnchor(shiftPeriod(start, period, -1))
  const goNext = () => setAnchor(shiftPeriod(start, period, 1))
  const goCurrent = () => setAnchor(new Date())

  return (
    <div className="min-h-screen bg-mist">
      <div className="mx-auto w-full max-w-md pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <PageHeader title="Trip history" backLabel="Dashboard">
          {/* Day / Week / Month / Year */}
          <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-white/10 p-1" role="tablist">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                role="tab"
                aria-selected={period === p.key}
                onClick={() => setPeriod(p.key)}
                className={`h-9 rounded-lg text-sm font-bold ${
                  period === p.key ? 'bg-signal text-ink' : 'text-white/80 active:bg-white/10'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Previous / current range / next */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <ChevronButton direction="prev" onClick={goPrev} label="Previous period" />
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-bold">{periodLabel(start, period)}</p>
              {!isCurrent && (
                <button
                  onClick={goCurrent}
                  className="mt-0.5 text-xs font-semibold text-signal active:opacity-70"
                >
                  Jump to {currentPeriodName(period).toLowerCase()}
                </button>
              )}
            </div>
            <ChevronButton direction="next" onClick={goNext} disabled={!canGoNext} label="Next period" />
          </div>

          {!loading && (
            <div className="mt-4">
              <p className="text-xs text-white/60">Earnings</p>
              <p className="text-4xl font-extrabold tabular-nums">{money(totalEarnings)}</p>
              <p className="mt-1 text-sm text-white/70">
                {completedTrips.length} completed {completedTrips.length === 1 ? 'trip' : 'trips'}
                {completedTrips.length > 0 && ` • ${totalKm.toFixed(1)} km`}
              </p>
            </div>
          )}
        </PageHeader>

        <main className="mx-4 mt-4">
          {loading ? (
            <div className="space-y-3 motion-safe:animate-pulse" aria-busy="true">
              <div className="h-24 rounded-2xl bg-white" />
              <div className="h-24 rounded-2xl bg-white" />
              <div className="h-24 rounded-2xl bg-white" />
            </div>
          ) : periodTrips.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
              <p className="font-bold text-ink">No trips in this period</p>
              <p className="mx-auto mt-1 max-w-[16rem] text-sm leading-relaxed text-mute">
                Try another {period} to see your rides and earnings.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {periodTrips.map((trip) => {
                const status = STATUS_STYLES[trip.status] || STATUS_STYLES.requested
                const when = new Date(trip.requested_at)

                return (
                  <article
                    key={trip.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => router.push(`/history/${trip.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        router.push(`/history/${trip.id}`)
                      }
                    }}
                    className="cursor-pointer rounded-2xl border border-line bg-white p-4 active:bg-mist"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-2xl font-extrabold tabular-nums text-ink">
                        ₱{Number(trip.fare || 0).toFixed(2)}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-mute">
                      {Number(trip.distance_km || 0).toFixed(2)} km
                    </p>
                    <p className="mt-2 text-xs text-mute">
                      {when.toLocaleDateString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      {', '}
                      {when.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </article>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
