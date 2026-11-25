import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cpuPercent,
  diskUsage,
  healthFromStatus,
  memoryFrom,
  networkRates,
  parseCpuInfo,
  parseCpuStat,
  parseDisks,
  parseMeminfo,
  parseNetDev,
  pickLabels,
  pickTemperature,
  selectInterfaces,
  publishedPorts,
  toDiscoveryEntry,
  tokenMatches,
} from '../agent/lib.mjs'

const STAT_BEFORE = `cpu  1000 0 500 8000 100 0 0 0 0 0
cpu0 500 0 250 4000 50 0 0 0 0 0
cpu1 500 0 250 4000 50 0 0 0 0 0
intr 12345
`
// +200 Ticks gesamt, davon 150 Leerlauf -> 25 % Last
const STAT_AFTER = `cpu  1050 0 500 8150 100 0 0 0 0 0
cpu0 525 0 250 4075 50 0 0 0 0 0
cpu1 525 0 250 4075 50 0 0 0 0 0
`

test('parseCpuStat liest Gesamt- und Kernwerte', () => {
  const stat = parseCpuStat(STAT_BEFORE)
  assert.equal(stat.cores.length, 2)
  assert.deepEqual(stat.total, { total: 9600, idle: 8100 })
})

test('cpuPercent rechnet die Last zwischen zwei Messungen aus', () => {
  const before = parseCpuStat(STAT_BEFORE)
  const after = parseCpuStat(STAT_AFTER)
  assert.equal(cpuPercent(before.total, after.total), 25)
  assert.equal(cpuPercent(before.cores[0], after.cores[0]), 25)
})

test('cpuPercent bleibt bei fehlenden oder gleichen Messwerten bei 0', () => {
  const stat = parseCpuStat(STAT_BEFORE)
  assert.equal(cpuPercent(null, stat.total), 0)
  assert.equal(cpuPercent(stat.total, stat.total), 0)
})

test('parseCpuInfo liest Modell, Threads und mittleren Takt', () => {
  const info = parseCpuInfo(`processor\t: 0
model name\t: Intel(R) Core(TM) i5-12500T
cpu MHz\t\t: 2000.000

processor\t: 1
model name\t: Intel(R) Core(TM) i5-12500T
cpu MHz\t\t: 3000.000
`)
  assert.equal(info.model, 'Intel(R) Core(TM) i5-12500T')
  assert.equal(info.threads, 2)
  assert.equal(info.mhz, 2500)
})

test('parseCpuInfo liefert null, wenn nichts da ist', () => {
  assert.deepEqual(parseCpuInfo(''), { model: null, threads: 0, mhz: null })
})

test('pickTemperature bevorzugt x86_pkg_temp, sonst höchster Wert', () => {
  assert.equal(
    pickTemperature([
      { type: 'acpitz', milliCelsius: 60000 },
      { type: 'x86_pkg_temp', milliCelsius: 42500 },
    ]),
    42.5,
  )
  assert.equal(
    pickTemperature([
      { type: 'a', milliCelsius: 30000 },
      { type: 'b', milliCelsius: 51000 },
    ]),
    51,
  )
  assert.equal(pickTemperature([]), null)
  assert.equal(pickTemperature([{ type: 'x', milliCelsius: NaN }]), null)
})

test('memoryFrom nutzt MemAvailable für den belegten Speicher', () => {
  const info = parseMeminfo(`MemTotal:       32000000 kB
MemFree:         1000000 kB
MemAvailable:   24000000 kB
Buffers:          500000 kB
Cached:          6000000 kB
SwapTotal:       8000000 kB
SwapFree:        7000000 kB
`)
  const memory = memoryFrom(info)
  assert.equal(memory.totalBytes, 32000000 * 1024)
  assert.equal(memory.usedBytes, 8000000 * 1024)
  assert.equal(memory.percent, 25)
  assert.equal(memory.cachedBytes, 6500000 * 1024)
  assert.equal(memory.swapUsedBytes, 1000000 * 1024)
})

