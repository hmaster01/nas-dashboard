import { NextResponse, type NextRequest } from 'next/server'
import { checkBasicAuth } from '@/lib/basic-auth.mjs'

function securityHeaders(response: NextResponse) {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://ipapi.co https://api.open-meteo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
  return response
}

export function proxy(request: NextRequest) {
  const auth = checkBasicAuth(request.headers.get('authorization'))
  if (!auth.allowed) {
    const response = NextResponse.json(
      { error: auth.status === 503 ? 'Dashboard authentication is not configured.' : 'Authentication required.' },
      { status: auth.status },
    )
    if (auth.status === 401) response.headers.set('WWW-Authenticate', 'Basic realm="NAS Dashboard", charset="UTF-8"')
    return securityHeaders(response)
  }

  return securityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
