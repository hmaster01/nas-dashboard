/**
 * Signierte Cookie-Inhalte ohne Zusatzpakete (nur node:crypto).
 *
 * Format: base64url(JSON) + "." + base64url(HMAC-SHA256).
 * Jeder Zweck ("session", "oidc") bekommt seine eigene Signatur, damit ein
 * Login-Zwischenstand nicht als Sitzung missbraucht werden kann.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export type TokenPayload = { exp: number } & Record<string, unknown>

export type SessionUser = {
  sub: string
  name: string
  email: string | null
  groups: string[]
}

export type SessionData = SessionUser & { exp: number }

export const SESSION_PURPOSE = 'session'
const MAX_TOKEN_LENGTH = 8192

const macFor = (purpose: string, body: string, secret: string): Buffer =>
  createHmac('sha256', secret).update(`${purpose}.${body}`).digest()

const nowInSeconds = () => Math.floor(Date.now() / 1000)

export function signToken(purpose: string, payload: TokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${macFor(purpose, body, secret).toString('base64url')}`
}

/** Gibt den Inhalt zurück, wenn Signatur, Zweck und Ablaufzeit stimmen — sonst null. */
export function verifyToken(
  purpose: string,
  token: string | undefined | null,
  secret: string,
  now: number = nowInSeconds(),
): TokenPayload | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [body, signature] = parts
  const expected = macFor(purpose, body, secret)
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (typeof payload !== 'object' || payload === null) return null
  const exp = (payload as { exp?: unknown }).exp
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= now) return null

  return payload as TokenPayload
}

export function createSessionToken(
  user: SessionUser,
  secret: string,
  ttlSeconds: number,
  now: number = nowInSeconds(),
): string {
  return signToken(
    SESSION_PURPOSE,
    { sub: user.sub, name: user.name, email: user.email, groups: user.groups, exp: now + ttlSeconds },
    secret,
  )
}

export function readSessionToken(
  token: string | undefined | null,
  secret: string,
  now: number = nowInSeconds(),
): SessionData | null {
  const payload = verifyToken(SESSION_PURPOSE, token, secret, now)
  if (!payload) return null

  const { sub, name, email, groups } = payload
  if (typeof sub !== 'string' || !sub) return null
  if (typeof name !== 'string') return null
  if (email !== null && typeof email !== 'string') return null
  if (!Array.isArray(groups) || !groups.every((group) => typeof group === 'string')) return null

  return { sub, name, email, groups: groups as string[], exp: payload.exp }
}

/** Zeitkonstanter Stringvergleich (z. B. für den OIDC-state). */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest()
  const right = createHash('sha256').update(b).digest()
  return timingSafeEqual(left, right)
}