test('memoryFrom kommt ohne MemAvailable aus und teilt nicht durch 0', () => {
  assert.equal(memoryFrom({}).percent, 0)
  const memory = memoryFrom({ MemTotal: 1000, MemFree: 100, Cached: 200, Buffers: 100 })
  assert.equal(memory.availableBytes, 400)
  assert.equal(memory.usedBytes, 600)
})

const NET_DEV = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 5000 10 0 0 0 0 0 0 5000 10 0 0 0 0 0 0
enp3s0: 1000000 100 0 0 0 0 0 0 500000 90 0 0 0 0 0 0
docker0: 700 7 0 0 0 0 0 0 700 7 0 0 0 0 0 0
veth1a2b:900 9 0 0 0 0 0 0 900 9 0 0 0 0 0 0
`

test('parseNetDev liest Schnittstellen auch ohne Leerzeichen nach dem Doppelpunkt', () => {
  const list = parseNetDev(NET_DEV)
  assert.deepEqual(
    list.map((iface) => iface.name),
    ['lo', 'enp3s0', 'docker0', 'veth1a2b'],
  )
  assert.deepEqual(list.find((iface) => iface.name === 'enp3s0'), { name: 'enp3s0', rx: 1000000, tx: 500000 })
})

test('selectInterfaces blendet virtuelle Schnittstellen aus', () => {
  const names = selectInterfaces(parseNetDev(NET_DEV)).map((iface) => iface.name)
  assert.deepEqual(names, ['enp3s0'])
})

test('selectInterfaces respektiert eine ausdrückliche Auswahl', () => {
  const names = selectInterfaces(parseNetDev(NET_DEV), ['docker0']).map((iface) => iface.name)
  assert.deepEqual(names, ['docker0'])
})

test('networkRates rechnet in Mbit/s und ignoriert neu auftauchende Schnittstellen', () => {
  const prev = new Map([['enp3s0', { rx: 0, tx: 0 }]])
  const next = new Map([
    ['enp3s0', { rx: 12_500_000, tx: 1_250_000 }], // 100 Mbit in 1 s, 10 Mbit in 1 s
    ['wlan0', { rx: 999_999_999, tx: 999_999_999 }], // neu: darf keinen Ausschlag erzeugen
  ])
  assert.deepEqual(networkRates(prev, next, 1), { downMbit: 100, upMbit: 10 })
})

test('networkRates klemmt zurückgesetzte Zähler auf 0', () => {
  const prev = new Map([['enp3s0', { rx: 5000, tx: 5000 }]])
  const next = new Map([['enp3s0', { rx: 100, tx: 100 }]])
  assert.deepEqual(networkRates(prev, next, 2), { downMbit: 0, upMbit: 0 })
  assert.deepEqual(networkRates(null, next, 2), { downMbit: 0, upMbit: 0 })
  assert.deepEqual(networkRates(prev, next, 0), { downMbit: 0, upMbit: 0 })
})

test('parseDisks liest Name=Pfad-Paare und verwirft Ungültiges', () => {
  assert.deepEqual(parseDisks('System=/mnt/probe/system, Daten=/mnt/probe/daten'), [
    { name: 'System', path: '/mnt/probe/system' },
    { name: 'Daten', path: '/mnt/probe/daten' },
  ])
  assert.deepEqual(parseDisks('ohne-gleichheitszeichen,=/leer,relativ=pfad'), [])
  assert.deepEqual(parseDisks(undefined), [])
})

test('diskUsage rechnet wie df', () => {
  const usage = diskUsage({ bsize: 4096, blocks: 1000, bfree: 400, bavail: 350 })
  assert.equal(usage.totalBytes, 1000 * 4096)
  assert.equal(usage.usedBytes, 600 * 4096)
  assert.equal(usage.freeBytes, 350 * 4096)
  assert.equal(usage.percent, 63) // 600 / (600 + 350)
  assert.equal(diskUsage({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0 }).percent, 0)
})

test('healthFromStatus erkennt die Docker-Health-Zustände', () => {
  assert.equal(healthFromStatus('Up 3 days (healthy)'), 'healthy')
  assert.equal(healthFromStatus('Up 3 days (unhealthy)'), 'unhealthy')
  assert.equal(healthFromStatus('Up 5 seconds (health: starting)'), 'starting')
  assert.equal(healthFromStatus('Up 2 hours'), 'none')
  assert.equal(healthFromStatus(undefined), 'none')
})

test('pickLabels gibt ausschließlich dashboard.*-Labels weiter', () => {
  const picked = pickLabels({
    'dashboard.name': 'Jellyfin',
    'dashboard.url': 'http://nas:8096',
    'com.docker.compose.project': 'media',
    'traefik.http.routers.x.rule': 'Host(`x`)',
  })
  assert.deepEqual(picked, { 'dashboard.name': 'Jellyfin', 'dashboard.url': 'http://nas:8096' })
  assert.deepEqual(pickLabels(null), {})
  assert.equal(pickLabels({ 'dashboard.x': 'a'.repeat(1000) })['dashboard.x'].length, 300)
})

test('toDiscoveryEntry entfernt den Schrägstrich und reduziert die Felder', () => {
  const entry = toDiscoveryEntry({
    Id: 'abcdef1234567890',
    Names: ['/jellyfin'],
    Image: 'jellyfin/jellyfin:10',
    State: 'running',
    Status: 'Up 3 days (healthy)',
    Created: 1700000000,
    Labels: { 'dashboard.name': 'Jellyfin', secret: 'nope' },
    Env: ['PASSWORD=geheim'],
  })
  assert.deepEqual(entry, {
    id: 'abcdef123456',
    container: 'jellyfin',
    image: 'jellyfin/jellyfin:10',
    state: 'running',
    status: 'Up 3 days (healthy)',
    health: 'healthy',
    created: 1700000000,
    labels: { 'dashboard.name': 'Jellyfin' },
    ports: [],
  })
  assert.ok(!JSON.stringify(entry).includes('geheim'))
})

test('tokenMatches akzeptiert nur das richtige Bearer-Token', () => {
  const token = 'a'.repeat(32)
  assert.equal(tokenMatches(`Bearer ${token}`, token), true)
  assert.equal(tokenMatches(`Bearer ${token}x`, token), false)
  assert.equal(tokenMatches('Bearer kurz', token), false)
  assert.equal(tokenMatches(token, token), false)
  assert.equal(tokenMatches(undefined, token), false)
  assert.equal(tokenMatches('Bearer ', token), false)
  assert.equal(tokenMatches('Bearer x', ''), false)
})

test('publishedPorts: nur erreichbare TCP-Ports, ohne Loopback und Doppelte, sortiert', () => {
  const ports = publishedPorts([
    { IP: '0.0.0.0', PrivatePort: 443, PublicPort: 8443, Type: 'tcp' },
    { IP: '::', PrivatePort: 443, PublicPort: 8443, Type: 'tcp' },
    { IP: '0.0.0.0', PrivatePort: 80, PublicPort: 8080, Type: 'tcp' },
    { IP: '127.0.0.1', PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' },
    { IP: '0.0.0.0', PrivatePort: 53, PublicPort: 53, Type: 'udp' },
    { PrivatePort: 5432, Type: 'tcp' },
    { IP: '0.0.0.0', PrivatePort: 1, PublicPort: 99999, Type: 'tcp' },
  ])
  assert.deepEqual(ports, [
    { public: 8080, private: 80 },
    { public: 8443, private: 443 },
  ])
  assert.deepEqual(publishedPorts(undefined), [])
  assert.deepEqual(publishedPorts('x'), [])
})
