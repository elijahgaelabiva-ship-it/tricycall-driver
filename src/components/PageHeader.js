'use client'

import { useRouter } from 'next/navigation'

// Dark header band with a back button and title, shared by the inner screens.
export default function PageHeader({ title, backHref = '/dashboard', backLabel = 'Back', children }) {
  const router = useRouter()

  return (
    <header className="rounded-b-[28px] bg-ink px-5 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
      <button
        onClick={() => router.push(backHref)}
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
        {backLabel}
      </button>
      <h1 className="mt-2 text-2xl font-extrabold">{title}</h1>
      {children}
    </header>
  )
}
