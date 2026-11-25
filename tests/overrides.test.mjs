import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyOverride, readOverrides, sanitizeMap, sanitizeOverride, writeOverride } from '../lib/overrides.ts'
import { isSameOriginJson } from '../lib/same-origin.ts'
import { ICON_KEYS, sortEntries } from '../lib/services.ts'

const svc = (id, name = id, extra = {}) => ({
  id, name, description: 'Beschreibung', url: null, icon: 'box', status: 'online', statusText: '', keywords: [], groups: [], ...extra,
})
const headers = (values) => ({ get: (name) => values[name.toLowerCase()] ?? null })

test('Eingaben: Felder werden gekürzt, geprüft; unbekannte und ungültige fallen weg', () => {
  const result = sanitizeOverride(
    { name: '  Filme  ', description: 'x'.repeat(500), category: ' Medien ', icon: 'play', hidden: true, order: 3, evil: '<script>' },
    ICON_KEYS,
  )
  assert.deepEqual(result, { name: 'Filme', description: 'x'.repeat(160), category: 'Medien', icon: 'play', hidden: true, order: 3 })

  assert.deepEqual(sanitizeOverride({ icon: 'virus', order: 1.5, hidden: 'ja' }, ICON_KEYS), null)
  assert.equal(sanitizeOverride({ order: 5000 }, ICON_KEYS), null)
  assert.equal(sanitizeOverride({ name: '   ' }, ICON_KEYS), null)
  assert.equal(sanitizeOverride('text', ICON_KEYS), null)
  assert.equal(sanitizeOverride([], ICON_KEYS), null)
})

test('Datei-Inhalt: ungültige IDs und Einträge werden einzeln verworfen', () => {
  const map = sanitizeMap({ 'gut-1': { name: 'A' }, '../etc': { name: 'B' }, 'Gross': { name: 'C' }, leer: {} }, ICON_KEYS)
  assert.deepEqual(Object.keys(map), ['gut-1'])
  assert.deepEqual(sanitizeMap(null, ICON_KEYS), {})
})

test('applyOverride: Anpassung hat Vorrang, ohne Anpassung bleibt alles gleich', () => {
  const base = svc('a', 'Alt', { category: 'Label-Kategorie' })
  assert.equal(applyOverride(base, undefined), base)
  const result = applyOverride(base, { name: 'Neu', order: 2, hidden: true })
  assert.equal(result.name, 'Neu')
  assert.equal(result.category, 'Label-Kategorie')
  assert.equal(result.description, 'Beschreibung')
  assert.equal(result.order, 2)
  assert.equal(result.hidden, true)
  assert.deepEqual(result.override, { name: 'Neu', order: 2, hidden: true })
})

test('Sortierung: feste Position zuerst, dann nach Name', () => {
  const entries = ['Zeta', 'Alpha', 'Mitte'].map((name) => ({ groups: [], service: svc(name.toLowerCase(), name) }))
  entries[0].service.order = 1
  entries[2].service.order = -1
  assert.deepEqual(sortEntries(entries).map((e) => e.service.name), ['Mitte', 'Zeta', 'Alpha'])
})

test('Speichern: schreiben, lesen, ersetzen, löschen; Datei ist nur für den Besitzer lesbar', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'overrides-'))
  assert.deepEqual(await readOverrides(dir, ICON_KEYS), {})

  await writeOverride(dir, 'jellyfin', { name: 'Filme' }, ICON_KEYS)
  await writeOverride(dir, 'immich', { hidden: true }, ICON_KEYS)
  assert.deepEqual(await readOverrides(dir, ICON_KEYS), { jellyfin: { name: 'Filme' }, immich: { hidden: true } })

  await writeOverride(dir, 'jellyfin', { name: 'Kino', order: 1 }, ICON_KEYS)
  assert.equal((await readOverrides(dir, ICON_KEYS)).jellyfin.name, 'Kino')

  await writeOverride(dir, 'immich', null, ICON_KEYS)
  assert.deepEqual(Object.keys(await readOverrides(dir, ICON_KEYS)), ['jellyfin'])

  const { stat } = await import('node:fs/promises')
  assert.equal((await stat(path.join(dir, 'overrides.json'))).mode & 0o077, 0)
})

test('Speichern: gleichzeitige Schreibvorgänge gehen nicht verloren', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'overrides-'))
  await Promise.all(Array.from({ length: 15 }, (_, i) => writeOverride(dir, `dienst-${i}`, { order: i }, ICON_KEYS)))
  assert.equal(Object.keys(await readOverrides(dir, ICON_KEYS)).length, 15)
})

test('Speichern: kaputte Datei ergibt eine leere Liste statt eines Absturzes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'overrides-'))
  await writeFile(path.join(dir, 'overrides.json'), '{ kaputt')
  const original = console.error
  console.error = () => {}
  try {
    assert.deepEqual(await readOverrides(dir, ICON_KEYS), {})
  } finally {
    console.error = original
  }
})

test('CSRF-Schutz: nur JSON von derselben Seite', () => {
  const json = 'application/json'
  assert.equal(isSameOriginJson(headers({ 'content-type': json, 'sec-fetch-site': 'same-origin' })), true)
  assert.equal(isSameOriginJson(headers({ 'content-type': json, 'sec-fetch-site': 'cross-site' })), false)
  assert.equal(isSameOriginJson(headers({ 'content-type': json, 'sec-fetch-site': 'same-site' })), false)
  // Formular von einer fremden Seite
  assert.equal(isSameOriginJson(headers({ 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' })), false)
  assert.equal(isSameOriginJson(headers({ 'content-type': 'text/plain', origin: 'http://dashboard.home.arpa:8080', host: 'dashboard.home.arpa' })), false)
  // ohne Sec-Fetch-Site: Origin gegen Host, Port egal (Proxy lässt ihn oft weg)
  assert.equal(isSameOriginJson(headers({ 'content-type': json, origin: 'http://dashboard.home.arpa:8080', host: 'dashboard.home.arpa' })), true)
  assert.equal(isSameOriginJson(headers({ 'content-type': json, origin: 'http://evil.example', host: 'dashboard.home.arpa' })), false)
  assert.equal(isSameOriginJson(headers({ 'content-type': json, origin: 'null', host: 'dashboard.home.arpa' })), false)
  assert.equal(isSameOriginJson(headers({ 'content-type': json })), false)
})

test('Oberfläche: Anpassen-Knopf nur für Admins, Route prüft Admin und Herkunft', async () => {
  const route = await readFile(new URL('../app/api/overrides/route.ts', import.meta.url), 'utf8')
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8')
  assert.match(route, /requireApiAuth\(\{ admin: true \}\)/)
  assert.match(route, /isSameOriginJson/)
  assert.match(page, /canCustomize=\{isAdmin\}/)
})
