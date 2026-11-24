/** Gemeinsame Typen für Server und Browser. */

/** Eine Zeile im Detail-Dialog. */
export type DetailRow = {
  label: string
  value: string
  /** Optional 0–100: zeigt einen dünnen Balken unter der Zeile. */
  percent?: number
}

export type DetailGroup = {
  title: string
  rows: DetailRow[]
}

/** unknown = kein Container dahinter (z. B. von Hand eingetragen), Zustand wird nicht überwacht. */
export type ServiceStatus = 'online' | 'degraded' | 'offline' | 'unknown'

/** Ein Dienst, wie ihn der Browser bekommt (ohne interne Felder wie Gruppen). */
export type ServiceDto = {
  id: string
  name: string
  description: string
  /** Vollständige Adresse (Label dashboard.url). null = keine angegeben oder ungültig. */
  url: string | null
  /**
   * Alternative zu url: Port des Dienstes. Der Browser setzt davor den Host ein, unter dem er das
   * Dashboard gerade geöffnet hat — so funktioniert der Link per IP, Hostname oder VPN.
   */
  port?: number
  protocol?: 'http' | 'https'
  /** Überschrift, unter der die Kachel erscheint (Label dashboard.category). */
  category?: string
  /** Schlüssel aus lib/icons.ts, z. B. "boxes" */
  icon: string
  status: ServiceStatus
  statusText: string
  keywords: string[]
  groups: DetailGroup[]
}

export type ServicesResponse = {
  services: ServiceDto[]
  /**
   * configured=false: kein Agent eingerichtet, es wird die feste Liste aus lib/dashboard-data.ts
   * gezeigt (ohne Statusangaben). available=false: Agent eingerichtet, aber nicht erreichbar.
   */
  discovery: { configured: boolean; available: boolean; error?: string }
  /** Hinweise zur Konfiguration (z. B. fehlerhafte services.json) — nur für Admins. */
  warnings?: string[]
}

/** /api/system mit Agent: die Messwerte des Agents, mit Kennzeichnung der Quelle. */
export type AgentSystemResponse = Metrics & { source: 'agent' }

/** /api/system ohne Agent: Werte, die der Dashboard-Container selbst lesen kann (siehe app/api/system/route.ts). */
export type LegacySystemResponse = {
  source?: undefined
  uptimeSec: number
  cpu: { percent: number | null; cores: number; speedMHz: number | null }
  ram: { used: number; total: number; percent: number | null }
  storage: { free: string | null; total: string | null; percent: number | null }
  network: { downMbit: number; upMbit: number; ready: boolean }
}

export type SystemResponse = AgentSystemResponse | LegacySystemResponse

/** Antwort des Agents unter /metrics. */
export type Metrics = {
  timestamp: number
  host: {
    cpuModel: string | null
    threads: number
    uptimeSeconds: number
    load: number[]
  }
  cpu: {
    percent: number
    perCore: number[]
    mhz: number | null
    tempC: number | null
    ready: boolean
  }
  ram: {
    totalBytes: number
    usedBytes: number
    availableBytes: number
    cachedBytes: number
    swapTotalBytes: number
    swapUsedBytes: number
    percent: number
  }
  disks: DiskMetric[]
  network: {
    downMbit: number
    upMbit: number
    interfaces: string[]
    ready: boolean
  }
}

export type DiskMetric =
  | { name: string; ok: true; totalBytes: number; freeBytes: number; usedBytes: number; percent: number }
  | { name: string; ok: false }

/** Antwort des Agents unter /discovery. */
export type DiscoveryResponse = {
  available: boolean
  containers: {
    id: string
    container: string
    image: string
    state: string
    status: string
    health: 'healthy' | 'unhealthy' | 'starting' | 'none'
    created: number
    labels: Record<string, string>
  }[]
  error?: string
}
