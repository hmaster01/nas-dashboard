/** Cookie-Namen und -Optionen. Mit HTTPS gilt das __Host--Präfix (kein Domain-Cookie, nur Secure, nur Pfad "/"). */

export const SESSION_TTL_SECONDS = 8 * 60 * 60
export const OIDC_TTL_SECONDS = 10 * 60

export function cookieNames(secure: boolean): { session: string; oidc: string } {
  const prefix = secure ? '__Host-' : ''
  return { session: `${prefix}nd_session`, oidc: `${prefix}nd_oidc` }
}

/** SameSite=Lax: Der Rücksprung von Authentik ist eine normale Weiterleitung und muss das Cookie mitbringen. */
export function cookieOptions(secure: boolean, maxAge: number) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge }
}
