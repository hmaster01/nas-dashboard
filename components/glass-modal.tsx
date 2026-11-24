'use client'

import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

type GlassModalProps = {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  /** Leading visual, usually an icon tile. */
  eyebrow?: ReactNode
  children: ReactNode
  /** Optional action row pinned to the bottom of the sheet. */
  footer?: ReactNode
}

/**
 * Centered glass sheet with a blurred scrim. Closes on Escape, on scrim click,
 * and locks background scrolling while open.
 */
export function GlassModal({ open, onClose, title, subtitle, eyebrow, children, footer }: GlassModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // onClose liegt in einem Ref, damit der Effekt nur beim Öffnen/Schließen läuft.
  // Sonst würde jedes Neurendern der Elternkomponente (z. B. durch die regelmäßigen
  // Messwert-Abfragen) den Fokus wieder in den Dialog zurückholen.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      {/* scrim */}
      <button
        type="button"
        aria-label="Dialog schließen"
        onClick={onClose}
        className="animate-in fade-in absolute inset-0 cursor-default bg-black/60 backdrop-blur-xl duration-300"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="animate-in fade-in slide-in-from-bottom-4 relative flex max-h-[88svh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[#101216]/95 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] ring-1 ring-white/12 outline-none backdrop-blur-2xl duration-400 ease-out sm:slide-in-from-bottom-2"
      >
        {/* top sheen */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/8 to-transparent"
        />

        <header className="relative flex items-start gap-4 px-6 pt-6 pb-5">
          {eyebrow}
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] leading-tight font-semibold tracking-tight text-white">{title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-white/45">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="grid size-8 shrink-0 place-items-center rounded-full text-white/50 ring-1 ring-white/10 transition-colors duration-300 hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </header>

        <div className="relative flex-1 overflow-y-auto px-6 pb-6">{children}</div>

        {footer ? (
          <div className="relative border-t border-white/8 bg-white/2 px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
