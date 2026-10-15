// Shared layout for the login and register screens: a dark brand band with
// the form card overlapping its bottom edge.

export const labelClass = 'text-sm font-semibold text-ink'

export const inputClass =
  'mt-1.5 h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink placeholder:text-mute/60 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15'

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-mist">
      <div className="mx-auto w-full max-w-md">
        <header className="rounded-b-[28px] bg-ink px-6 pb-12 pt-[max(2rem,env(safe-area-inset-top))] text-white">
          <p className="text-sm font-bold text-white/80">TRICYCALL.SF</p>
          <h1 className="mt-6 text-3xl font-extrabold leading-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-white/70">{subtitle}</p>}
        </header>

        <main className="-mt-6 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div className="rounded-2xl border border-line bg-white p-5">{children}</div>
        </main>
      </div>
    </div>
  )
}
