'use client'

import { useEffect, useState } from 'react'
import { DetailGroups } from '@/components/detail-groups'
import { GlassModal } from '@/components/glass-modal'
import { SYSTEM_METRICS } from '@/lib/dashboard-data'
import { formatUptime, legacyModalFor, legacyReadoutsFor, modalFor, readoutsFor } from '@/lib/metrics-view'
import type { MetricId, MetricModal, Readout } from '@/lib/metrics-view'
import type { SystemResponse } from '@/lib/types'

// Spaltenzahl je nach Anzahl der Kacheln (Tailwind braucht die Klassen als feste Zeichenketten).
const COLUMNS: Record<number, string> = {
  1: 'min-[560px]:grid-cols-1',
  2: 'min-[560px]:grid-cols-2',
  3: 'min-[560px]:grid-cols-3',
  4: 'min-[560px]:grid-cols-4',
}

function MetricButton({ readout, onOpen }: { readout: Readout; onOpen: (id: MetricId) => void }) {
  const Icon = SYSTEM_METRICS.find((metric) => metric.id === readout.id)?.icon

  return (
    <button
      type="button"
      onClick={() => onOpen(readout.id)}
      aria-label={`${readout.label} Details anzeigen`}
      className="group flex min-w-0 flex-col gap-2 rounded-2xl px-3 py-2.5 text-left transition-colors duration-500 ease-out hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
    >
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? (
          <Icon
            className="size-[15px] shrink-0 text-white/40 transition-colors duration-500 group-hover:text-sky-300"
            strokeWidth={1.75}
          />
        ) : null}
        <span className="truncate text-[11px] font-medium tracking-[0.12em] text-white/40 uppercase">
          {readout.label}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate font-mono text-[13px] tabular-nums text-white/90">{readout.value}</p>
        <p className="truncate text-[11px] text-white/35">{readout.caption}</p>
      </div>

      <div className="h-[3px] overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400/60 to-sky-300 transition-[width] duration-700 ease-out"
          style={{ width: `${readout.percent}%` }}
        />
      </div>
    </button>
  )
}

function readoutsOf(live: SystemResponse | null): Readout[] {
  if (!live) return readoutsFor(null)
  return live.source === 'agent' ? readoutsFor(live) : legacyReadoutsFor(live)
}

function modalOf(live: SystemResponse | null, id: MetricId): MetricModal | null {
  if (!live) return null
  return live.source === 'agent' ? modalFor(id, live) : legacyModalFor(id, live)
}

function uptimeOf(live: SystemResponse | null): number | null {
  if (!live) return null
  return live.source === 'agent' ? live.host.uptimeSeconds : live.uptimeSec
}

export function SystemStatusBar({ panels }: { panels: MetricId[] }) {
  const [openId, setOpenId] = useState<MetricId | null>(null)
  const [live, setLive] = useState<SystemResponse | null>(null)
  const [failed, setFailed] = useState(false)

  // Fragt alle 5 Sekunden die echten Werte über /api/system ab. Bei einem Fehler bleibt der letzte Stand stehen.
  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch('/api/system', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as SystemResponse
        if (!cancelled) {
          setLive(data)
          setFailed(false)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    poll()
    const id = window.setInterval(poll, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const readouts = readoutsOf(live)
  const shown = panels.map((id) => readouts.find((readout) => readout.id === id)).filter((r): r is Readout => Boolean(r))
  const columns = COLUMNS[Math.min(4, Math.max(1, shown.length))]

  const active = openId && panels.includes(openId) ? SYSTEM_METRICS.find((metric) => metric.id === openId) ?? null : null
  const modal = openId ? modalOf(live, openId) : null
  const ActiveIcon = active?.icon
  const uptime = uptimeOf(live)

  return (
    <>
      {/* masks the strip above the sticky bar so nothing shows through */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-10 h-10 bg-[#08090b]" />

      <header className="sticky top-4 z-20">
        <div className="flex flex-col gap-3 rounded-3xl bg-[#101216] bg-gradient-to-b from-white/6 to-white/2 px-3 py-3 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-3 px-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="relative grid size-2 shrink-0 place-items-center">
                {failed ? null : <span className="absolute size-2 animate-ping rounded-full bg-emerald-400/60" />}
                <span className={`size-1.5 rounded-full ${failed ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              </span>
              <p className="truncate text-[13px] font-medium tracking-tight text-white/90">Home Server</p>
            </div>
            <p className="shrink-0 font-mono text-[11px] tabular-nums text-white/35">
              {failed ? 'Messwerte nicht erreichbar' : uptime !== null ? `Uptime ${formatUptime(uptime)}` : 'Uptime —'}
            </p>
          </div>

          <div className={`grid grid-cols-2 gap-1 ${columns}`}>
            {shown.map((readout) => (
              <MetricButton key={readout.id} readout={readout} onOpen={setOpenId} />
            ))}
          </div>
        </div>
      </header>

      <GlassModal
        open={active !== null && modal !== null}
        onClose={() => setOpenId(null)}
        title={modal?.title ?? ''}
        subtitle={modal?.subtitle ?? ''}
        eyebrow={
          ActiveIcon ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/6 ring-1 ring-white/10">
              <ActiveIcon className="size-[18px] text-sky-300" strokeWidth={1.75} />
            </span>
          ) : null
        }
      >
        {modal ? <DetailGroups groups={modal.groups} /> : null}
      </GlassModal>
    </>
  )
}
