import { NextRequest, NextResponse } from 'next/server'
import { SESSION_TTL_SECONDS, cookieNames, cookieOptions } from '@/lib/auth-cookies'
import { getConfigState } from '@/lib/config'
import { discover, exchangeCode, fetchUserinfo } from '@/lib/oidc'
import { createSessionToken, safeEqual, verifyToken } from '@/lib/session'

export const dynamic = 'force-dynamic'

const MAX_PARAM_LENGTH = 2048

/** Rücksprung von Authentik: state prüfen, Code gegen Token tauschen, Sitzung anlegen. */
export async function GET(request: NextRequest) {
  const { config } = getConfigState()
  if (!config || !config.oidc || !config.publicUrl || !config.sessionSecret) {
    return new Response(null, { status: 303, headers: { Location: '/login?error=config', 'Cache-Control': 'no-store' } })
  }
  const { oidc, publicUrl, sessionSecret } = config

  const names = cookieNames(config.secureCookies)

  // Der Zwischenstand (state + PKCE) ist nach jedem Versuch verbraucht, egal wie er ausgeht.
  const finish = (target: string) => {
    const response = NextResponse.redirect(new URL(target, publicUrl), 303)
    response.cookies.set(names.oidc, '', cookieOptions(config.secureCookies, 0))
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  const params = request.nextUrl.searchParams
  if (params.get('error')) return finish('/login?error=denied')

  const code = params.get('code') ?? ''
  const state = params.get('state') ?? ''
  if (!code || !state || code.length > MAX_PARAM_LENGTH || state.length > MAX_PARAM_LENGTH) {
    return finish('/login?error=state')
  }

  const pending = verifyToken('oidc', request.cookies.get(names.oidc)?.value, sessionSecret)
  if (
    !pending ||
    typeof pending.state !== 'string' ||
    typeof pending.verifier !== 'string' ||
    !safeEqual(state, pending.state)
  ) {
    return finish('/login?error=state')
  }

  try {
    const client = { ...oidc, redirectUri: `${publicUrl}/api/auth/callback` }
    const endpoints = await discover(oidc.issuer)
    const accessToken = await exchangeCode(endpoints, client, code, pending.verifier)
    const user = await fetchUserinfo(endpoints, accessToken)

    const response = finish('/')
    response.cookies.set(
      names.session,
      createSessionToken(user, sessionSecret, SESSION_TTL_SECONDS),
      cookieOptions(config.secureCookies, SESSION_TTL_SECONDS),
    )
    return response
  } catch (error) {
    console.error('[auth] Anmeldung fehlgeschlagen:', error instanceof Error ? error.message : error)
    return finish('/login?error=failed')
  }
}
