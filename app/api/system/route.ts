import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { exec } from 'node:child_process'
import { NextResponse } from 'next/server'
import {
  getSystemMetricsPlatformResponse,
  networkRateMbit,
  parseNetworkBytes,
} from '@/lib/system-metrics.mjs'

// Always run live on the server, never cache this route.
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

async function readNetworkBytes(): Promise<{ rx: number; tx: number }> {
  const raw = await readFile('/proc/net/dev', 'utf8')
  return parseNetworkBytes(raw)
}

let lastNetSample: { rx: number; tx: number; time: number } | null = null

/** Read live host metrics. Linux containers need the documented host mounts. */
export async function GET() {
  const platformResponse = getSystemMetricsPlatformResponse(process.platform)
  if (platformResponse) {
    return NextResponse.json(platformResponse.body, { status: platformResponse.status })
  }

  try {
    const [cpuRaw, memRaw, diskRaw, netNow] = await Promise.all([
      run(`top -bn1 | grep "Cpu(s)" | awk '{print 100 - $8}'`),
      run(`free -m | awk '/Mem:/ {printf "%.1f %.1f", $3/1024, $2/1024}'`),
      run(`df -h /hostfs 2>/dev/null || df -h / | awk 'NR==2 {gsub("%","",$5); print $2, $4, $5}'`),
      readNetworkBytes(),
    ])

    const cpuPercent = Math.max(0, Math.min(100, Math.round(parseFloat(cpuRaw))))

    const [ramUsedRaw, ramTotalRaw] = memRaw.split(' ')
    const ramUsed = parseFloat(ramUsedRaw)
    const ramTotal = parseFloat(ramTotalRaw)
    const ramPercent = ramTotal > 0 ? Math.round((ramUsed / ramTotal) * 100) : 0

    const [diskTotal, diskFree, diskUsedPercentRaw] = diskRaw.trim().split(/\s+/)
    const diskUsedPercent = Math.max(0, Math.min(100, parseInt(diskUsedPercentRaw, 10) || 0))

    const now = Date.now()
    const deltaSeconds = lastNetSample ? (now - lastNetSample.time) / 1000 : 0
    const { downMbit, upMbit } = networkRateMbit(netNow, lastNetSample, deltaSeconds)
    const networkReady = lastNetSample !== null
    lastNetSample = { rx: netNow.rx, tx: netNow.tx, time: now }

    const cpus = os.cpus()

    return NextResponse.json({
      cpu: {
        percent: cpuPercent,
        cores: cpus.length,
        speedMHz: cpus[0]?.speed ?? null,
      },
      ram: { used: ramUsed, total: ramTotal, percent: ramPercent },
      storage: {
        free: `${diskFree} frei`,
        total: diskTotal,
        percent: diskUsedPercent,
      },
      network: {
        downMbit: Number(downMbit.toFixed(1)),
        upMbit: Number(upMbit.toFixed(1)),
        ready: networkReady,
      },
      uptimeSeconds: os.uptime(),
      timestamp: now,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
