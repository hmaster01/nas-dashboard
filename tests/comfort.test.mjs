import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { test } from 'node:test'
import { entriesFromDiscovery, parseExtraServices } from '../lib/services.ts'
import { groupByCategory } from '../lib/services-view.ts'

const svc = (id, category) => ({
  id,
  name: id,
  description: '',
  url: null,
  icon: 'box',
  status: 'online',
  statusText: '',
  keywords: [],
  groups: [],
  ...(category ? { category } : {}),
})

const container = (name, labels) => ({
  id: name,
  container: name,
  image: 'x',
  state: 'running',
  status: 'Up',
  health: 'none',
  created: 0,
  labels: { 'dashboard.name': name, ...labels },
})

test('Kategorien: ohne Kategorie ein flaches Raster ohne Überschrift', () => {
  assert.deepEqual(groupByCategory([]), [])
  const sections = groupByCategory([svc('a'), svc('b')])
  assert.equal(sections.length, 1)
  assert.equal(sections[0].title, null)
  assert.deepEqual(sections[0].services.map((s) => s.id), ['a', 'b'])
})

test('Kategorien: alphabetisch, Schreibweise egal, Rest zuletzt unter "Weitere"', () => {
  const sections = groupByCategory([svc('x'), svc('j', 'Medien'), svc('v', 'verwaltung'), svc('i', 'medien'), svc('p', 'Dokumente')])
  assert.deepEqual(sections.map((s) => s.title), ['Dokumente', 'Medien', 'verwaltung', 'Weitere'])
  assert.deepEqual(sections[1].services.map((s) => s.id), ['j', 'i'])
  assert.deepEqual(sections[3].services.map((s) => s.id), ['x'])
})

test('Kategorien: Label dashboard.category wird gelesen, gekürzt und leer ignoriert', () => {
  const entries = entriesFromDiscovery({
    available: true,
    containers: [
      container('jellyfin', { 'dashboard.category': '  Medien  ' }),
      container('paperless', { 'dashboard.category': 'x'.repeat(100) }),
      container('vault', { 'dashboard.category': '   ' }),
      container('plain', {}),
    ],
  })
  const byName = Object.fromEntries(entries.map((e) => [e.service.name, e.service]))
  assert.equal(byName.jellyfin.category, 'Medien')
  assert.equal(byName.paperless.category.length, 40)
  assert.equal('category' in byName.vault, false)
  assert.equal('category' in byName.plain, false)
})

test('Kategorien: auch in config/services.json', () => {
  const { entries, errors } = parseExtraServices(JSON.stringify([{ name: 'OMV', port: 80, category: 'Verwaltung' }]))
  assert.deepEqual(errors, [])
  assert.equal(entries[0].service.category, 'Verwaltung')
})

test('PWA: Manifest und Icons sind vorhanden und ohne Anmeldung abrufbar', async () => {
  const manifest = await readFile(new URL('../app/manifest.ts', import.meta.url), 'utf8')
  const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8')
  for (const icon of ['pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png']) {
    assert.match(manifest, new RegExp(`/${icon.replace('.', '\\.')}`))
    assert.match(proxy, new RegExp(icon.replace('.', '\\.')))
    assert.ok((await stat(new URL(`../public/${icon}`, import.meta.url))).size > 500, icon)
  }
  assert.match(proxy, /manifest\.webmanifest/)
  assert.match(manifest, /display: 'standalone'/)
  assert.doesNotMatch(manifest, /serviceWorker/)
})

test('Suche: "/" fokussiert, Enter öffnet den ersten Treffer, Alt+Enter im neuen Tab', async () => {
  const search = await readFile(new URL('../components/spotlight-search.tsx', import.meta.url), 'utf8')
  const grid = await readFile(new URL('../components/service-grid.tsx', import.meta.url), 'utf8')
  assert.match(search, /event\.key !== '\/'/)
  assert.match(search, /onSubmit\(\{ newTab: event\.altKey \}\)/)
  assert.match(grid, /window\.open\(href, '_blank', 'noopener,noreferrer'\)/)
  assert.match(grid, /window\.location\.assign\(href\)/)
})

// ---------------------------------------------------------------- alle Container, Einbetten

const withPorts = (name, ports, labels = {}) => ({ ...container(name, labels), labels, ports })

test('showAll: Container ohne Label erscheinen nur mit veröffentlichtem Port und nur als Admin-Eintrag', () => {
  const discovery = {
    available: true,
    containers: [
      withPorts('nextcloud', [{ public: 8081, private: 80 }]),
      withPorts('nextcloud-db', []),
      withPorts('npm-admin', [{ public: 8443, private: 443 }]),
      withPorts('geheim', [{ public: 9999, private: 9999 }], { 'dashboard.hide': 'true' }),
      withPorts('jellyfin', [{ public: 8096, private: 8096 }], { 'dashboard.name': 'Jellyfin' }),
    ],
  }
  assert.deepEqual(entriesFromDiscovery(discovery).map((e) => e.service.name), ['Jellyfin'])

  const entries = entriesFromDiscovery(discovery, { showAll: true })
  assert.deepEqual(entries.map((e) => e.service.name).sort(), ['Jellyfin', 'nextcloud', 'npm-admin'])
  const byName = Object.fromEntries(entries.map((e) => [e.service.name, e]))
  assert.equal(byName.nextcloud.adminOnly, true)
  assert.equal(byName.nextcloud.service.port, 8081)
  assert.equal(byName.nextcloud.service.protocol, 'http')
  assert.equal(byName['npm-admin'].service.protocol, 'https')
  assert.equal(byName.Jellyfin.adminOnly, undefined)
  assert.match(byName.nextcloud.service.groups[0].rows.map((r) => `${r.label}:${r.value}`).join('|'), /Ports:8081 → 80/)
})

test('showAll: dashboard.hide nimmt auch beschriftete Container aus; alter Agent ohne ports geht nicht kaputt', () => {
  const oldAgent = { ...container('alt', {}), labels: {} } // kein "ports"-Feld wie bei einem älteren Agent
  const entries = entriesFromDiscovery(
    {
      available: true,
      containers: [withPorts('a', [{ public: 1, private: 1 }], { 'dashboard.name': 'A', 'dashboard.hide': 'yes' }), oldAgent],
    },
    { showAll: true },
  )
  assert.deepEqual(entries, [])
})

test('Label dashboard.embed wird gelesen', () => {
  const [entry] = entriesFromDiscovery({
    available: true,
    containers: [container('immich', { 'dashboard.embed': 'true', 'dashboard.port': '2283' })],
  })
  assert.equal(entry.service.embed, true)
  const [plain] = entriesFromDiscovery({ available: true, containers: [container('x', {})] })
  assert.equal('embed' in plain.service, false)
})

test('Einbetten: CSP erlaubt frame-src nur mit DASHBOARD_EMBED, iframe ist abgeschottet', async () => {
  const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8')
  const grid = await readFile(new URL('../components/service-grid.tsx', import.meta.url), 'utf8')
  assert.match(proxy, /DASHBOARD_EMBED/)
  assert.match(proxy, /frame-src 'none'/)
  assert.match(proxy, /frame-ancestors 'none'/)
  assert.match(grid, /<iframe/)
  assert.match(grid, /sandbox="[^"]*allow-scripts[^"]*"/)
  assert.match(grid, /referrerPolicy="no-referrer"/)
  assert.doesNotMatch(grid, /allow-top-navigation/)
})
