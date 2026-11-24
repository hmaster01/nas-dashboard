import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canSee } from '../lib/groups.ts'
import {
  formatBytes,
  formatUptime,
  legacyModalFor,
  legacyReadoutsFor,
  modalFor,
  readoutsFor,
} from '../lib/metrics-view.ts'
import {
  entriesFromDiscovery,
  iconFor,
  parseExtraServices,
  portFrom,
  protocolFrom,
  safeUrl,
  slug,
  sortEntries,
  statusFor,
} from '../lib/services.ts'

const container = (over = {}) => ({
  id: 'abc',
  container: 'jellyfin',
  image: 'jellyfin/jellyfin:10',
  state: 'running',
  status: 'Up 3 days (healthy)',
  health: 'healthy',
  created: 1,
  labels: { 'dashboard.name': 'Jellyfin' },
  ...over,
})
const discovery = (...containers) => ({ available: true, containers })

// ---------------------------------------------------------------- URLs & Icons

test('safeUrl lässt nur http(s) ohne Zugangsdaten zu', () => {
  assert.equal(safeUrl('http://192.168.178.75:8096/'), 'http://192.168.178.75:8096/')
  assert.equal(safeUrl('https://jellyfin.home.arpa'), 'https://jellyfin.home.arpa/')
  for (const bad of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://nas/',
    'http://user:pass@host/',
    '//evil.example',
    'kein url',
    '',
    undefined,
    null,
    42,
    'http://a.b/' + 'x'.repeat(400),
  ]) {
    assert.equal(safeUrl(bad), null, `sollte abgelehnt werden: ${String(bad).slice(0, 40)}`)
  }
})

test('iconFor fällt bei Unbekanntem auf "box" zurück', () => {
  assert.equal(iconFor('Server'), 'server')
  assert.equal(iconFor('play'), 'play')
  assert.equal(iconFor('<script>'), 'box')
  assert.equal(iconFor(undefined), 'box')
})

test('slug erzeugt stabile, sichere IDs', () => {
  assert.equal(slug('Paperless-ngx'), 'paperless-ngx')
  assert.equal(slug('  Home Assistant!! '), 'home-assistant')
  assert.equal(slug('äöü'), 'dienst')
})

// ---------------------------------------------------------------- Status

test('statusFor: nur laufend und gesund ist online', () => {
  assert.deepEqual(statusFor('running', 'healthy').status, 'online')
  assert.deepEqual(statusFor('running', 'none').status, 'online')
  assert.equal(statusFor('running', 'unhealthy').status, 'degraded')
  assert.equal(statusFor('running', 'starting').status, 'degraded')
  assert.equal(statusFor('restarting', 'none').status, 'degraded')
  assert.equal(statusFor('paused', 'none').status, 'degraded')
  assert.equal(statusFor('exited', 'none').status, 'offline')
  assert.equal(statusFor('dead', 'none').status, 'offline')
  assert.equal(statusFor('', '').status, 'offline')
})

// ---------------------------------------------------------------- Docker-Labels → Karten

test('Container mit dashboard.name wird zur Karte, mit echtem Status', () => {
  const [entry] = entriesFromDiscovery(
    discovery(
      container({
        labels: {
          'dashboard.name': 'Jellyfin',
          'dashboard.description': 'Medien & Streaming',
          'dashboard.url': 'http://192.168.178.75:8096',
          'dashboard.icon': 'play',
          'dashboard.groups': 'family, admins',
          'dashboard.keywords': 'filme, serien',
        },
      }),
    ),
  )
  assert.equal(entry.service.name, 'Jellyfin')
  assert.equal(entry.service.status, 'online')
  assert.equal(entry.service.icon, 'play')
  assert.equal(entry.service.url, 'http://192.168.178.75:8096/')
  assert.deepEqual(entry.service.keywords, ['filme', 'serien'])
  assert.deepEqual(entry.groups, ['family', 'admins'])
  // Gruppen gehören nicht in das, was der Browser bekommt
  assert.ok(!('groups' in entry.service) || Array.isArray(entry.service.groups))
  assert.ok(!JSON.stringify(entry.service).includes('admins'))
  assert.equal(entry.service.groups[0].title, 'Container')
})

