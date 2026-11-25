/**
 * Baut aus den Docker-Labels (und optional einer Datei mit Handeinträgen) die
 * Dienstkarten. Reine Funktionen — kein Netzwerk, kein Dateizugriff.
 *
 * Labels am Container (alle optional außer dashboard.name):
 *   dashboard.name         Anzeigename (Pflicht, sonst taucht der Container nicht auf)
 *   dashboard.description  Untertitel, z. B. "Medien & Streaming"
 *   dashboard.url          Adresse zum Öffnen (nur http/https), z. B. https://jellyfin.home.arpa
 *   dashboard.port         Alternative zu url: nur der Port. Der Browser nimmt den Host, unter dem
 *                          er das Dashboard geöffnet hat (funktioniert per IP, Name oder VPN).
 *   dashboard.protocol     "http" (Standard) oder "https" — nur zusammen mit dashboard.port
 *   dashboard.category     Überschrift, unter der die Kachel erscheint (z. B. "Medien")
 *   dashboard.icon         eines von ICON_KEYS, sonst "box"
 *   dashboard.groups       kommagetrennt; leer oder "*" = für alle angemeldeten Nutzer
 *   dashboard.keywords     kommagetrennt, für die Suche
 */

import type { DetailGroup, DiscoveryResponse, ServiceDto, ServiceStatus } from './types'

export const ICON_KEYS = ['box', 'boxes', 'server', 'database', 'globe', 'play', 'file', 'shield', 'home'] as const
export type IconKey = (typeof ICON_KEYS)[number]

const MAX_NAME = 60
const MAX_TEXT = 160
const MAX_URL = 300
const MAX_KEYWORDS = 20
const MAX_CATEGORY = 40

/** Ein Dienst samt seiner Gruppenfreigabe — die Gruppen verlassen den Server nicht. */
export type ServiceEntry = {
  service: ServiceDto
  groups: string[]
  /** Automatisch erkannt (kein Label dashboard.name): nur für Admins sichtbar. */
  adminOnly?: boolean
}

