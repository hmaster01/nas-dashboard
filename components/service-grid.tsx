'use client'

import { ArrowUpRight, ExternalLink, Globe } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DetailGroups } from '@/components/detail-groups'
import { GlassModal } from '@/components/glass-modal'
import { SpotlightSearch } from '@/components/spotlight-search'
import { SERVICES } from '@/lib/dashboard-data'
import type { Service, ServiceStatus } from '@/lib/dashboard-data'

const STATUS_LABEL: Record<ServiceStatus, string> = {
  online: 'Online',
  degraded: 'Eingeschränkt',
  offline: 'Offline',
}

const STATUS_DOT: Record<ServiceStatus, string> = {
  online: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  offline: 'bg-white/30',
}

function StatusDot({ status }: { status: ServiceStatus }) {
  return (
    <span className="relative grid size-2 place-items-center">
      {status === 'online' ? (
        <span className="absolute size-2 animate-ping rounded-full bg-emerald-400/60" />
      ) : null}
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
    </span>
  )
}

function ServiceCard({ service, onOpen }: { service: Service; onOpen: (service: Service) => void }) {
  const Icon = service.icon

  return (
    <button
      type="button"
      onClick={() => onOpen(service)}
      className="group relative flex flex-col gap-5 rounded-3xl bg-white/4 p-5 text-left ring-1 ring-white/10 backdrop-blur-2xl transition-[transform,background-color,box-shadow] duration-500 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:bg-white/7 hover:shadow-[0_30px_60px_-32px_rgba(0,0,0,0.9)] focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
    >
      {/* hairline arc that warms up on hover */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-3xl bg-gradient-to-b from-white/8 to-transparent opacity-70 transition-opacity duration-500 group-hover:opacity-100"
      />

      <div className="relative flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-white/6 ring-1 ring-white/10 transition-colors duration-500 group-hover:bg-sky-400/12 group-hover:ring-sky-300/25">
          <Icon
            className="size-5 text-white/70 transition-colors duration-500 group-hover:text-sky-300"
            strokeWidth={1.6}
          />
        </span>

        <ArrowUpRight
          className="size-4 shrink-0 text-white/25 transition-[color,transform] duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white/60"
          strokeWidth={2}
        />
      </div>

      <div className="relative min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-white">{service.name}</h3>
        <p className="mt-0.5 text-[13px] leading-relaxed text-white/45">{service.description}</p>
      </div>

      <div className="relative flex items-center gap-2">
        <StatusDot status={service.status} />
        <span className="text-[11px] font-medium tracking-[0.1em] text-white/40 uppercase">
          {STATUS_LABEL[service.status]}
        </span>
      </div>
    </button>
  )
}

function webSearchUrl(query: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
}

export function ServiceGrid() {
  const [active, setActive] = useState<Service | null>(null)
  const [query, setQuery] = useState('')
  const ActiveIcon = active?.icon

  const trimmed = query.trim()

  const results = useMemo(() => {
    const needle = trimmed.toLowerCase()
    if (!needle) return SERVICES

    return SERVICES.filter((service) =>
      [service.name, service.description, service.tagline, ...service.keywords]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [trimmed])

  function handleSubmit() {
    if (!trimmed) return
    if (results.length > 0) {
      setActive(results[0])
      return
    }
    window.open(webSearchUrl(trimmed), '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <SpotlightSearch
        value={query}
        onChange={setQuery}
        onSubmit={handleSubmit}
        resultCount={results.length}
      />

      {results.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 lg:grid-cols-3">
          {results.map((service) => (
            <ServiceCard key={service.id} service={service} onOpen={setActive} />
          ))}
        </div>
      ) : null}

      {trimmed && results.length === 0 ? (
        <a
          href={webSearchUrl(trimmed)}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-6 flex items-center gap-4 rounded-3xl bg-white/4 p-5 ring-1 ring-white/10 backdrop-blur-2xl transition-[background-color,transform] duration-500 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:bg-white/7 focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/6 ring-1 ring-white/10 transition-colors duration-500 group-hover:bg-sky-400/12">
            <Globe className="size-5 text-white/70 transition-colors duration-500 group-hover:text-sky-300" strokeWidth={1.6} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold tracking-tight text-white">Im Web suchen</span>
            <span className="mt-0.5 block truncate text-[13px] text-white/45">
              Kein Dienst passt zu „{trimmed}“ — Suche extern fortsetzen
            </span>
          </span>
          <ArrowUpRight
            className="size-4 shrink-0 text-white/25 transition-[color,transform] duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white/60"
            strokeWidth={2}
          />
        </a>
      ) : null}

      <GlassModal
        open={active !== null}
        onClose={() => setActive(null)}
        title={active?.name ?? ''}
        subtitle={active?.tagline ?? ''}
        eyebrow={
          ActiveIcon ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/6 ring-1 ring-white/10">
              <ActiveIcon className="size-[18px] text-sky-300" strokeWidth={1.75} />
            </span>
          ) : null
        }
        footer={
          active ? (
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 truncate font-mono text-[11px] text-white/35">{active.url}</p>
              <a
                href={active.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black transition-colors duration-300 hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
              >
                Dienst öffnen
                <ExternalLink className="size-3.5" strokeWidth={2} />
              </a>
            </div>
          ) : null
        }
      >
        {active ? (
          <>
            <div className="mb-5 flex items-center gap-2 rounded-2xl bg-emerald-400/8 px-4 py-3 ring-1 ring-emerald-300/15">
              <StatusDot status={active.status} />
              <span className="text-[13px] text-emerald-200/90">
                Dienst erreichbar · {STATUS_LABEL[active.status]}
              </span>
            </div>
            <DetailGroups groups={active.groups} />
          </>
        ) : null}
      </GlassModal>
    </>
  )
}
