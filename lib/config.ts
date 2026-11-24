/**
 * Konfiguration aus Umgebungsvariablen.
 *
 * Zwei Betriebsarten, gewählt allein über OIDC_ISSUER:
 *  - "basic" (Standard): Anmeldung per Basic-Auth wie bisher (proxy.ts, DASHBOARD_USERNAME/PASSWORD).
 *  - "oidc": Anmeldung über Authentik mit Gruppen. Fehlt dafür etwas, kommt niemand hinein
 *    (fail closed) und die Login-Seite zeigt, was fehlt. Secrets erscheinen nie in den Meldungen.
 *
 * Der Agent (Docker-Erkennung und Host-Messwerte) ist in beiden Betriebsarten optional.
 */

export type AuthMode = 'basic' | 'oidc'

export type AppConfig = {
  authMode: AuthMode
  /** Öffentliche Adresse des Dashboards (nur Origin). Nur im OIDC-Modus nötig. */
  publicUrl: string | null
  secureCookies: boolean
  oidc: { issuer: string; clientId: string; clientSecret: string } | null
  sessionSecret: string | null
  adminGroups: string[]
  /** null = kein Agent eingerichtet: es gilt die feste Liste aus lib/dashboard-data.ts. */
  agent: { socketPath: string; token: string } | null
  extraServicesFile: string
}

export type ConfigState = {
  config: AppConfig | null
  /** Fatal: ohne diese Angaben kommt niemand hinein. */
  problems: string[]
  /** Nicht fatal (z. B. fehlerhafte Agent-Angaben), nur für Admins sichtbar. */
  warnings: string[]
}

type Env = Record<string, string | undefined>

const MIN_SESSION_SECRET = 32
const MIN_AGENT_TOKEN = 24

function parseHttpOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

/** Leicht genug für proxy.ts: nur die Betriebsart, ohne alles andere zu prüfen. */
export function authModeFromEnv(env: Env = process.env): AuthMode {
  return (env.OIDC_ISSUER ?? '').trim() ? 'oidc' : 'basic'
}

export function readConfig(env: Env = process.env): ConfigState {
  const problems: string[] = []
  const warnings: string[] = []
  const text = (name: string) => (env[name] ?? '').trim()

  const authMode = authModeFromEnv(env)

  let publicUrl: string | null = null
  let oidc: AppConfig['oidc'] = null
  let sessionSecret: string | null = null

  if (authMode === 'oidc') {
    publicUrl = parseHttpOrigin(text('PUBLIC_URL'))
    if (!publicUrl) problems.push('PUBLIC_URL fehlt oder ist keine gültige http(s)-Adresse')

    const issuer = text('OIDC_ISSUER')
    if (!parseHttpOrigin(issuer)) problems.push('OIDC_ISSUER ist keine gültige http(s)-Adresse')

    const clientId = text('OIDC_CLIENT_ID')
    if (!clientId) problems.push('OIDC_CLIENT_ID fehlt')

    const clientSecret = text('OIDC_CLIENT_SECRET')
    if (!clientSecret) problems.push('OIDC_CLIENT_SECRET fehlt')

    sessionSecret = text('SESSION_SECRET')
    if (sessionSecret.length < MIN_SESSION_SECRET) {
      problems.push(`SESSION_SECRET fehlt oder ist kürzer als ${MIN_SESSION_SECRET} Zeichen`)
    }

    oidc = { issuer, clientId, clientSecret }
  }

  let agent: AppConfig['agent'] = null
  const socketPath = text('AGENT_SOCKET')
  if (socketPath) {
    const token = text('AGENT_TOKEN')
    if (!socketPath.startsWith('/')) {
      warnings.push('AGENT_SOCKET muss ein absoluter Pfad sein — Agent wird nicht verwendet')
    } else if (token.length < MIN_AGENT_TOKEN) {
      warnings.push(`AGENT_TOKEN fehlt oder ist kürzer als ${MIN_AGENT_TOKEN} Zeichen — Agent wird nicht verwendet`)
    } else {
      agent = { socketPath, token }
    }
  }

  if (problems.length > 0) return { config: null, problems, warnings }

  const adminGroups = (env.ADMIN_GROUPS ?? 'authentik Admins')
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean)

  return {
    problems,
    warnings,
    config: {
      authMode,
      publicUrl,
      secureCookies: publicUrl?.startsWith('https://') ?? false,
      oidc,
      sessionSecret,
      adminGroups,
      agent,
      extraServicesFile: text('EXTRA_SERVICES_FILE') || '/config/services.json',
    },
  }
}

let cached: ConfigState | null = null

/** Einmal pro Prozess lesen — Umgebungsvariablen ändern sich zur Laufzeit nicht. */
export function getConfigState(): ConfigState {
  if (!cached) cached = readConfig()
  return cached
}
