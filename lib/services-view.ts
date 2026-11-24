/**
 * Gruppiert Dienste nach dem Label dashboard.category für die Anzeige.
 * Ohne Importe außer Typen, damit die Datei auch in den Node-Tests direkt läuft.
 */

import type { ServiceDto } from './types'

export type ServiceSection = { title: string | null; services: ServiceDto[] }

export const UNCATEGORIZED_TITLE = 'Weitere'

/**
 * Hat kein Dienst eine Kategorie, kommt ein einziger Abschnitt ohne Überschrift heraus (flaches Raster).
 * Sonst: Kategorien alphabetisch (Groß-/Kleinschreibung egal), Dienste ohne Kategorie zuletzt unter "Weitere".
 * Die Reihenfolge der Dienste innerhalb eines Abschnitts bleibt wie geliefert.
 */
export function groupByCategory(services: ServiceDto[]): ServiceSection[] {
  if (services.length === 0) return []
  if (!services.some((service) => service.category)) return [{ title: null, services }]

  const byKey = new Map<string, ServiceSection>()
  const rest: ServiceDto[] = []

  for (const service of services) {
    if (!service.category) {
      rest.push(service)
      continue
    }
    // Gleiche Kategorie in anderer Schreibweise ("medien" / "Medien") ergibt einen Abschnitt.
    const key = service.category.toLowerCase()
    const section = byKey.get(key)
    if (section) section.services.push(service)
    else byKey.set(key, { title: service.category, services: [service] })
  }

  const sections = [...byKey.values()].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'de', { sensitivity: 'base' }))
  if (rest.length > 0) sections.push({ title: UNCATEGORIZED_TITLE, services: rest })
  return sections
}
