/**
 * Schutz vor fremden Webseiten, die im Namen eines angemeldeten Admins Änderungen auslösen wollen (CSRF).
 * Mit Basic-Auth schickt der Browser die Zugangsdaten bei jeder Anfrage von selbst mit, deshalb reicht
 * die Anmeldung allein nicht. Verlangt wird: JSON als Inhaltstyp (eine fremde Seite kann das nicht ohne
 * Vorabfrage senden) und, falls der Browser es mitschickt, dass die Anfrage von derselben Seite kommt.
 */

type RequestHeaders = { get(name: string): string | null }

const hostnameOf = (value: string): string => {
  const text = value.trim().toLowerCase()
  if (text.startsWith('[')) return text.slice(0, text.indexOf(']') + 1)
  return text.split(':')[0] ?? ''
}

export function isSameOriginJson(headers: RequestHeaders): boolean {
  if (!(headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return false

  const site = headers.get('sec-fetch-site')
  if (site) return site === 'same-origin'

  // Ältere Browser ohne Sec-Fetch-Site: Origin muss zum Host passen (der Port bleibt außen vor, ein Proxy lässt ihn oft weg).
  const origin = headers.get('origin')
  const host = headers.get('host')
  if (!origin || !host) return false
  try {
    return hostnameOf(new URL(origin).host) === hostnameOf(host)
  } catch {
    return false
  }
}
