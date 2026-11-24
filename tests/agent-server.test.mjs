import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createAgent } from '../agent/agent.mjs'

const TOKEN = 'testtoken-testtoken-testtoken-1234'

let dir
let agent
let base
let fakeDocker
let dockerRequests = []

const STAT_1 = `cpu  1000 0 500 8000 100 0 0 0 0 0
cpu0 500 0 250 4000 50 0 0 0 0 0
cpu1 500 0 250 4000 50 0 0 0 0 0
`
const STAT_2 = `cpu  1050 0 500 8150 100 0 0 0 0 0
cpu0 525 0 250 4075 50 0 0 0 0 0
cpu1 525 0 250 4075 50 0 0 0 0 0
`
const netDev = (rx, tx) => `Inter-|   Receive |  Transmit
 face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed
    lo: 1 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0
enp3s0: ${rx} 100 0 0 0 0 0 0 ${tx} 90 0 0 0 0 0 0
`

const get = (path, token = TOKEN) =>
  fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agent-test-'))
  const proc = join(dir, 'proc')
  await mkdir(join(proc, 'net'), { recursive: true })
  await mkdir(join(dir, 'probe'), { recursive: true })
  await writeFile(join(proc, 'stat'), STAT_1)
  await writeFile(join(proc, 'net', 'dev'), netDev(0, 0))
  await writeFile(join(proc, 'meminfo'), 'MemTotal: 1000 kB\nMemAvailable: 750 kB\n')
  await writeFile(join(proc, 'uptime'), '3600.50 7000.00\n')
  await writeFile(join(proc, 'loadavg'), '0.42 0.38 0.31 1/100 1234\n')
  await writeFile(join(proc, 'cpuinfo'), 'processor\t: 0\nmodel name\t: Test CPU\ncpu MHz\t\t: 2400.0\n')

  // Nachgebauter Docker-Socket
  const socketPath = join(dir, 'docker.sock')
  fakeDocker = http.createServer((request, response) => {
    dockerRequests.push(request.url)
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify([
        {
          Id: 'abcdef1234567890',
          Names: ['/jellyfin'],
          Image: 'jellyfin/jellyfin',
          State: 'running',
          Status: 'Up 2 hours (healthy)',
          Created: 1700000000,
          Labels: { 'dashboard.name': 'Jellyfin', 'dashboard.url': 'http://nas:8096', 'secret.label': 'nope' },
          Env: ['PASSWORD=geheim'],
        },
      ]),
    )
  })
  await new Promise((resolve) => fakeDocker.listen(socketPath, resolve))

  agent = createAgent({
    token: TOKEN,
    port: 0,
    procDir: proc,
    sysDir: join(dir, 'sys'),
    dockerSocket: socketPath,
    disks: [
      { name: 'Test', path: join(dir, 'probe') },
      { name: 'Kaputt', path: join(dir, 'gibt-es-nicht') },
    ],
    sampleIntervalMs: 60000,
  })
  const address = await agent.start()
  base = `http://127.0.0.1:${address.port}`

  // Zweite Messung vorbereiten, die der Aufwärm-Timer nach 500 ms einliest.
  await writeFile(join(proc, 'stat'), STAT_2)
  await writeFile(join(proc, 'net', 'dev'), netDev(12_500_000, 1_250_000))
  await new Promise((resolve) => setTimeout(resolve, 1200))
})

after(async () => {
  await agent.stop()
  await new Promise((resolve) => fakeDocker.close(resolve))
  await rm(dir, { recursive: true, force: true })
})

test('healthz braucht kein Token', async () => {
  const response = await get('/healthz', null)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
})

test('ohne oder mit falschem Token gibt es 401', async () => {
  assert.equal((await get('/metrics', null)).status, 401)
  assert.equal((await get('/metrics', 'falsch')).status, 401)
  assert.equal((await get('/discovery', null)).status, 401)
})