test('Ein gestoppter oder kranker Container wird nicht als online gezeigt', () => {
  const entries = entriesFromDiscovery(
    discovery(
      container({ container: 'a', state: 'exited', status: 'Exited (1) 2 hours ago', health: 'none', labels: { 'dashboard.name': 'A' } }),
      container({ container: 'b', health: 'unhealthy', status: 'Up 1 hour (unhealthy)', labels: { 'dashboard.name': 'B' } }),
    ),
  )
  assert.deepEqual(entries.map((e) => e.service.status), ['offline', 'degraded'])
})

test('Container ohne dashboard.name oder mit leerem Namen werden übersprungen', () => {
  const entries = entriesFromDiscovery(
    discovery(container({ labels: {} }), container({ labels: { 'dashboard.name': '   ' } })),
  )
  assert.equal(entries.length, 0)
})

test('Gefährliche Adresse im Label ergibt eine Karte ohne Link', () => {
  const [entry] = entriesFromDiscovery(
    discovery(container({ labels: { 'dashboard.name': 'X', 'dashboard.url': 'javascript:alert(document.cookie)' } })),
  )
  assert.equal(entry.service.url, null)
})

test('Doppelte Container-Namen bekommen eindeutige IDs', () => {
  const entries = entriesFromDiscovery(discovery(container(), container()))
  assert.equal(new Set(entries.map((e) => e.service.id)).size, 2)
})

test('Lange Texte werden gekürzt', () => {
  const [entry] = entriesFromDiscovery(
    discovery(container({ labels: { 'dashboard.name': 'N'.repeat(500), 'dashboard.description': 'D'.repeat(500) } })),
  )
  assert.equal(entry.service.name.length, 60)
  assert.equal(entry.service.description.length, 160)
})

// ---------------------------------------------------------------- Sichtbarkeit pro Nutzer

test('Sichtbarkeit: Familie sieht nur ihre Dienste, Admins sehen alles', () => {
  const entries = entriesFromDiscovery(
    discovery(
      container({ container: 'jellyfin', labels: { 'dashboard.name': 'Jellyfin', 'dashboard.groups': 'family' } }),
      container({ container: 'portainer', labels: { 'dashboard.name': 'Portainer', 'dashboard.groups': 'authentik Admins' } }),
      container({ container: 'wiki', labels: { 'dashboard.name': 'Wiki' } }), // ohne Gruppe: alle
    ),
  )
  const admins = ['authentik Admins']
  const visible = (userGroups) =>
    entries.filter((e) => canSee(e.groups, userGroups, admins)).map((e) => e.service.name)

  assert.deepEqual(visible(['family']), ['Jellyfin', 'Wiki'])
  assert.deepEqual(visible(['authentik Admins']), ['Jellyfin', 'Portainer', 'Wiki'])
  assert.deepEqual(visible([]), ['Wiki'])
})

test('Sortierung nach Name, deutsch', () => {
  const entries = entriesFromDiscovery(
    discovery(
      container({ container: 'z', labels: { 'dashboard.name': 'Zeta' } }),
      container({ container: 'o', labels: { 'dashboard.name': 'Österreich' } }),
      container({ container: 'a', labels: { 'dashboard.name': 'Alpha' } }),
    ),
  )
  assert.deepEqual(sortEntries(entries).map((e) => e.service.name), ['Alpha', 'Österreich', 'Zeta'])
})

// ---------------------------------------------------------------- Handeinträge

test('Handeinträge: gültige Datei wird gelesen, Status ist "unknown"', () => {
  const { entries, errors } = parseExtraServices(
    JSON.stringify([{ name: 'OpenMediaVault', url: 'http://192.168.178.75', icon: 'server', groups: ['authentik Admins'] }]),
  )
  assert.deepEqual(errors, [])
  assert.equal(entries[0].service.status, 'unknown')
  assert.equal(entries[0].service.id, 'extra-openmediavault')
  assert.deepEqual(entries[0].groups, ['authentik Admins'])
})

