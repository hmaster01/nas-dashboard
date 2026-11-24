import { NextResponse, type NextRequest } from 'next/server'
import { cookieNames } from '@/lib/auth-cookies'
import { checkBasicAuth, createLoginRateLimiter } from '@/lib/basic-auth.mjs'
import { authModeFromEnv, getConfigState } from '@/lib/config'
import { decideOidcGate } from '@/lib/gate'
import { isHostAllowed, parseAllowedHosts } from '@/lib/hosts'
import { readSessionToken } from '@/lib/session'

const loginLimiter = createLoginRateLimiter()
// ALLOWED_HOSTS: ohne Angabe wird der Host-Header nicht geprüft (siehe lib/hosts.ts).
const parsedHosts = parseAllowedHosts(process.env.ALLOWED_HOSTS)
const allowedHosts = parsedHosts.hosts
if (parsedHosts.invalid.length > 0) {
  console.warn(`[config] ALLOWED_HOSTS: ungültige Einträge werden ignoriert: ${parsedHosts.invalid.join(', ')}`)
}

function securityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://ipapi.co https://api.open-meteo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
  return response
}

export function proxy(request: NextRequest) {
  // Anfragen unter einem fremden Namen kommen gar nicht erst zur Anmeldung.
  if (!isHostAllowed(request.headers.get('host'), allowedHosts)) {
    return securityHeaders(NextResponse.json({ error: 'Unknown host.' }, { status: 421 }))
  }

  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const clientKey = forwardedFor || request.headers.get('x-real-ip') || 'unknown-client'
  if (loginLimiter.isLimited(clientKey)) {
    const response = NextResponse.json({ error: 'Too many authentication attempts.' }, { status: 429 })
    response.headers.set('Retry-After', '300')
    return securityHeaders(response)
  }

  // Anmeldung über Authentik (nur wenn OIDC_ISSUER gesetzt ist): statt Basic-Auth zählt die Sitzung.
  // Ist die Einrichtung unvollständig, gibt es keine Sitzung — alles außer der Anmeldeseite bleibt zu.
  if (authModeFromEnv() === 'oidc') {
    const { config } = getConfigState()
    const cookie = config ? request.cookies.get(cookieNames(config.secureCookies).session)?.value : undefined
    const hasSession = Boolean(config?.sessionSecret && readSessionToken(cookie, config.sessionSecret))

    const decision = decideOidcGate(request.nextUrl.pathname, hasSession)
    if (decision === 'login') {
      // Relative Adresse: hinter einem Reverse-Proxy ist der Host der Anfrage nicht der öffentliche.
      return securityHeaders(new NextResponse(null, { status: 307, headers: { Location: '/login', 'Cache-Control': 'no-store' } }))
    }
    if (decision === 'deny') {
      return securityHeaders(NextResponse.json({ error: 'Authentication required.' }, { status: 401 }))
    }
    return securityHeaders(NextResponse.next())
  }

  const auth = checkBasicAuth(request.headers.get('authorization'))
  if (!auth.allowed) {
    if (auth.status === 401) loginLimiter.recordFailure(clientKey)
    const response = NextResponse.json(
      { error: auth.status === 503 ? 'Dashboard authentication is not configured.' : 'Authentication required.' },
      { status: auth.status },
    )
    if (auth.status === 401) response.headers.set('WWW-Authenticate', 'Basic realm="NAS Dashboard", charset="UTF-8"')
    return securityHeaders(response)
  }

  loginLimiter.reset(clientKey)
  return securityHeaders(NextResponse.next())
}

export const config = {
  // manifest.webmanifest und die App-Icons holt der Browser ohne Zugangsdaten ab; sie enthalten nichts Geheimes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|pwa-192.png|pwa-512.png|pwa-maskable-512.png).*)'],
}