test('andere Methoden als GET werden abgelehnt, unbekannte Pfade sind 404', async () => {
  const post = await fetch(`${base}/metrics`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` } })
  assert.equal(post.status, 405)
  assert.equal((await get('/gibt-es-nicht')).status, 404)
})

test('metrics liefert echte Werte aus den Testdateien', async () => {
  const response = await get('/metrics')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')

  const metrics = await response.json()
  assert.equal(metrics.host.cpuModel, 'Test CPU')
  assert.equal(metrics.host.uptimeSeconds, 3600.5)
  assert.deepEqual(metrics.host.load, [0.42, 0.38, 0.31])
  assert.equal(metrics.cpu.ready, true)
  assert.equal(metrics.cpu.percent, 25)
  assert.deepEqual(metrics.cpu.perCore, [25, 25])
  assert.equal(metrics.ram.percent, 25)
  assert.equal(metrics.network.ready, true)
  assert.deepEqual(metrics.network.interfaces, ['enp3s0'])
  assert.ok(metrics.network.downMbit > 0)
  assert.ok(metrics.network.upMbit > 0)
})

test('Platten: lesbarer Pfad liefert Werte, fehlender wird als nicht ok markiert', async () => {
  const { disks } = await (await get('/metrics')).json()
  const ok = disks.find((disk) => disk.name === 'Test')
  assert.equal(ok.ok, true)
  assert.ok(ok.totalBytes > 0)
  assert.ok(ok.percent >= 0 && ok.percent <= 100)
  assert.deepEqual(disks.find((disk) => disk.name === 'Kaputt'), { name: 'Kaputt', ok: false })
})

test('discovery fragt nur Container mit dashboard.name ab und gibt nur dashboard.*-Labels weiter', async () => {
  dockerRequests = []
  const result = await (await get('/discovery')).json()

  assert.equal(result.available, true)
  assert.equal(result.containers.length, 1)
  assert.deepEqual(result.containers[0].labels, {
    'dashboard.name': 'Jellyfin',
    'dashboard.url': 'http://nas:8096',
  })
  assert.equal(result.containers[0].health, 'healthy')
  assert.ok(!JSON.stringify(result).includes('geheim'))

  assert.equal(dockerRequests.length, 1)
  const url = new URL(dockerRequests[0], 'http://docker')
  assert.equal(url.pathname, '/containers/json')
  assert.equal(url.searchParams.get('all'), 'true')
  assert.deepEqual(JSON.parse(url.searchParams.get('filters')), { label: ['dashboard.name'] })
})

test('discovery meldet sauber, wenn der Docker-Socket fehlt', async () => {
  const lonely = createAgent({
    token: TOKEN,
    port: 0,
    procDir: join(dir, 'proc'),
    dockerSocket: join(dir, 'nicht-da.sock'),
    sampleIntervalMs: 60000,
  })
  const address = await lonely.start()
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/discovery`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      available: false,
      containers: [],
      error: 'Docker nicht erreichbar',
    })
  } finally {
    await lonely.stop()
  }
})

test('discovery funktioniert auch über TCP (Docker-Socket-Proxy)', async () => {
  const proxy = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify([{ Id: 'f'.repeat(64), Names: ['/vaultwarden'], State: 'running', Status: 'Up 1 day', Labels: { 'dashboard.name': 'Vaultwarden' } }]))
  })
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve))

  const viaTcp = createAgent({
    token: TOKEN,
    port: 0,
    procDir: join(dir, 'proc'),
    dockerHost: `tcp://127.0.0.1:${proxy.address().port}`,
    sampleIntervalMs: 60000,
  })
  const address = await viaTcp.start()
  try {
    const result = await (
      await fetch(`http://127.0.0.1:${address.port}/discovery`, { headers: { Authorization: `Bearer ${TOKEN}` } })
    ).json()
    assert.equal(result.available, true)
    assert.equal(result.containers[0].container, 'vaultwarden')
  } finally {
    await viaTcp.stop()
    await new Promise((resolve) => proxy.close(resolve))
  }
})