test('Handeinträge: kaputte Datei, falscher Typ, fehlender Name, schlechte URL', () => {
  assert.equal(parseExtraServices('{kaputt').errors.length, 1)
  assert.equal(parseExtraServices('{"a":1}').errors.length, 1)

  const { entries, errors } = parseExtraServices(
    JSON.stringify([{ url: 'http://x' }, 'text', { name: 'Böse', url: 'javascript:alert(1)' }, { name: 'Ok' }]),
  )
  assert.deepEqual(entries.map((e) => e.service.name), ['Böse', 'Ok'])
  assert.equal(entries[0].service.url, null)
  assert.ok(errors.some((e) => e.includes('"name" fehlt')))
  assert.ok(errors.some((e) => e.includes('Böse')))
})

// ---------------------------------------------------------------- Anzeige der Messwerte

test('formatBytes und formatUptime', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1536), '2 KB')
  assert.equal(formatBytes(8 * 1024 ** 3), '8.0 GB')
  assert.equal(formatBytes(4.1 * 1024 ** 4), '4.1 TB')
  assert.equal(formatBytes(-1), '—')
  assert.equal(formatBytes(NaN), '—')
  assert.equal(formatUptime(90061), '1d 01h')
  assert.equal(formatUptime(3700), '1h 01m')
  assert.equal(formatUptime(-5), '—')
})

const METRICS = {
  timestamp: 1,
  host: { cpuModel: 'Intel Core i5-12500T', threads: 12, uptimeSeconds: 90061, load: [0.42, 0.38, 0.31] },
  cpu: { percent: 18, perCore: [10, 20, 30], mhz: 2400, tempC: 42.4, ready: true },
  ram: {
    totalBytes: 32 * 1024 ** 3,
    usedBytes: 8 * 1024 ** 3,
    availableBytes: 24 * 1024 ** 3,
    cachedBytes: 6 * 1024 ** 3,
    swapTotalBytes: 0,
    swapUsedBytes: 0,
    percent: 25,
  },
  disks: [
    { name: 'Daten', ok: true, totalBytes: 8 * 1024 ** 4, freeBytes: 4 * 1024 ** 4, usedBytes: 4 * 1024 ** 4, percent: 50 },
    { name: 'Kaputt', ok: false },
  ],
  network: { downMbit: 48.2, upMbit: 6.4, interfaces: ['enp3s0'], ready: true },
}

test('Statusleiste zeigt ohne Messwerte nur Platzhalter, keine erfundenen Zahlen', () => {
  const readouts = readoutsFor(null)
  assert.deepEqual(readouts.map((r) => r.id), ['cpu', 'ram', 'storage', 'network'])
  assert.ok(readouts.every((r) => r.value === '—' && r.percent === 0))
})

test('Statusleiste: echte Messwerte', () => {
  const [cpu, ram, storage, network] = readoutsFor(METRICS)
  assert.equal(cpu.value, '18 %')
  assert.equal(cpu.caption, '12 Threads · 42 °C')
  assert.equal(ram.value, '8.0 GB / 32.0 GB')
  assert.equal(storage.value, '4.0 TB frei')
  assert.equal(storage.caption, 'von 8.0 TB · Daten')
  assert.equal(storage.percent, 50)
  assert.equal(network.value, '54.6 Mbit/s')
  assert.equal(network.percent, 5)
})

test('Statusleiste: fehlende Teile werden ehrlich benannt', () => {
  const notReady = { ...METRICS, cpu: { ...METRICS.cpu, ready: false }, network: { ...METRICS.network, ready: false } }
  const [cpu, , , network] = readoutsFor(notReady)
  assert.equal(cpu.caption, 'Erste Messung läuft …')
  assert.equal(network.caption, 'Erste Messung läuft …')

  assert.equal(readoutsFor({ ...METRICS, disks: [] })[2].caption, 'Keine Platte konfiguriert')
  assert.equal(readoutsFor({ ...METRICS, disks: [{ name: 'Kaputt', ok: false }] })[2].caption, 'Kaputt: nicht lesbar')
  assert.equal(readoutsFor({ ...METRICS, cpu: { ...METRICS.cpu, tempC: null } })[0].caption, '12 Threads')
})

