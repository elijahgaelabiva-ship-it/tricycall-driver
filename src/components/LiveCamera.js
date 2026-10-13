'use client'

import { useEffect, useRef, useState } from 'react'

// Full-screen live camera. There is no file picker: the only way to get a photo
// is to take it with the camera right now, so gallery/fake photos can't be used.
export default function LiveCamera({ onCapture, onCancel, facingMode = 'user' }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [shot, setShot] = useState(null) // { blob, url }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  useEffect(() => {
    if (shot) return
    let cancelled = false

    const start = async () => {
      setError('')
      setReady(false)
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('This browser cannot open the camera. Please use Chrome and try again.')
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch (err) {
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access for this site in your browser settings, then try again.'
            : 'Could not open the camera. Close other apps using the camera and try again.'
        )
      }
    }

    start()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [shot, facingMode])

  useEffect(() => {
    return () => {
      if (shot?.url) URL.revokeObjectURL(shot.url)
    }
  }, [shot])

  const takePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    const scale = Math.min(1, 960 / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Could not take the photo. Please try again.')
          return
        }
        stopCamera()
        setShot({ blob, url: URL.createObjectURL(blob) })
      },
      'image/jpeg',
      0.85
    )
  }

  const mirror = facingMode === 'user'

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex-1 relative overflow-hidden">
        {shot ? (
          <img src={shot.url} alt="Your photo" className="w-full h-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
            style={mirror ? { transform: 'scaleX(-1)' } : undefined}
          />
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="text-white text-center text-sm bg-red-600/90 rounded-xl p-4">{error}</p>
          </div>
        )}
      </div>

      <div className="bg-black px-6 py-5 flex items-center justify-between gap-3">
        {shot ? (
          <>
            <button
              type="button"
              onClick={() => setShot(null)}
              className="text-white text-sm font-semibold px-4 py-3"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={() => onCapture(shot.blob)}
              className="bg-green-600 text-white rounded-xl px-6 py-3 font-semibold"
            >
              Use this photo
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="text-white text-sm font-semibold px-4 py-3"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={takePhoto}
              disabled={!ready}
              aria-label="Take photo"
              className="w-16 h-16 rounded-full bg-white border-4 border-gray-400 disabled:opacity-40"
            />
            <span className="w-16" />
          </>
        )}
      </div>
    </div>
  )
}
