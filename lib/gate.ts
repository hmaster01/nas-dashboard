/**
 * Zugangsregel für den OIDC-Modus (wird von proxy.ts angewendet).
 *
 * Nur die Anmelde-Seiten sind ohne Sitzung erreichbar. Alles andere braucht eine gültige Sitzung:
 * Seiten leiten zur Anmeldung weiter, API-Aufrufe bekommen 401. Unbekannte Pfade gelten als
 * geschützt — es gibt keine Liste von "erlaubten" Ausnahmen außer dieser hier.
 */

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/callback', '/api/auth/logout'])

export type GateDecision = 'allow' | 'login' | 'deny'

export function decideOidcGate(pathname: string, hasSession: boolean): GateDecision {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (PUBLIC_PATHS.has(path)) return 'allow'
  if (hasSession) return 'allow'
  return path === '/api' || path.startsWith('/api/') ? 'deny' : 'login'
}