test('Dialoge: Inhalte kommen aus den Messwerten', () => {
  const cpu = modalFor('cpu', METRICS)
  assert.equal(cpu.subtitle, 'Intel Core i5-12500T')
  assert.equal(cpu.groups[0].rows.length, 3)
  assert.ok(cpu.groups[1].rows.some((r) => r.label === 'Temperatur' && r.value === '42.4 °C'))
  assert.ok(cpu.groups[1].rows.some((r) => r.label === 'Load Average' && r.value === '0.42 / 0.38 / 0.31'))

  const ram = modalFor('ram', METRICS)
  assert.equal(ram.groups[1].rows[0].value, 'Nicht aktiv')
  assert.equal(ram.groups[0].rows[0].percent, 25)

  const storage = modalFor('storage', METRICS)
  assert.equal(storage.subtitle, '2 Laufwerke')
  assert.deepEqual(storage.groups[0].rows[1], { label: 'Kaputt', value: 'Nicht lesbar' })

  const network = modalFor('network', METRICS)
  assert.equal(network.subtitle, 'enp3s0')
  assert.equal(network.groups[0].rows[0].value, '48.2 Mbit/s')
})

test('Dialoge: ohne Sensor, ohne Swap-Nutzung, mit vielen Kernen', () => {
  const noSensor = modalFor('cpu', { ...METRICS, cpu: { ...METRICS.cpu, tempC: null, mhz: null } })
  assert.ok(noSensor.groups[1].rows.some((r) => r.value === 'Kein Sensor sichtbar'))
  assert.ok(!noSensor.groups[1].rows.some((r) => r.label.startsWith('Taktfrequenz')))

  const withSwap = modalFor('ram', { ...METRICS, ram: { ...METRICS.ram, swapTotalBytes: 8 * 1024 ** 3, swapUsedBytes: 1024 ** 3 } })
  assert.equal(withSwap.groups[1].rows[0].percent, 13)

  const manyCores = modalFor('cpu', { ...METRICS, cpu: { ...METRICS.cpu, perCore: new Array(100).fill(5) } })
  assert.equal(manyCores.groups[0].rows.length, 32)
})

// ---------------------------------------------------------------- Port statt fester Adresse

test('portFrom nimmt nur Ganzzahlen von 1 bis 65535', () => {
  assert.equal(portFrom('8096'), 8096)
  assert.equal(portFrom(' 443 '), 443)
  assert.equal(portFrom('65535'), 65535)
  for (const bad of ['0', '65536', '-1', '80.5', '80a', '', ' ', 'http', undefined, null, 8096]) {
    assert.equal(portFrom(bad), null, String(bad))
  }
})

test('protocolFrom kennt nur https, alles andere ist http', () => {
  assert.equal(protocolFrom('https'), 'https')
  assert.equal(protocolFrom('HTTPS'), 'https')
  for (const other of ['http', 'ftp', 'javascript', '', undefined]) assert.equal(protocolFrom(other), 'http')
})

test('Label dashboard.port ergibt Port und Protokoll, ohne feste Adresse', () => {
  const [entry] = entriesFromDiscovery(
    discovery(container({ labels: { 'dashboard.name': 'Portainer', 'dashboard.port': '9443', 'dashboard.protocol': 'https' } })),
  )
  assert.equal(entry.service.url, null)
  assert.equal(entry.service.port, 9443)
  assert.equal(entry.service.protocol, 'https')
})

test('Ungültiger Port im Label wird ignoriert, ein gesetzter Link bleibt daneben bestehen', () => {
  const [bad] = entriesFromDiscovery(discovery(container({ labels: { 'dashboard.name': 'A', 'dashboard.port': '99999' } })))
  assert.ok(!('port' in bad.service))
  assert.ok(!('protocol' in bad.service))

  const [both] = entriesFromDiscovery(
    discovery(container({ labels: { 'dashboard.name': 'B', 'dashboard.url': 'https://b.home.arpa', 'dashboard.port': '8080' } })),
  )
  assert.equal(both.service.url, 'https://b.home.arpa/')
  assert.equal(both.service.port, 8080)
})

