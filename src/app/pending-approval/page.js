export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-bold text-green-600">Registration Submitted!</h1>
        <p className="text-gray-600">
          Your account is pending admin approval. You'll be able to go online
          once an admin approves your documents.
        </p>
      </div>
    </div>
  )
}