import { NextResponse } from 'next/server'
import { OIDC_TTL_SECONDS, cookieNames, cookieOptions } from '@/lib/auth-cookies'
import { getConfigState } from '@/lib/config'
import { buildAuthorizeUrl, createPkce, createState, discover } from '@/lib/oidc'
import { signToken } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Startet den Login: PKCE und state erzeugen, im signierten Cookie merken, zu Authentik weiterleiten. */
export async function GET() {
  const { config } = getConfigState()
  if (!config || !config.oidc || !config.publicUrl || !config.sessionSecret) {
    return new Response(null, { status: 303, headers: { Location: '/login?error=config', 'Cache-Control': 'no-store' } })
  }
  const { oidc, publicUrl, sessionSecret } = config

  const back = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, publicUrl), 303)

  try {
    const endpoints = await discover(oidc.issuer)
    const { verifier, challenge } = createPkce()
    const state = createState()

    const target = buildAuthorizeUrl(
      endpoints,
      { ...oidc, redirectUri: `${publicUrl}/api/auth/callback` },
      { state, challenge },
    )

    const exp = Math.floor(Date.now() / 1000) + OIDC_TTL_SECONDS
    const cookie = signToken('oidc', { state, verifier, exp }, sessionSecret)

    const response = NextResponse.redirect(target, 303)
    response.cookies.set(cookieNames(config.secureCookies).oidc, cookie, cookieOptions(config.secureCookies, OIDC_TTL_SECONDS))
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('[auth] Login konnte nicht gestartet werden:', error instanceof Error ? error.message : error)
    return back('idp')
  }
}