test('Handeinträge: Port wird geprüft und mit Protokoll übernommen', () => {
  const { entries, errors } = parseExtraServices(
    JSON.stringify([
      { name: 'OMV', port: 80 },
      { name: 'Sicher', port: 8443, protocol: 'https' },
      { name: 'Kaputt', port: 70000 },
    ]),
  )
  assert.equal(entries.length, 3)
  assert.equal(entries[0].service.port, 80)
  assert.equal(entries[0].service.protocol, 'http')
  assert.equal(entries[1].service.protocol, 'https')
  assert.ok(!('port' in entries[2].service))
  assert.deepEqual(errors, ['Eintrag "Kaputt": "port" muss eine Zahl von 1 bis 65535 sein'])
})

// ---------------------------------------------------------------- Anzeige ohne Agent

const legacy = (over = {}) => ({
  uptimeSec: 90061,
  cpu: { percent: 18, cores: 8, speedMHz: 2400 },
  ram: { used: 9.2, total: 32, percent: 29 },
  storage: { free: '4.10 TB frei', total: '8.00 TB', percent: 49 },
  network: { downMbit: 48.2, upMbit: 6.4, ready: true },
  ...over,
})

test('Ohne Agent: Platzhalter, solange nichts geladen ist', () => {
  const readouts = legacyReadoutsFor(null)
  assert.equal(readouts.length, 4)
  assert.ok(readouts.every((r) => r.value === '—' && r.percent === 0))
})

test('Ohne Agent: Messwerte werden angezeigt', () => {
  const [cpu, ram, storage, network] = legacyReadoutsFor(legacy())
  assert.deepEqual(cpu, { id: 'cpu', label: 'CPU', value: '18 %', caption: '8 Kerne · 2.4 GHz', percent: 18 })
  assert.equal(ram.value, '9.2 / 32 GB')
  assert.equal(ram.caption, '29 % belegt')
  assert.equal(storage.value, '4.10 TB frei')
  assert.equal(storage.caption, 'von 8.00 TB')
  assert.equal(network.value, '48.2 Mbit/s')
  assert.equal(network.percent, 32)
})

test('Ohne Agent: null-Werte bleiben "—" statt "null %" oder NaN', () => {
  const [cpu, ram, storage, network] = legacyReadoutsFor(
    legacy({
      cpu: { percent: null, cores: 4, speedMHz: null },
      ram: { used: 1, total: 2, percent: null },
      storage: { free: null, total: null, percent: null },
      network: { downMbit: 0, upMbit: 0, ready: false },
    }),
  )
  assert.equal(cpu.value, '—')
  assert.equal(cpu.caption, '4 Kerne')
  assert.equal(ram.caption, '—')
  assert.equal(storage.value, '—')
  assert.equal(storage.caption, 'Nicht lesbar')
  assert.equal(network.value, '—')
  for (const r of [cpu, ram, storage, network]) assert.ok(!/null|NaN|undefined/.test(JSON.stringify(r)), r.id)
})

test('Ohne Agent: Uptime aus uptimeSec wird lesbar (früher "NaNd NaNh")', () => {
  assert.equal(formatUptime(legacy().uptimeSec), '1d 01h')
  assert.equal(formatUptime(undefined), '—')
})

test('Ohne Agent: Dialoge zeigen nur echte Werte und weisen auf den Agent hin', () => {
  for (const id of ['cpu', 'ram', 'storage', 'network']) {
    const modal = legacyModalFor(id, legacy())
    assert.ok(modal.title.length > 0)
    assert.ok(modal.groups.some((g) => g.title === 'Mehr Details'), id)
    assert.ok(!/null|NaN|undefined/.test(JSON.stringify(modal)), id)
    // Die früheren Platzhalter dürfen nicht wieder auftauchen.
    assert.ok(!/RAID|SMART|Lüfter|jellyfin|WireGuard/i.test(JSON.stringify(modal)), id)
  }
  const unreadable = legacyModalFor('storage', legacy({ storage: { free: null, total: null, percent: null } }))
  assert.ok(!/null|NaN|undefined/.test(JSON.stringify(unreadable)))
})
