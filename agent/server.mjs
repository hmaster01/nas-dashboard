// Startpunkt des Agents: `node agent/server.mjs`
// Konfiguration ausschließlich über Umgebungsvariablen (siehe .env.example).

import { createAgent } from './agent.mjs'
import { parseDisks } from './lib.mjs'

const token = process.env.AGENT_TOKEN ?? ''
if (token.length < 24) {
  console.error('[agent] AGENT_TOKEN fehlt oder ist zu kurz (mindestens 24 Zeichen). Beispiel: openssl rand -hex 32')
  process.exit(1)
}

const socketPath = process.env.AGENT_SOCKET || ''
if (socketPath && !socketPath.startsWith('/')) {
  console.error('[agent] AGENT_SOCKET muss ein absoluter Pfad sein, z. B. /run/agent/agent.sock')
  process.exit(1)
}

const agent = createAgent({
  token,
  socketPath,
  bind: process.env.AGENT_BIND || '127.0.0.1',
  port: Number(process.env.AGENT_PORT) || 9777,
  disks: parseDisks(process.env.DISKS),
  dockerSocket: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
  dockerHost: process.env.DOCKER_HOST || '',
  netInclude: (process.env.NET_INTERFACES ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
})

const address = await agent.start()
console.log(`[agent] läuft auf ${typeof address === 'string' ? address : `${address.address}:${address.port}`}`)

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    await agent.stop()
    process.exit(0)
  })
}
