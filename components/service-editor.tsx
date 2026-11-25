'use client'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { GlassModal } from '@/components/glass-modal'
import { ICON_KEYS } from '@/lib/services'
import type { ServiceDto } from '@/lib/types'

const ICON_LABELS: Record<string, string> = {
  box: 'Container',
  boxes: 'Mehrere Container',
  server: 'Server',
  database: 'Datenbank',
  globe: 'Web',
  play: 'Medien',
  file: 'Dokumente',
  shield: 'Sicherheit',
  home: 'Haus',
}

type Props = {
  service: ServiceDto | null
  categories: string[]
  onClose: () => void
  onSaved: () => void
}

const field =
  'w-full rounded-xl bg-white/6 px-3 py-2 text-[14px] text-white ring-1 ring-white/10 placeholder:text-white/25 focus:ring-2 focus:ring-sky-400/70 focus:outline-none'
const label = 'mb-1 block text-[11px] font-medium tracking-[0.12em] text-white/40 uppercase'

/** Formular, mit dem ein Admin Name, Beschreibung, Kategorie, Symbol, Position und Sichtbarkeit eines Dienstes ändert. */
export function ServiceEditor({ service, categories, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [icon, setIcon] = useState('')
  const [order, setOrder] = useState('')
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Beim Öffnen nur mit den gespeicherten Anpassungen füllen. Ein leeres Feld heißt: automatisch (Label oder Container-Name).
  useEffect(() => {
    if (!service) return
    const saved = service.override ?? {}
    setName(saved.name ?? '')
    setDescription(saved.description ?? '')
    setCategory(saved.category ?? '')
    setIcon(saved.icon ?? '')
    setOrder(saved.order === undefined ? '' : String(saved.order))
    setHidden(Boolean(saved.hidden))
    setError('')
  }, [service])

  // Ohne gespeicherte Anpassung zeigt das Feld den automatischen Wert als Platzhalter.
  const auto = (value: string | undefined, saved: string | undefined) => (saved ? '' : (value ?? ''))

  async function send(override: Record<string, unknown> | null) {
    if (!service) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: service.id, override }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Fehler ${res.status}`)
      }
      onSaved()
      onClose()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Speichern fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const position = order.trim() === '' ? undefined : Number(order)
    send({
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      icon,
      hidden,
      ...(position !== undefined && Number.isInteger(position) ? { order: position } : {}),
    })
  }

  return (
    <GlassModal
      open={service !== null}
      onClose={onClose}
      title={service ? `„${service.name}“ anpassen` : ''}
      subtitle="Gilt für alle Nutzer und hat Vorrang vor den Docker-Labels. Leere Felder bleiben automatisch."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label className={label} htmlFor="edit-name">Name</label>
          <input id="edit-name" className={field} value={name} maxLength={60} placeholder={auto(service?.name, service?.override?.name)} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="edit-description">Beschreibung</label>
          <input id="edit-description" className={field} value={description} maxLength={160} placeholder={auto(service?.description, service?.override?.description)} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2">
          <div>
            <label className={label} htmlFor="edit-category">Kategorie</label>
            <input
              id="edit-category"
              className={field}
              list="edit-categories"
              value={category}
              maxLength={40}
              placeholder={auto(service?.category, service?.override?.category) || 'z. B. Medien'}
              onChange={(e) => setCategory(e.target.value)}
            />
            <datalist id="edit-categories">
              {categories.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={label} htmlFor="edit-icon">Symbol</label>
            <select id="edit-icon" className={field} value={icon} onChange={(e) => setIcon(e.target.value)}>
              <option value="" className="bg-[#101216]">
                Automatisch
              </option>
              {ICON_KEYS.map((key) => (
                <option key={key} value={key} className="bg-[#101216]">
                  {ICON_LABELS[key] ?? key}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 items-end gap-4 min-[440px]:grid-cols-2">
          <div>
            <label className={label} htmlFor="edit-order">Position (kleiner = weiter vorn)</label>
            <input
              id="edit-order"
              className={field}
              type="number"
              min={-999}
              max={999}
              step={1}
              value={order}
              placeholder="automatisch"
              onChange={(e) => setOrder(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-[14px] text-white/80">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="size-4 accent-sky-400" />
            Ausblenden
          </label>
        </div>

        {error ? (
          <p role="alert" className="rounded-2xl bg-rose-400/8 px-4 py-3 text-[13px] text-rose-200/90 ring-1 ring-rose-300/15">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => send(null)}
            className="rounded-full px-4 py-2 text-[13px] text-white/60 ring-1 ring-white/10 transition-colors duration-300 hover:bg-white/8 hover:text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
          >
            Zurücksetzen
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-white px-5 py-2 text-[13px] font-medium text-black transition-colors duration-300 hover:bg-white/85 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
          >
            {busy ? 'Speichert …' : 'Speichern'}
          </button>
        </div>
      </form>
    </GlassModal>
  )
}
