import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { ID_PATTERN, sanitizeOverride, writeOverride } from '@/lib/overrides'
import { isSameOriginJson } from '@/lib/same-origin'
import { requireApiAuth } from '@/lib/server-auth'
import { ICON_KEYS } from '@/lib/services'

export const dynamic = 'force-dynamic'

const MAX_BODY = 4096

/** Speichert (oder löscht) die Anpassung eines Dienstes. Nur für Admins. Body: { id, override: {…} | null } */
export async function PUT(request: Request) {
  const auth = await requireApiAuth({ admin: true })
  if (!auth.ok) return auth.response
  const { config } = auth

  if (!isSameOriginJson(await headers())) {
    return NextResponse.json({ error: 'Anfrage nicht erlaubt.' }, { status: 403 })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY) return NextResponse.json({ error: 'Anfrage zu groß.' }, { status: 413 })

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON.' }, { status: 400 })
  }

  const { id, override } = (typeof body === 'object' && body !== null ? body : {}) as { id?: unknown; override?: unknown }
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Ungültige Dienst-ID.' }, { status: 400 })
  }

  // Eine leere oder ungültige Eingabe zählt wie "zurücksetzen".
  const clean = override === null ? null : sanitizeOverride(override, ICON_KEYS)

  try {
    await writeOverride(config.dataDir, id, clean, ICON_KEYS)
  } catch (error) {
    console.error('[overrides] Speichern fehlgeschlagen:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Speichern nicht möglich (Datenordner nicht beschreibbar?).' }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
