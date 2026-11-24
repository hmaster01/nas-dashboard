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
