/**
 * OpenID-Connect-Login (Authorization Code + PKCE) gegen Authentik, ohne Zusatzpakete.
 *
 * Wir holen das Token direkt vom Token-Endpunkt (Server-zu-Server, über TLS) und
 * lesen Name und Gruppen anschließend über den userinfo-Endpunkt. Das ID-Token
 * wird deshalb nicht ausgewertet. Schutz gegen CSRF und Code-Diebstahl bieten
 * `state` und PKCE.
 */

import { createHash, randomBytes } from 'node:crypto'

export type OidcEndpoints = {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userinfoEndpoint: string
}

export type OidcClient = {
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export type OidcUser = {
  sub: string
  name: string
  email: string | null
  groups: string[]
}

const TIMEOUT_MS = 8000
const DISCOVERY_TTL_MS = 60 * 60 * 1000
const MAX_GROUPS = 100
export const OIDC_SCOPE = 'openid profile email'

const trimSlashes = (value: string) => value.replace(/\/+$/, '')

// ---------------------------------------------------------------- PKCE & state

export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: challengeFor(verifier) }
}

export function createState(): string {
  return randomBytes(24).toString('base64url')
}

// ---------------------------------------------------------------- Discovery

let discoveryCache: { key: string; at: number; value: OidcEndpoints } | null = null

export function resetDiscoveryCache(): void {
  discoveryCache = null
}

export async function discover(issuer: string, fetchImpl: typeof fetch = fetch): Promise<OidcEndpoints> {
  const key = trimSlashes(issuer)
  if (discoveryCache && discoveryCache.key === key && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.value
  }

  const response = await fetchImpl(`${key}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`OIDC-Discovery fehlgeschlagen (HTTP ${response.status})`)

  const doc = (await response.json()) as Record<string, unknown>

  const read = (field: string): string => {
    const value = doc?.[field]
    if (typeof value !== 'string' || !value) throw new Error(`OIDC-Discovery: Feld "${field}" fehlt`)
    return value
  }
  const readUrl = (field: string): string => {
    const value = read(field)
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`OIDC-Discovery: Feld "${field}" ist keine http(s)-Adresse`)
    }
    return value
  }

  if (trimSlashes(read('issuer')) !== key) throw new Error('OIDC-Discovery: issuer stimmt nicht mit OIDC_ISSUER überein')

  const value: OidcEndpoints = {
    issuer: key,
    authorizationEndpoint: readUrl('authorization_endpoint'),
    tokenEndpoint: readUrl('token_endpoint'),
    userinfoEndpoint: readUrl('userinfo_endpoint'),
  }
  discoveryCache = { key, at: Date.now(), value }
  return value
}

// ---------------------------------------------------------------- Ablauf

export function buildAuthorizeUrl(
  endpoints: OidcEndpoints,
  client: OidcClient,
  params: { state: string; challenge: string },
): string {
  const url = new URL(endpoints.authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', client.clientId)
  url.searchParams.set('redirect_uri', client.redirectUri)
  url.searchParams.set('scope', OIDC_SCOPE)
  url.searchParams.set('state', params.state)
  url.searchParams.set('code_challenge', params.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export async function exchangeCode(
  endpoints: OidcEndpoints,
  client: OidcClient,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(endpoints.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: client.redirectUri,
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  // Fehlermeldungen enthalten bewusst nur den Status, nie Antwortinhalt oder Secrets.
  if (!response.ok) throw new Error(`Token-Austausch fehlgeschlagen (HTTP ${response.status})`)

  const json = (await response.json()) as Record<string, unknown>
  const accessToken = json.access_token
  const tokenType = json.token_type
  if (typeof accessToken !== 'string' || !accessToken) throw new Error('Token-Antwort ohne access_token')
  if (typeof tokenType === 'string' && tokenType.toLowerCase() !== 'bearer') {
    throw new Error('Token-Antwort mit unerwartetem token_type')
  }
  return accessToken
}

export async function fetchUserinfo(
  endpoints: OidcEndpoints,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OidcUser> {
  const response = await fetchImpl(endpoints.userinfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`userinfo fehlgeschlagen (HTTP ${response.status})`)

  const json = (await response.json()) as Record<string, unknown>
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

  const sub = text(json.sub)
  if (!sub) throw new Error('userinfo ohne sub')

  const groups = Array.isArray(json.groups)
    ? json.groups.filter((group): group is string => typeof group === 'string').slice(0, MAX_GROUPS)
    : []

  return {
    sub,
    name: text(json.name) || text(json.preferred_username) || sub,
    email: text(json.email) || null,
    groups,
  }
}
