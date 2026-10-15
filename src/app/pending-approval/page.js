export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-mist px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </div>

        <h1 className="mt-4 text-xl font-extrabold text-ink">Registration submitted</h1>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          An admin is reviewing your documents. You'll start receiving ride requests as soon as
          your account is approved.
        </p>

        <a
          href="/dashboard"
          className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-signal font-bold text-ink active:bg-signal-dark"
        >
          Check my status
        </a>
      </div>
    </div>
  )
}
