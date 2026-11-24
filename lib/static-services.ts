/**
 * Fallback ohne Agent: die feste Liste aus lib/dashboard-data.ts, in der Form, die auch die
 * Docker-Erkennung liefert. Es gibt keinen Zustand zu melden, deshalb "unknown" statt eines
 * erfundenen "Online". Die Platzhalter-Details (z. B. "14 Container") werden nicht übernommen.
 */

import { SERVICES } from '@/lib/dashboard-data'
import type { ServiceDto } from '@/lib/types'

// Die Icon-Komponenten bleiben im Browser; hier nur der Schlüssel (siehe lib/icons.ts).
const ICON_BY_ID: Record<string, string> = {
  portainer: 'boxes',
  jellyfin: 'play',
  paperless: 'file',
  vaultwarden: 'shield',
  homeassistant: 'home',
}

export function staticServiceDtos(): ServiceDto[] {
  return SERVICES.map((service): ServiceDto => ({
    id: service.id,
    name: service.name,
    description: service.description,
    url: null,
    port: service.port,
    protocol: service.protocol,
    icon: ICON_BY_ID[service.id] ?? 'box',
    status: 'unknown',
    statusText: 'Zustand wird nicht überwacht (kein Agent eingerichtet)',
    keywords: service.keywords,
    groups: [],
  }))
}
