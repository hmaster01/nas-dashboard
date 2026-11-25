'use client'

import { ArrowUpRight, ExternalLink, Globe } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DetailGroups } from '@/components/detail-groups'
import { GlassModal } from '@/components/glass-modal'
import { SpotlightSearch } from '@/components/spotlight-search'
import { iconComponent } from '@/lib/icons'
import { groupByCategory } from '@/lib/services-view'
import type { ServiceDto, ServiceStatus, ServicesResponse } from '@/lib/types'

const POLL_MS = 15000

const STATUS_LABEL: Record<ServiceStatus, string> = {
  online: 'Online',
  degraded: 'Eingeschränkt',
  offline: 'Offline',
  unknown: 'Nicht überwacht',
}

const STATUS_DOT: Record<ServiceStatus, string> = {
  online: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  offline: 'bg-rose-400/80',
  unknown: 'bg-white/30',
}

const STATUS_BANNER: Record<ServiceStatus, string> = {
  online: 'bg-emerald-400/8 ring-emerald-300/15 text-emerald-200/90',
  degraded: 'bg-amber-400/8 ring-amber-300/15 text-amber-200/90',
  offline: 'bg-rose-400/8 ring-rose-300/15 text-rose-200/90',
  unknown: 'bg-white/4 ring-white/10 text-white/60',
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

function ServiceCard({ service, onOpen }: { service: ServiceDto; onOpen: (id: string) => void }) {
  const Icon = iconComponent(service.icon)

  return (
    <button
      type="button"
      onClick={() => onOpen(service.id)}
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
        <h3 className="truncate text-[15px] font-semibold tracking-tight text-white">{service.name}</h3>
        {service.description ? (
          <p className="mt-0.5 text-[13px] leading-relaxed text-white/45">{service.description}</p>
        ) : null}
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

/** Hat der Dienst eine feste Adresse (Label dashboard.url) und nicht nur einen Port? */
function hasFixedAddress(service: ServiceDto): boolean {
  return Boolean(service.url)
}

/**
 * Link zum Dienst. Eine feste Adresse (dashboard.url) gilt unverändert. Sonst wird der Port an den Host
 * gehängt, unter dem das Dashboard gerade geöffnet ist — das funktioniert per IP, Hostname oder VPN,
 * ohne dass irgendwo eine Geräteadresse stehen muss.
 */
function serviceHref(service: ServiceDto, hostname: string): string | null {
  if (service.url) return service.url
  if (!service.port || !hostname) return null

  // window.location.hostname liefert IPv6-Adressen in eckigen Klammern; sie werden erst entfernt und dann neu gesetzt.
  const host = hostname.replace(/^\[|\]$/g, '')
  const formattedHost = host.includes(':') ? `[${host}]` : host
  return `${service.protocol ?? 'http'}://${formattedHost}:${service.port}/`
}

export function ServiceGrid() {
  const [data, setData] = useState<ServicesResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hostname, setHostname] = useState('')
  // Dienst im Dashboard-Fenster (iframe) statt im neuen Tab; nur für Dienste mit Label dashboard.embed.
  const [embedded, setEmbedded] = useState(false)
  const [pageProtocol, setPageProtocol] = useState('')

  useEffect(() => {
    setHostname(window.location.hostname)
    setPageProtocol(window.location.protocol)
  }, [])

  // Die Liste kommt vom Server und ist schon auf den Nutzer zugeschnitten.
  // Regelmäßiges Nachladen: neue oder gestoppte Container erscheinen ohne Neuladen der Seite.
  useEffect(() => {
    let cancelled = false

    async function load() {
      if (document.hidden) return
      try {
        const res = await fetch('/api/services', { cache: 'no-store' })
        if (res.status === 401) {
          window.location.href = '/login'
          return
        }
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as ServicesResponse
        if (!cancelled) {
          setData(body)
          setFailed(false)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    load()
    const id = window.setInterval(load, POLL_MS)
    document.addEventListener('visibilitychange', load)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', load)
    }
  }, [])

  const services = useMemo(() => data?.services ?? [], [data])
  const active = services.find((service) => service.id === activeId) ?? null
  const ActiveIcon = active ? iconComponent(active.icon) : null
  const activeHref = active ? serviceHref(active, hostname) : null
  const canEmbed = Boolean(active?.embed && activeHref)
  // Eine HTTPS-Seite darf keine HTTP-Seite einbetten; der Browser würde sie blockieren.
  const embedBlocked = pageProtocol === 'https:' && Boolean(activeHref?.startsWith('http:'))

  const trimmed = query.trim()

  const results = useMemo(() => {
    const needle = trimmed.toLowerCase()
    if (!needle) return services

    return services.filter((service) =>
      [service.name, service.description, ...service.keywords].join(' ').toLowerCase().includes(needle),
    )
  }, [services, trimmed])

  const sections = useMemo(() => groupByCategory(results), [results])

  function handleSubmit({ newTab }: { newTab: boolean }) {
    if (!trimmed) return
    if (results.length > 0) {
      // Erster Treffer in der angezeigten Reihenfolge (nach Kategorien sortiert).
      const first = sections[0]?.services[0] ?? results[0]
      const href = serviceHref(first, hostname)
      if (!href) {
        // Keine Adresse bekannt: wenigstens die Details zeigen.
        setActiveId(first.id)
      } else if (newTab) {
        window.open(href, '_blank', 'noopener,noreferrer')
      } else {
        window.location.assign(href)
      }
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

      {failed ? (
        <p className="mt-4 rounded-2xl bg-amber-400/8 px-4 py-3 text-[13px] text-amber-200/90 ring-1 ring-amber-300/15">
          Dienste konnten nicht geladen werden. Die Anzeige kann veraltet sein.
        </p>
      ) : null}

      {data?.discovery.configured && !data.discovery.available ? (
        <p className="mt-4 rounded-2xl bg-amber-400/8 px-4 py-3 text-[13px] text-amber-200/90 ring-1 ring-amber-300/15">
          Docker-Erkennung nicht verfügbar ({data.discovery.error ?? 'unbekannter Fehler'}). Es werden nur
          Handeinträge angezeigt.
        </p>
      ) : null}

      {data?.warnings?.map((warning) => (
        <p
          key={warning}
          className="mt-4 rounded-2xl bg-amber-400/8 px-4 py-3 text-[13px] text-amber-200/90 ring-1 ring-amber-300/15"
        >
          {warning}
        </p>
      ))}

      {results.length > 0 ? (
        <div className="mt-6 flex flex-col gap-8">
          {sections.map((section) => (
            <section key={section.title ?? 'alle'} aria-label={section.title ?? undefined}>
              {section.title ? (
                <h2 className="mb-3 px-1 text-[11px] font-medium tracking-[0.14em] text-white/40 uppercase">{section.title}</h2>
              ) : null}
              <div className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 lg:grid-cols-3">
                {section.services.map((service) => (
                  <ServiceCard key={service.id} service={service} onOpen={setActiveId} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {data && services.length === 0 && !trimmed ? (
        <p className="mt-6 rounded-3xl bg-white/4 p-5 text-[14px] leading-relaxed text-white/55 ring-1 ring-white/10">
          Für dich sind noch keine Dienste freigegeben. Container erscheinen hier, sobald sie das Label{' '}
          <code className="font-mono text-white/80">dashboard.name</code> tragen und deine Gruppe dazu passt.
        </p>
      ) : null}

      {!data && !failed ? <p className="mt-6 text-[13px] text-white/35">Dienste werden geladen …</p> : null}

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
        onClose={() => {
          setActiveId(null)
          setEmbedded(false)
        }}
        title={active?.name ?? ''}
        subtitle={active?.description ?? ''}
        eyebrow={
          ActiveIcon ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/6 ring-1 ring-white/10">
              <ActiveIcon className="size-[18px] text-sky-300" strokeWidth={1.75} />
            </span>
          ) : null
        }
        footer={
          active && activeHref ? (
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 truncate text-[11px] text-white/35">
                {hasFixedAddress(active) ? activeHref : 'Dienstadresse automatisch erkannt'}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {canEmbed && !embedBlocked ? (
                  <button
                    type="button"
                    onClick={() => setEmbedded((value) => !value)}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-white/80 ring-1 ring-white/15 transition-colors duration-300 hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
                  >
                    {embedded ? 'Fenster schließen' : 'Hier öffnen'}
                  </button>
                ) : null}
                <a
                  href={activeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black transition-colors duration-300 hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
                >
                  Dienst öffnen
                  <ExternalLink className="size-3.5" strokeWidth={2} />
                </a>
              </div>
            </div>
          ) : null
        }
      >
        {active ? (
          <>
            <div className={`mb-5 flex items-center gap-2 rounded-2xl px-4 py-3 ring-1 ${STATUS_BANNER[active.status]}`}>
              <StatusDot status={active.status} />
              <span className="text-[13px]">{active.statusText}</span>
            </div>
            {canEmbed && embedBlocked ? (
              <p className="mb-5 rounded-2xl bg-amber-400/8 px-4 py-3 text-[13px] text-amber-200/90 ring-1 ring-amber-300/15">
                Einbetten geht hier nicht: Das Dashboard läuft über HTTPS, der Dienst nur über HTTP. Öffne ihn im neuen Tab.
              </p>
            ) : null}
            {embedded && canEmbed && activeHref ? (
              <div className="mb-5">
                <iframe
                  src={activeHref}
                  title={active.name}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                  referrerPolicy="no-referrer"
                  className="h-[60vh] w-full rounded-2xl bg-white ring-1 ring-white/10"
                />
                <p className="mt-2 text-[11px] text-white/35">
                  Bleibt die Seite leer, verbietet der Dienst das Einbetten. Dann hilft „Dienst öffnen“.
                </p>
              </div>
            ) : null}
            {active.groups.length > 0 ? <DetailGroups groups={active.groups} /> : null}
          </>
        ) : null}
      </GlassModal>
    </>
  )
}
