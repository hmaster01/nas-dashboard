/**
 * Prüfung des Host-Headers (ALLOWED_HOSTS).
 *
 * Schützt vor Anfragen, die unter einem fremden Namen ankommen (z. B. DNS-Rebinding oder ein
 * falsch eingerichteter Reverse-Proxy). Ist ALLOWED_HOSTS nicht gesetzt, wird nichts geprüft.
 *
 * Einträge: Hostname oder IP, optional mit Port ("dashboard.home.arpa", "192.168.178.75:3000").
 * Ohne Port gilt jeder Port. Keine Platzhalter. Groß-/Kleinschreibung ist egal.
 * localhost, 127.0.0.1 und [::1] sind immer erlaubt (Zugriff vom NAS selbst, Healthchecks).
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
const MAX_HOST_LENGTH = 255

type HostParts = { host: string; port: string | null }

function splitHost(value: string): HostParts | null {
  const text = value.trim().toLowerCase()
  if (!text || text.length > MAX_HOST_LENGTH) return null
  // Nur Zeichen, die in Hostnamen, IPv4 und IPv6 vorkommen dürfen — keine Pfade, keine Leerzeichen.
  if (!/^[a-z0-9.:\-[\]]+$/.test(text)) return null

  if (text.startsWith('[')) {
    const end = text.indexOf(']')
    if (end < 0) return null
    const rest = text.slice(end + 1)
    if (rest && !/^:\d{1,5}$/.test(rest)) return null
    return { host: text.slice(0, end + 1), port: rest ? rest.slice(1) : null }
  }

  const parts = text.split(':')
  if (parts.length > 2) return null
  const [host, port] = parts
  if (!host) return null
  if (port !== undefined && !/^\d{1,5}$/.test(port)) return null
  return { host, port: port ?? null }
}

/** Liest die kommagetrennte Liste. Ungültige Einträge werden mit zurückgegeben, damit man sie melden kann. */
export function parseAllowedHosts(value: string | undefined): { hosts: HostParts[]; invalid: string[] } {
  const hosts: HostParts[] = []
  const invalid: string[] = []
  for (const entry of (value ?? '').split(',')) {
    if (!entry.trim()) continue
    const parsed = splitHost(entry)
    if (parsed) hosts.push(parsed)
    else invalid.push(entry.trim())
  }
  // Ist ALLOWED_HOSTS gesetzt, aber kein Eintrag gültig, darf nicht "alles erlaubt" daraus werden:
  // Dieser Platzhalter passt auf keinen Host, es bleiben nur die Loopback-Namen.
  if (hosts.length === 0 && invalid.length > 0) hosts.push({ host: '', port: null })
  return { hosts, invalid }
}

/**
 * true = die Anfrage darf weiter. Ist die Liste leer, wird nicht geprüft (Standard).
 * Ist sie gesetzt, aber der Host-Header fehlt oder passt nicht, ist die Antwort false.
 */
export function isHostAllowed(hostHeader: string | null | undefined, allowed: HostParts[]): boolean {
  if (allowed.length === 0) return true
  const parsed = hostHeader ? splitHost(hostHeader) : null
  if (!parsed) return false
  if (LOOPBACK.has(parsed.host)) return true
  return allowed.some((entry) => entry.host === parsed.host && (entry.port === null || entry.port === parsed.port))
}
