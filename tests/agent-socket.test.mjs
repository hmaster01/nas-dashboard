import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createAgent } from '../agent/agent.mjs'
import { agentGet } from '../lib/agent-client.ts'

const TOKEN = 'sockettest-sockettest-sockettest-1'

let dir
let socketPath
let agent
let fakeDocker

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'agent-socket-'))
  const proc = join(dir, 'proc')
  await mkdir(join(proc, 'net'), { recursive: true })
  await writeFile(join(proc, 'stat'), 'cpu  1000 0 500 8000 100 0 0 0 0 0\ncpu0 1000 0 500 8000 100 0 0 0 0 0\n')
  await writeFile(join(proc, 'net', 'dev'), 'h1\nh2\nenp3s0: 1 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0\n')
  await writeFile(join(proc, 'meminfo'), 'MemTotal: 1000 kB\nMemAvailable: 500 kB\n')
  await writeFile(join(proc, 'uptime'), '10.00 20.00\n')
  await writeFile(join(proc, 'loadavg'), '0.10 0.20 0.30 1/10 99\n')
  await writeFile(join(proc, 'cpuinfo'), 'processor\t: 0\nmodel name\t: Test CPU\n')

  const dockerSocket = join(dir, 'docker.sock')
  fakeDocker = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify([{ Id: 'abc', Names: ['/x'], Image: 'img', State: 'running', Status: 'Up', Created: 1, Labels: { 'dashboard.name': 'X' } }]))
  })
  await new Promise((resolve) => fakeDocker.listen(dockerSocket, resolve))

  socketPath = join(dir, 'agent.sock')
  // Ein Rest vom letzten Lauf (Absturz) darf den Start nicht verhindern.
  await writeFile(socketPath, 'stale')

  agent = createAgent({ token: TOKEN, socketPath, procDir: proc, sysDir: join(dir, 'sys'), dockerSocket, sampleIntervalMs: 60000 })
  await agent.start()
})

after(async () => {
  await agent.stop()
  await new Promise((resolve) => fakeDocker.close(resolve))
  await rm(dir, { recursive: true, force: true })
})

test('Der Agent lauscht auf einem Unix-Socket, nur für Nutzer und Gruppe zugänglich', async () => {
  const info = await stat(socketPath)
  assert.equal(info.isSocket(), true)
  assert.equal(info.mode & 0o777, 0o660)
})

test('agentGet liest Messwerte und Erkennung über den Socket', async () => {
  const agentConfig = { socketPath, token: TOKEN }

  const metrics = await agentGet(agentConfig, '/metrics')
  assert.equal(metrics.host.cpuModel, 'Test CPU')
  assert.equal(metrics.ram.percent, 50)

  const discovery = await agentGet(agentConfig, '/discovery')
  assert.equal(discovery.available, true)
  assert.equal(discovery.containers[0].labels['dashboard.name'], 'X')
})

test('agentGet scheitert mit falschem Token, ohne das Token zu verraten', async () => {
  await assert.rejects(agentGet({ socketPath, token: 'x'.repeat(30) }, '/metrics'), (error) => {
    assert.equal(error.message, 'Agent antwortet mit HTTP 401')
    assert.ok(!error.message.includes('xxx'))
    return true
  })
})

test('agentGet meldet einen nicht vorhandenen Socket als Fehler', async () => {
  await assert.rejects(agentGet({ socketPath: join(dir, 'gibt-es-nicht.sock'), token: TOKEN }, '/metrics'), /ENOENT|ECONNREFUSED/)
})

test('agentGet lehnt Antworten ab, die kein JSON sind', async () => {
  const oddSocket = join(dir, 'odd.sock')
  const odd = http.createServer((request, response) => {
    response.writeHead(200)
    response.end('<html>kein json</html>')
  })
  await new Promise((resolve) => odd.listen(oddSocket, resolve))
  try {
    await assert.rejects(agentGet({ socketPath: oddSocket, token: TOKEN }, '/metrics'), /kein gültiges JSON/)
  } finally {
    await new Promise((resolve) => odd.close(resolve))
  }
})

test('Beim Beenden verschwindet der Socket wieder', async () => {
  const path = join(dir, 'short-lived.sock')
  const other = createAgent({ token: TOKEN, socketPath: path, procDir: join(dir, 'proc'), sampleIntervalMs: 60000 })
  await other.start()
  assert.equal((await stat(path)).isSocket(), true)
  await other.stop()
  await assert.rejects(stat(path), { code: 'ENOENT' })
})
