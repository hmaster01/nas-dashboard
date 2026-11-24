import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { checkBasicAuth } from '@/lib/basic-auth.mjs'
import { cookieNames } from '@/lib/auth-cookies'
import { getConfigState } from '@/lib/config'
import type { AppConfig } from '@/lib/config'
import { isAdminUser } from '@/lib/groups'
import { readSessionToken } from '@/lib/session'
import type { SessionData } from '@/lib/session'

export type AuthState =
  | { config: null; problems: string[]; warnings: string[]; session: null; isAdmin: false }
  | { config: AppConfig; problems: string[]; warnings: string[]; session: SessionData | null; isAdmin: boolean }

/**
 * Liest Konfiguration und Anmeldung. Ohne gültige Konfiguration gibt es nie eine Sitzung (fail closed).
 *
 * Basic-Modus: proxy.ts hat die Anmeldung schon geprüft. Hier wird sie zur Sicherheit noch einmal
 * geprüft, und der angemeldete Nutzer gilt als Admin (es gibt nur dieses eine Konto).
 * OIDC-Modus: Sitzung aus dem signierten Cookie, Admin ist, wer in einer der ADMIN_GROUPS ist.
 */
export async function getAuth(): Promise<AuthState> {
  const state = getConfigState()
  if (!state.config) {
    return { config: null, problems: state.problems, warnings: state.warnings, session: null, isAdmin: false }
  }

  const { config, warnings } = state

  if (config.authMode === 'basic') {
    const check = checkBasicAuth((await headers()).get('authorization'))
    if (!check.allowed) return { config, problems: [], warnings, session: null, isAdmin: false }

    const name = process.env.DASHBOARD_USERNAME || 'Administrator'
    return { config, problems: [], warnings, session: { sub: 'basic', name, email: null, groups: [], exp: 0 }, isAdmin: true }
  }

  const jar = await cookies()
  const names = cookieNames(config.secureCookies)
  const session = config.sessionSecret ? readSessionToken(jar.get(names.session)?.value, config.sessionSecret) : null

  return {
    config,
    problems: [],
    warnings,
    session,
    isAdmin: session ? isAdminUser(session.groups, config.adminGroups) : false,
  }
}

const json = (status: number, body: unknown) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export type ApiAuth =
  | { ok: true; config: AppConfig; session: SessionData; isAdmin: boolean; warnings: string[] }
  | { ok: false; response: NextResponse }

/** Für API-Routen: 401 ohne Anmeldung, 403 wenn Admin verlangt wird und der Nutzer keiner ist. */
export async function requireApiAuth(options: { admin?: boolean } = {}): Promise<ApiAuth> {
  const auth = await getAuth()
  if (!auth.config || !auth.session) return { ok: false, response: json(401, { error: 'Nicht angemeldet' }) }
  if (options.admin && !auth.isAdmin) return { ok: false, response: json(403, { error: 'Keine Berechtigung' }) }
  return { ok: true, config: auth.config, session: auth.session, isAdmin: auth.isAdmin, warnings: auth.warnings }
}