const csv = (raw: unknown): string[] =>
  (typeof raw === 'string' ? raw : '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

const clean = (raw: unknown, max: number): string => (typeof raw === 'string' ? raw.trim().slice(0, max) : '')

/** Nur http(s) ohne Zugangsdaten in der Adresse. Alles andere (javascript:, data:, …) → null. */
export function safeUrl(raw: unknown): string | null {
  const text = clean(raw, MAX_URL + 1)
  if (!text || text.length > MAX_URL) return null

  try {
    const url = new URL(text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Ganzzahl 1–65535, sonst null. */
export function portFrom(raw: unknown): number | null {
  const text = clean(raw, 6)
  if (!/^\d{1,5}$/.test(text)) return null
  const port = Number(text)
  return port >= 1 && port <= 65535 ? port : null
}

export function protocolFrom(raw: unknown): 'http' | 'https' {
  return clean(raw, 6).toLowerCase() === 'https' ? 'https' : 'http'
}

export function iconFor(raw: unknown): IconKey {
  const key = clean(raw, 20).toLowerCase()
  return (ICON_KEYS as readonly string[]).includes(key) ? (key as IconKey) : 'box'
}

export function slug(text: string): string {
  const result = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return result || 'dienst'
}

/** Docker-Zustand → Anzeigestatus. Nur ein laufender, gesunder Container ist "online". */
export function statusFor(state: string, health: string): { status: ServiceStatus; text: string } {
  if (state === 'running') {
    if (health === 'unhealthy') return { status: 'degraded', text: 'Läuft, Health-Check schlägt fehl' }
    if (health === 'starting') return { status: 'degraded', text: 'Startet …' }
    return { status: 'online', text: 'Läuft' }
  }
  if (state === 'restarting') return { status: 'degraded', text: 'Startet neu' }
  if (state === 'paused') return { status: 'degraded', text: 'Pausiert' }
  return { status: 'offline', text: 'Gestoppt' }
}

const HEALTH_LABEL: Record<string, string> = {
  healthy: 'Gesund',
  unhealthy: 'Fehlerhaft',
  starting: 'Wird geprüft',
  none: 'Kein Health-Check',
}

const truthy = (raw: unknown): boolean => ['1', 'true', 'yes', 'on'].includes(clean(raw, 6).toLowerCase())

/** Ports, hinter denen üblicherweise HTTPS läuft (Port im Container). */
const HTTPS_PORTS = new Set([443, 8443, 9443])

/**
 * showAll: Container ohne dashboard.name erscheinen ebenfalls, sofern sie einen von außen erreichbaren
 * Port veröffentlichen — nur für Admins. dashboard.hide=true nimmt einen Container davon aus.
 */
export function entriesFromDiscovery(discovery: DiscoveryResponse, options: { showAll?: boolean } = {}): ServiceEntry[] {
  const entries: ServiceEntry[] = []
  const usedIds = new Set<string>()

  for (const container of discovery.containers) {
    if (truthy(container.labels['dashboard.hide'])) continue

    const published = Array.isArray(container.ports) ? container.ports : []
    let name = clean(container.labels['dashboard.name'], MAX_NAME)
    const autoDetected = !name
    if (autoDetected) {
      if (!options.showAll || published.length === 0) continue
      name = clean(container.container, MAX_NAME)
      if (!name) continue
    }

    let id = slug(container.container || name)
    while (usedIds.has(id)) id = `${id}-${usedIds.size}`
    usedIds.add(id)

    const { status, text } = statusFor(container.state, container.health)

    const groups: DetailGroup[] = [
      {
        title: 'Container',
        rows: [
          { label: 'Name', value: container.container },
          { label: 'Image', value: container.image },
          { label: 'Zustand', value: container.status || text },
          { label: 'Gesundheit', value: HEALTH_LABEL[container.health] ?? HEALTH_LABEL.none },
        ],
      },
    ]

    if (published.length > 0) {
      groups[0].rows.push({ label: 'Ports', value: published.map((p) => `${p.public} → ${p.private}`).join(', ') })
    }

    const labelPort = portFrom(container.labels['dashboard.port'])
    const first = published[0]
    const port = labelPort ?? (autoDetected ? first?.public ?? null : null)
    const protocol = labelPort
      ? protocolFrom(container.labels['dashboard.protocol'])
      : autoDetected && first && HTTPS_PORTS.has(first.private)
        ? 'https'
        : protocolFrom(container.labels['dashboard.protocol'])
    const category = clean(container.labels['dashboard.category'], MAX_CATEGORY)

    entries.push({
      groups: csv(container.labels['dashboard.groups']),
      ...(autoDetected ? { adminOnly: true } : {}),
      service: {
        id,
        name,
        description: clean(container.labels['dashboard.description'], MAX_TEXT) || (autoDetected ? container.image : ''),
        url: safeUrl(container.labels['dashboard.url']),
        ...(category ? { category } : {}),
        ...(truthy(container.labels['dashboard.embed']) ? { embed: true } : {}),
        ...(port ? { port, protocol } : {}),
        icon: iconFor(container.labels['dashboard.icon']),
        status,
        statusText: text,
        keywords: csv(container.labels['dashboard.keywords']).slice(0, MAX_KEYWORDS),
        groups,
      },
    })
  }

  return entries
}

/**
 * Handeinträge für Dienste ohne Container (z. B. die OMV-Oberfläche).
 * Format der Datei: [{ "name": "OpenMediaVault", "url": "http://…", "icon": "server",
 *                      "description": "NAS-Verwaltung", "groups": ["authentik Admins"] }]
 */
export function parseExtraServices(jsonText: string): { entries: ServiceEntry[]; errors: string[] } {
  const errors: string[] = []
  let data: unknown

  try {
    data = JSON.parse(jsonText)
  } catch {
    return { entries: [], errors: ['services.json ist kein gültiges JSON'] }
  }
  if (!Array.isArray(data)) return { entries: [], errors: ['services.json muss eine Liste sein'] }

  const entries: ServiceEntry[] = []
  const usedIds = new Set<string>()

  data.forEach((item: unknown, index: number) => {
    const record = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
    const name = clean(record.name, MAX_NAME)
    if (!name) {
      errors.push(`Eintrag ${index + 1}: "name" fehlt`)
      return
    }

    const url = record.url === undefined ? null : safeUrl(record.url)
    if (record.url !== undefined && !url) errors.push(`Eintrag "${name}": "url" ist keine gültige http(s)-Adresse`)

    const port = record.port === undefined ? null : portFrom(String(record.port))
    if (record.port !== undefined && !port) errors.push(`Eintrag "${name}": "port" muss eine Zahl von 1 bis 65535 sein`)

    const category = clean(record.category, MAX_CATEGORY)

    let id = `extra-${slug(name)}`
    while (usedIds.has(id)) id = `${id}-${usedIds.size}`
    usedIds.add(id)

    const listOrCsv = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
        : csv(value)

    entries.push({
      groups: listOrCsv(record.groups),
      service: {
        id,
        name,
        description: clean(record.description, MAX_TEXT),
        url,
        ...(category ? { category } : {}),
        ...(port ? { port, protocol: protocolFrom(record.protocol) } : {}),
        icon: iconFor(record.icon),
        status: 'unknown',
        statusText: 'Nicht überwacht',
        keywords: listOrCsv(record.keywords).slice(0, MAX_KEYWORDS),
        groups: [],
      },
    })
  })

  return { entries, errors }
}

export function sortEntries(entries: ServiceEntry[]): ServiceEntry[] {
  return [...entries].sort((a, b) => a.service.name.localeCompare(b.service.name, 'de'))
}
