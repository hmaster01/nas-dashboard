import { readFile, readdir, statfs } from 'node:fs/promises'
import os from 'node:os'
import { NextResponse } from 'next/server'
import { agentGet } from '@/lib/agent-client'
import { requireApiAuth } from '@/lib/server-auth'
import { collectLinuxTrafficCounters, createSystemSnapshot } from '@/lib/system-metrics.mjs'
import type { AgentSystemResponse, Metrics } from '@/lib/types'

export const dynamic = 'force-dynamic'

let lastTrafficSample: { rx: number; tx: number; time: number } | null = null

export async function GET() {
  // Systemwerte nur für Admins (im Basic-Modus ist das einzige Konto Admin).
  const auth = await requireApiAuth({ admin: true })
  if (!auth.ok) return auth.response

  // Mit Agent: echte Host-Werte (Platten, Netzwerk der Netzwerkkarte, Temperatur).
  if (auth.config.agent) {
    try {
      const metrics = await agentGet<Metrics>(auth.config.agent, '/metrics')
      const body: AgentSystemResponse = { source: 'agent', ...metrics }
      return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      console.error('[system] Agent nicht erreichbar:', error instanceof Error ? error.message : error)
      return NextResponse.json({ error: 'System telemetry is temporarily unavailable.' }, { status: 503 })
    }
  }

  // Ohne Agent: was der Dashboard-Container selbst lesen kann (wie bisher).
  try {
    const traffic = os.platform() === 'linux'
      ? await collectLinuxTrafficCounters(readFile, readdir)
      : { counters: null, trafficCountersSupported: false, source: 'os-only' }
    const snapshot = createSystemSnapshot(os, traffic)

    let cpuPercent: number | null = null
    let ramUsed = Math.max(0, (os.totalmem() - os.freemem()) / (1024 ** 3))
    let ramTotal = os.totalmem() / (1024 ** 3)
    let storage: { free: string | null; total: string | null; percent: number | null } = {
      free: null,
      total: null,
      percent: null,
    }

    if (os.platform() === 'linux') {
      try {
        const [cpuStat, memInfo] = await Promise.all([
          readFile('/proc/stat', 'utf8'),
          readFile('/proc/meminfo', 'utf8'),
        ])
        const cpuLines = cpuStat.split(/\r?\n/).filter((line) => /^cpu\d+\s/.test(line))
        if (cpuLines.length) {
          const values = cpuLines.map((line) => line.trim().split(/\s+/).slice(1).map(Number))
          const total = values.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0)
          const idle = values.reduce((sum, row) => sum + (row[3] ?? 0) + (row[4] ?? 0), 0)
          if (total > 0) cpuPercent = Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)))
        }

        const memTotalKb = Number(memInfo.match(/^MemTotal:\s+(\d+)\s+kB/im)?.[1])
        const memAvailableKb = Number(memInfo.match(/^MemAvailable:\s+(\d+)\s+kB/im)?.[1])
        if (Number.isFinite(memTotalKb) && Number.isFinite(memAvailableKb)) {
          ramTotal = memTotalKb / 1024 / 1024
          ramUsed = (memTotalKb - memAvailableKb) / 1024 / 1024
        }
      } catch {
        // Preserve portable OS values when Linux procfs is restricted.
      }

      try {
        const mountPoint = process.env.HOST_MOUNT_POINT || '/'
        const stats = await statfs(mountPoint)
        const totalBytes = Number(stats.blocks) * Number(stats.bsize)
        const freeBytes = Number(stats.bavail) * Number(stats.bsize)
        storage = {
          free: `${(freeBytes / 1e12).toFixed(2)} TB frei`,
          total: `${(totalBytes / 1e12).toFixed(2)} TB`,
          percent: totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((1 - freeBytes / totalBytes) * 100))) : null,
        }
      } catch {
        // Storage details stay unavailable when the configured mount is inaccessible.
      }
    }

    const currentTraffic = Object.values(traffic.counters ?? {}).reduce(
      (totals, counter) => ({ rx: totals.rx + (counter.rxBytes ?? 0), tx: totals.tx + (counter.txBytes ?? 0) }),
      { rx: 0, tx: 0 },
    )
    const now = Date.now()
    let downMbit = 0
    let upMbit = 0
    const networkReady = lastTrafficSample !== null && traffic.trafficCountersSupported
    if (networkReady && lastTrafficSample) {
      const elapsedSeconds = (now - lastTrafficSample.time) / 1000
      if (elapsedSeconds > 0) {
        downMbit = Math.max(0, ((currentTraffic.rx - lastTrafficSample.rx) * 8) / 1e6 / elapsedSeconds)
        upMbit = Math.max(0, ((currentTraffic.tx - lastTrafficSample.tx) * 8) / 1e6 / elapsedSeconds)
      }
    }
    lastTrafficSample = traffic.trafficCountersSupported ? { ...currentTraffic, time: now } : null

    const safeInterfaces = Object.fromEntries(
      Object.entries(snapshot.interfaces).map(([name, addresses]) => [
        name,
        addresses.map(({ address, family, internal }) => ({ address, family, internal })),
      ]),
    )

    return NextResponse.json({
      ...snapshot,
      interfaces: safeInterfaces,
      cpu: { percent: cpuPercent, cores: os.cpus().length, speedMHz: os.cpus()[0]?.speed ?? null },
      ram: { used: ramUsed, total: ramTotal, percent: ramTotal > 0 ? Math.round((ramUsed / ramTotal) * 100) : null },
      storage,
      network: {
        downMbit: Number(downMbit.toFixed(1)),
        upMbit: Number(upMbit.toFixed(1)),
        ready: networkReady,
        trafficCountersSupported: traffic.trafficCountersSupported,
        source: traffic.source,
        interfaces: traffic.counters,
      },
    })
  } catch {
    return NextResponse.json({ error: 'System telemetry is temporarily unavailable.' }, { status: 503 })
  }
}
