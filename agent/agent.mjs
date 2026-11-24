// Der Agent ist der einzige Teil des Systems, der den Host anfassen darf:
// er liest Systemwerte aus /proc und /sys und fragt Docker nach Containern.
// Die Web-App selbst bekommt weder Docker-Socket noch Host-Verzeichnisse und
// holt sich nur die aufbereiteten Daten von hier (mit Token).
//
// Keine Abhängigkeiten — nur Node-Bordmittel, damit die Angriffsfläche klein bleibt.

import http from 'node:http'
import { chmod, readFile, readdir, statfs, unlink } from 'node:fs/promises'
import {
  cpuPercent,
  diskUsage,
  memoryFrom,
  networkRates,
  parseCpuInfo,
  parseCpuStat,
  parseMeminfo,
  parseNetDev,
  pickTemperature,
  selectInterfaces,
  toDiscoveryEntry,
  tokenMatches,
} from './lib.mjs'

const MAX_CONTAINERS = 200
const MAX_DOCKER_RESPONSE_BYTES = 5 * 1024 * 1024

export function createAgent(config) {
  const cfg = {
    procDir: '/proc',
    sysDir: '/sys',
    dockerSocket: '/var/run/docker.sock',
    // Alternativ zum Socket: "tcp://127.0.0.1:2375" (Docker-Socket-Proxy).
    dockerHost: '',
    disks: [],
    netInclude: [],
    sampleIntervalMs: 2000,
    // Bevorzugter Weg: Unix-Socket in einem gemeinsamen Volume — kein offener Netzwerkport.
    // TCP (bind/port) gibt es für Tests und die lokale Entwicklung.
    socketPath: '',
    bind: '127.0.0.1',
    port: 9777,
    ...config,
  }

  // Laufende Messung (CPU und Netzwerk brauchen zwei Zählerstände). Sie läuft im
  // Hintergrund, damit Anfragen sofort antworten und mehrere offene Browser-Tabs
  // das Messfenster nicht verkürzen.
  const live = {
    cpuPercent: 0,
    perCore: [],
    cpuReady: false,
    downMbit: 0,
    upMbit: 0,
    netReady: false,
    interfaces: [],
  }
  let cpuPrev = null
  let netPrev = null
  let timer = null
  let warmup = null

  const readText = (path) => readFile(path, 'utf8').catch(() => '')

  async function sample() {
    const now = Date.now()

    try {
      const stat = parseCpuStat(await readText(`${cfg.procDir}/stat`))
      if (cpuPrev && cpuPrev.total && stat.total) {
        live.cpuPercent = Math.round(cpuPercent(cpuPrev.total, stat.total))
        live.perCore = stat.cores.map((core, index) => Math.round(cpuPercent(cpuPrev.cores[index], core)))
        live.cpuReady = true
      }
      cpuPrev = stat
    } catch {
      // /proc nicht lesbar: letzte Werte behalten
    }

    try {
      const nets = selectInterfaces(parseNetDev(await readText(`${cfg.procDir}/net/dev`)), cfg.netInclude)
      const current = new Map(nets.map((iface) => [iface.name, { rx: iface.rx, tx: iface.tx }]))

      if (netPrev) {
        const seconds = (now - netPrev.time) / 1000
        const rates = networkRates(netPrev.map, current, seconds)
        live.downMbit = rates.downMbit
        live.upMbit = rates.upMbit
        live.netReady = true
      }
      netPrev = { time: now, map: current }
      live.interfaces = nets.map((iface) => iface.name)
    } catch {
      // letzte Werte behalten
    }
  }

  async function readTemperature() {
    const zones = []

    try {
      const entries = await readdir(`${cfg.sysDir}/class/thermal`)
      for (const entry of entries.filter((name) => name.startsWith('thermal_zone'))) {
        const type = (await readText(`${cfg.sysDir}/class/thermal/${entry}/type`)).trim()
        const raw = (await readText(`${cfg.sysDir}/class/thermal/${entry}/temp`)).trim()
        zones.push({ type, milliCelsius: Number(raw) })
      }
    } catch {
      // kein thermal-Verzeichnis (z. B. in VMs)
    }

    if (zones.length === 0) {
      try {
        const entries = await readdir(`${cfg.sysDir}/class/hwmon`)
        for (const entry of entries.filter((name) => name.startsWith('hwmon'))) {
          const name = (await readText(`${cfg.sysDir}/class/hwmon/${entry}/name`)).trim()
          if (name !== 'coretemp') continue
          const raw = (await readText(`${cfg.sysDir}/class/hwmon/${entry}/temp1_input`)).trim()
          zones.push({ type: 'coretemp', milliCelsius: Number(raw) })
        }
      } catch {
        // keine Sensoren sichtbar
      }
    }

    return pickTemperature(zones)
  }

  async function readDisks() {
    return Promise.all(
      cfg.disks.map(async ({ name, path }) => {
        try {
          return { name, ok: true, ...diskUsage(await statfs(path)) }
        } catch {
          return { name, ok: false }
        }
      }),
    )
  }

  async function collectMetrics() {
    const [meminfo, uptime, loadavg, cpuinfo, tempC, disks] = await Promise.all([
      readText(`${cfg.procDir}/meminfo`),
      readText(`${cfg.procDir}/uptime`),
      readText(`${cfg.procDir}/loadavg`),
      readText(`${cfg.procDir}/cpuinfo`),
      readTemperature(),
      readDisks(),
    ])

    const cpu = parseCpuInfo(cpuinfo)
    const load = loadavg.trim().split(/\s+/).slice(0, 3).map(Number)

    return {
      timestamp: Date.now(),
      host: {
        cpuModel: cpu.model,
        threads: cpu.threads || live.perCore.length,
        uptimeSeconds: Number.parseFloat(uptime.split(' ')[0]) || 0,
        load: load.length === 3 && load.every(Number.isFinite) ? load : [0, 0, 0],
      },
      cpu: {
        percent: live.cpuPercent,
        perCore: live.perCore,
        mhz: cpu.mhz,
        tempC,
        ready: live.cpuReady,
      },
      ram: memoryFrom(parseMeminfo(meminfo)),
      disks,
      network: {
        downMbit: live.downMbit,
        upMbit: live.upMbit,
        interfaces: live.interfaces,
        ready: live.netReady,
      },
    }
  }

  function dockerTarget() {
    const match = /^tcp:\/\/([^:/]+):(\d{1,5})$/.exec(cfg.dockerHost ?? '')
    if (match) return { host: match[1], port: Number(match[2]) }
    return { socketPath: cfg.dockerSocket }
  }

  function dockerGet(path) {
    return new Promise((resolve, reject) => {
      const request = http.request(
        { ...dockerTarget(), path, method: 'GET', headers: { Host: 'docker' }, timeout: 3000 },
        (response) => {
          const chunks = []
          let size = 0

          response.on('data', (chunk) => {
            size += chunk.length
            if (size > MAX_DOCKER_RESPONSE_BYTES) {
              request.destroy(new Error('Docker-Antwort zu groß'))
              return
            }
            chunks.push(chunk)
          })
          response.on('end', () => {
            if (response.statusCode !== 200) {
              reject(new Error(`Docker antwortet mit Status ${response.statusCode}`))
              return
            }
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
            } catch (error) {
              reject(error)
            }
          })
        },
      )

      request.on('timeout', () => request.destroy(new Error('Docker-Socket: Zeitüberschreitung')))
      request.on('error', reject)
      request.end()
    })
  }

  async function discover() {
    try {
      // Nur Container, die sich per Label anmelden (dashboard.name).
      const filters = encodeURIComponent(JSON.stringify({ label: ['dashboard.name'] }))
      const list = await dockerGet(`/containers/json?all=true&filters=${filters}`)
      if (!Array.isArray(list)) throw new Error('Unerwartete Docker-Antwort')

      return { available: true, containers: list.slice(0, MAX_CONTAINERS).map(toDiscoveryEntry) }
    } catch (error) {
      console.error('[agent] Docker-Abfrage fehlgeschlagen:', error instanceof Error ? error.message : error)
      return { available: false, containers: [], error: 'Docker nicht erreichbar' }
    }
  }

  const server = http.createServer(async (request, response) => {
    const send = (status, body, headers = {}) => {
      const payload = JSON.stringify(body)
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...headers,
      })
      response.end(payload)
    }

    try {
      if (request.method !== 'GET') {
        send(405, { error: 'Method Not Allowed' }, { Allow: 'GET' })
        return
      }

      const { pathname } = new URL(request.url ?? '/', 'http://agent')

      if (pathname === '/healthz') {
        send(200, { ok: true })
        return
      }

      if (!tokenMatches(request.headers.authorization, cfg.token)) {
        send(401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' })
        return
      }

      if (pathname === '/metrics') {
        send(200, await collectMetrics())
      } else if (pathname === '/discovery') {
        send(200, await discover())
      } else {
        send(404, { error: 'Not Found' })
      }
    } catch (error) {
      console.error('[agent] Fehler bei der Anfrage:', error instanceof Error ? error.message : error)
      send(500, { error: 'Internal Server Error' })
    }
  })

  server.headersTimeout = 5000
  server.requestTimeout = 10000
  server.maxHeadersCount = 50

  return {
    server,

    async start() {
      await sample()
      // Zweite Messung kurz danach, damit CPU/Netzwerk nicht erst nach einem Intervall bereit sind.
      warmup = setTimeout(sample, 500)
      warmup.unref()
      timer = setInterval(sample, cfg.sampleIntervalMs)
      timer.unref()

      if (cfg.socketPath) {
        // Ein Rest vom letzten Lauf (z. B. nach einem Absturz) würde das Binden verhindern.
        await unlink(cfg.socketPath).catch((error) => {
          if (error.code !== 'ENOENT') throw error
        })
        await new Promise((resolve, reject) => {
          server.once('error', reject)
          server.listen(cfg.socketPath, resolve)
        })
        // Zugriff nur für denselben Nutzer und dieselbe Gruppe; zusätzlich schützt das Token.
        await chmod(cfg.socketPath, 0o660)
      } else {
        await new Promise((resolve, reject) => {
          server.once('error', reject)
          server.listen(cfg.port, cfg.bind, resolve)
        })
      }
      return server.address()
    },

    async stop() {
      clearTimeout(warmup)
      clearInterval(timer)
      server.closeAllConnections?.()
      await new Promise((resolve) => server.close(resolve))
      if (cfg.socketPath) await unlink(cfg.socketPath).catch(() => {})
    },
  }
}
