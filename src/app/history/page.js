'use client'

import { useEffect, useState } from 'react'
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
  const totalEarnings = completedTrips.reduce((sum, t) => sum + Number(t.fare || 0), 0)

  return (
    <div className="min-h-screen bg-mist">
      <div className="mx-auto w-full max-w-md pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <PageHeader title="Trip history" backLabel="Dashboard">
          {!loading && (
            <div className="mt-4">
              <p className="text-xs text-white/60">Total earnings</p>
              <p className="text-4xl font-extrabold tabular-nums">
                ₱{totalEarnings.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-sm text-white/70">
                {completedTrips.length} completed {completedTrips.length === 1 ? 'trip' : 'trips'}
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
          ) : trips.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
              <p className="font-bold text-ink">No trips yet</p>
              <p className="mx-auto mt-1 max-w-[16rem] text-sm leading-relaxed text-mute">
                Your completed rides and earnings will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map((trip) => {
                const status = STATUS_STYLES[trip.status] || STATUS_STYLES.requested
                const when = new Date(trip.requested_at)

                return (
                  <article key={trip.id} className="rounded-2xl border border-line bg-white p-4">
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
