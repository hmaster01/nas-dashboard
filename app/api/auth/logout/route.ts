import { NextRequest, NextResponse } from 'next/server'
import { cookieNames, cookieOptions } from '@/lib/auth-cookies'
import { getConfigState } from '@/lib/config'

export const dynamic = 'force-dynamic'

/**
 * Beendet nur die Sitzung im Dashboard. Die Anmeldung bei Authentik bleibt bestehen,
 * ein erneuter Login geht deshalb ohne Passwort — wer sich auch dort abmelden will,
 * nutzt Authentik selbst.
 */
export async function POST(request: NextRequest) {
  const { config } = getConfigState()
  // Basic-Auth kennt kein Abmelden (der Browser merkt sich die Zugangsdaten) — nichts zu tun.
  if (!config || !config.publicUrl) {
    return new Response(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store' } })
  }
  const { publicUrl } = config

  // Zusätzlicher Schutz gegen fremde Seiten, die ein Formular hierher abschicken.
  const origin = request.headers.get('origin')
  if (origin && origin !== publicUrl) {
    return NextResponse.json({ error: 'Ungültiger Ursprung' }, { status: 403 })
  }

  const response = NextResponse.redirect(new URL('/login', publicUrl), 303)
  response.cookies.set(cookieNames(config.secureCookies).session, '', cookieOptions(config.secureCookies, 0))
  response.headers.set('Cache-Control', 'no-store')
  return response
}
