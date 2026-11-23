import { readFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import { exec } from 'node:child_process'
import { NextResponse } from 'next/server'
import { collectLinuxTrafficCounters, createSystemSnapshot } from '@/lib/system-metrics.mjs'

export const dynamic = 'force-dynamic'

function run(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.toString() || error.message))
        return
      }
      resolve(stdout.toString().trim())
    })
  })
}

async function runOptional(cmd: string): Promise<string | null> {
  try {
    return await run(cmd)
  } catch {
    return null
  }
}

let lastTrafficSample: { rx: number; tx: number; time: number } | null = null

export async function GET() {
  const traffic = os.platform() === 'linux'
    ? await collectLinuxTrafficCounters(readFile, readdir)
    : { counters: null, trafficCountersSupported: false, source: 'os-only' }

  const snapshot = createSystemSnapshot(os, traffic)
  let cpuPercent: number | null = null
  let ramUsed: number | null = null
  let ramTotal: number | null = null
  let storage: { free: string | null; total: string | null; percent: number | null } = {
    free: null,
    total: null,
    percent: null,
  }

  if (os.platform() === 'linux') {
    const [cpuRaw, memRaw, diskRaw] = await Promise.all([
      runOptional(`top -bn1 | grep "Cpu(s)" | awk '{print 100 - $8}'`),
      runOptional(`free -m | awk '/Mem:/ {printf "%.1f %.1f", $3/1024, $2/1024}'`),
      runOptional(`df -h /hostfs 2>/dev/null || df -h / | awk 'NR==2 {gsub("%","",$5); print $2, $4, $5}'`),
    ])

    const parsedCpu = cpuRaw === null ? Number.NaN : parseFloat(cpuRaw)
    if (Number.isFinite(parsedCpu)) cpuPercent = Math.max(0, Math.min(100, Math.round(parsedCpu)))

    if (memRaw) {
      const [usedRaw, totalRaw] = memRaw.split(/\s+/)
      const used = parseFloat(usedRaw)
      const total = parseFloat(totalRaw)
      if (Number.isFinite(used) && Number.isFinite(total)) {
        ramUsed = used
        ramTotal = total
      }
    }

    if (diskRaw) {
      const [total, free, percentRaw] = diskRaw.split(/\s+/)
      const percent = Number.parseInt(percentRaw, 10)
      storage = {
        free: free ? `${free} frei` : null,
        total: total ?? null,
        percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null,
      }
    }
  }

  const currentTraffic = Object.values(traffic.counters ?? {}).reduce(
    (totals, counter) => ({ rx: totals.rx + counter.rxBytes, tx: totals.tx + counter.txBytes }),
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
  lastTrafficSample = traffic.trafficCountersSupported
    ? { ...currentTraffic, time: now }
    : null

  const ramPercent = ramUsed !== null && ramTotal ? Math.round((ramUsed / ramTotal) * 100) : null
  return NextResponse.json({
    ...snapshot,
    cpu: {
      percent: cpuPercent,
      cores: os.cpus().length,
      speedMHz: os.cpus()[0]?.speed ?? null,
    },
    ram: { used: ramUsed, total: ramTotal, percent: ramPercent },
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
}
