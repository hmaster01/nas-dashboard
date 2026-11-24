/**
 * DASHBOARD_PANELS: welche Kacheln die Statusleiste zeigt, z. B. "cpu,ram,storage".
 * Reihenfolge wie angegeben; ohne Angabe oder ohne gültigen Eintrag erscheinen alle vier.
 * Bewusst ohne Importe außer Typen, damit die Datei auch in den Node-Tests direkt läuft.
 */

import type { MetricId } from './metrics-view'

export const ALL_PANELS: MetricId[] = ['cpu', 'ram', 'storage', 'network']

const PANEL_ALIASES: Record<string, MetricId> = {
  cpu: 'cpu',
  ram: 'ram',
  storage: 'storage',
  disk: 'storage',
  disks: 'storage',
  speicher: 'storage',
  network: 'network',
  net: 'network',
  netzwerk: 'network',
}

export function parsePanels(value: string | undefined): { panels: MetricId[]; unknown: string[] } {
  const panels: MetricId[] = []
  const unknown: string[] = []
  for (const raw of (value ?? '').split(',')) {
    const name = raw.trim().toLowerCase()
    if (!name) continue
    const id = PANEL_ALIASES[name]
    if (!id) unknown.push(raw.trim())
    else if (!panels.includes(id)) panels.push(id)
  }
  return { panels: panels.length > 0 ? panels : [...ALL_PANELS], unknown }
}

let cached: MetricId[] | null = null

/** Einmal pro Prozess lesen; unbekannte Namen erscheinen einmal im Log. */
export function getPanels(env: Record<string, string | undefined> = process.env): MetricId[] {
  if (!cached) {
    const { panels, unknown } = parsePanels(env.DASHBOARD_PANELS)
    if (unknown.length > 0) {
      console.warn(`[config] DASHBOARD_PANELS: unbekannt: ${unknown.join(', ')} (erlaubt: cpu, ram, storage, network)`)
    }
    cached = panels
  }
  return cached
}
