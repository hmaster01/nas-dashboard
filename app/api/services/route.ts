import { readFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { agentGet } from '@/lib/agent-client'
import { canSee } from '@/lib/groups'
import { entriesFromDiscovery, parseExtraServices, sortEntries } from '@/lib/services'
import type { ServiceEntry } from '@/lib/services'
import { requireApiAuth } from '@/lib/server-auth'
import { staticServiceDtos } from '@/lib/static-services'
import type { DiscoveryResponse, ServicesResponse } from '@/lib/types'

export const dynamic = 'force-dynamic'

async function readExtras(path: string): Promise<{ entries: ServiceEntry[]; warnings: string[] }> {
  try {
    const { entries, errors } = parseExtraServices(await readFile(path, 'utf8'))
    return { entries, warnings: errors }
  } catch (error) {
    // Keine Datei ist der Normalfall (Handeinträge sind optional).
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], warnings: [] }
    console.error('[services] services.json nicht lesbar:', error instanceof Error ? error.message : error)
    return { entries: [], warnings: ['services.json ist nicht lesbar'] }
  }
}

/** Dienste für den angemeldeten Nutzer: nur das, wofür seine Gruppen reichen. */
export async function GET() {
  const auth = await requireApiAuth()
  if (!auth.ok) return auth.response
  const { config, session, isAdmin, warnings } = auth

  const extras = await readExtras(config.extraServicesFile)
  const adminWarnings = isAdmin ? [...warnings, ...extras.warnings] : []

  // Ohne Agent bleibt es bei der festen Liste (wie vor der Docker-Erkennung).
  if (!config.agent) {
    const body: ServicesResponse = {
      services: staticServiceDtos(),
      discovery: { configured: false, available: false },
      ...(adminWarnings.length > 0 ? { warnings: adminWarnings } : {}),
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
  }

  let discovery: DiscoveryResponse
  try {
    discovery = await agentGet<DiscoveryResponse>(config.agent, '/discovery')
    if (!discovery || !Array.isArray(discovery.containers)) throw new Error('Unerwartete Agent-Antwort')
  } catch (error) {
    console.error('[services] Agent nicht erreichbar:', error instanceof Error ? error.message : error)
    discovery = { available: false, containers: [], error: 'Agent nicht erreichbar' }
  }

  // Basic-Modus: ein Konto, das alles sehen darf. OIDC-Modus: nur, was die Gruppen des Nutzers erlauben.
  // Automatisch erkannte Container (DASHBOARD_SHOW_ALL) sehen nur Admins. Einbetten gilt nur mit DASHBOARD_EMBED.
  const visible = sortEntries([...entriesFromDiscovery(discovery, { showAll: config.showAll }), ...extras.entries])
    .filter((entry) => isAdmin || (!entry.adminOnly && canSee(entry.groups, session.groups, config.adminGroups)))
    .map((entry) => (config.embed ? entry.service : { ...entry.service, embed: undefined }))

  const body: ServicesResponse = {
    services: visible,
    discovery: { configured: true, available: discovery.available, ...(discovery.error ? { error: discovery.error } : {}) },
    ...(adminWarnings.length > 0 ? { warnings: adminWarnings } : {}),
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
