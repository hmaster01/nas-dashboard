/**
 * Eigene Anpassungen pro Dienst (Name, Beschreibung, Kategorie, Symbol, Position, ausblenden).
 * Sie liegen in DATA_DIR/overrides.json und gelten vor den Docker-Labels. Nur Admins dürfen sie ändern.
 *
 * Die Prüfung der Eingaben ist rein (ohne Dateizugriff) und deshalb direkt testbar.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ServiceDto } from './types'

export type Override = {
  name?: string
  description?: string
  category?: string
  icon?: string
  hidden?: boolean
  order?: number
}
export type OverrideMap = Record<string, Override>

const MAX_NAME = 60
const MAX_DESCRIPTION = 160
const MAX_CATEGORY = 40
const MAX_ENTRIES = 500
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/

const text = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().slice(0, max)
  return trimmed || undefined
}

/** Prüft eine Eingabe. Unbekannte Felder fallen weg; ein leeres Ergebnis ergibt null (= nichts überschreiben). */
export function sanitizeOverride(input: unknown, iconKeys: readonly string[]): Override | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  const result: Override = {}

  const name = text(raw.name, MAX_NAME)
  if (name) result.name = name
  const description = text(raw.description, MAX_DESCRIPTION)
  if (description) result.description = description
  const category = text(raw.category, MAX_CATEGORY)
  if (category) result.category = category
  if (typeof raw.icon === 'string' && iconKeys.includes(raw.icon)) result.icon = raw.icon
  if (raw.hidden === true) result.hidden = true
  if (typeof raw.order === 'number' && Number.isInteger(raw.order) && raw.order >= -999 && raw.order <= 999) {
    result.order = raw.order
  }

  return Object.keys(result).length > 0 ? result : null
}

/** Prüft den Inhalt der Datei Eintrag für Eintrag; Ungültiges wird verworfen statt alles abzulehnen. */
export function sanitizeMap(raw: unknown, iconKeys: readonly string[]): OverrideMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const map: OverrideMap = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ID_PATTERN.test(id) || Object.keys(map).length >= MAX_ENTRIES) continue
    const override = sanitizeOverride(value, iconKeys)
    if (override) map[id] = override
  }
  return map
}

/** Legt die Anpassung über den Dienst. hidden bleibt als Merkmal erhalten, damit Admins ihn wieder einblenden können. */
export function applyOverride(service: ServiceDto, override: Override | undefined): ServiceDto {
  if (!override) return service
  return {
    ...service,
    ...(override.name ? { name: override.name } : {}),
    ...(override.description ? { description: override.description } : {}),
    ...(override.category ? { category: override.category } : {}),
    ...(override.icon ? { icon: override.icon } : {}),
    ...(override.order !== undefined ? { order: override.order } : {}),
    ...(override.hidden ? { hidden: true } : {}),
    override,
  }
}

// ---------------------------------------------------------------- Datei

const fileOf = (dir: string) => path.join(dir, 'overrides.json')

export async function readOverrides(dir: string, iconKeys: readonly string[]): Promise<OverrideMap> {
  try {
    return sanitizeMap(JSON.parse(await readFile(fileOf(dir), 'utf8')), iconKeys)
  } catch (error) {
    // Keine Datei ist der Normalfall (noch nichts angepasst).
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[overrides] Datei nicht lesbar:', error instanceof Error ? error.message : error)
    }
    return {}
  }
}

// Schreibzugriffe laufen nacheinander, damit zwei gleichzeitige Speichervorgänge sich nicht überschreiben.
let queue: Promise<unknown> = Promise.resolve()

/** override = null löscht die Anpassung dieses Dienstes. */
export function writeOverride(dir: string, id: string, override: Override | null, iconKeys: readonly string[]): Promise<void> {
  const job = queue.then(async () => {
    const map = await readOverrides(dir, iconKeys)
    if (override) {
      if (!map[id] && Object.keys(map).length >= MAX_ENTRIES) throw new Error('Zu viele Anpassungen')
      map[id] = override
    } else {
      delete map[id]
    }
    await mkdir(dir, { recursive: true })
    // Erst in eine Nebendatei schreiben, dann umbenennen: Bricht etwas ab, bleibt die alte Datei heil.
    const temp = `${fileOf(dir)}.tmp`
    await writeFile(temp, JSON.stringify(map, null, 2), { mode: 0o600 })
    await rename(temp, fileOf(dir))
  })
  queue = job.catch(() => undefined)
  return job
}
