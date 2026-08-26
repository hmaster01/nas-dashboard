import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { exec } from 'node:child_process'
import { NextResponse } from 'next/server'

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

/** Summiert rx/tx-Bytes über /proc/net/dev, ohne das Loopback-Interface. */
async function readNetworkBytes(): Promise<{ rx: number; tx: number }> {
  const raw = await readFile('/proc/net/dev', 'utf8')
  const lines = raw.trim().split('\n').slice(2)

  let rx = 0
  let tx = 0

  for (const line of lines) {
    const [iface, rest] = line.split(':')
    if (!rest || iface.trim() === 'lo') continue
    const fields = rest.trim().split(/\s+/).map(Number)
    rx += fields[0] ?? 0
    tx += fields[8] ?? 0
  }

  return { rx, tx }
}

// Merkt sich die letzte Messung im Server-Prozess, um daraus eine echte
// Mbit/s-Rate zwischen zwei Aufrufen zu berechnen (statt Zufallswerten).
let lastNetSample: { rx: number; tx: number; time: number } | null = null

/**
 * Liest CPU-, RAM-, Speicher-, Netzwerk- und Uptime-Werte direkt vom Host aus.
 * Voraussetzung: docker-compose mountet den Host per `/:/hostfs:ro` und
 * nutzt `network_mode: host`, damit /proc/net/dev und /hostfs echte
 * NAS-Werte liefern statt der isolierten Container-Ansicht.
 */
export async function GET() {
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

    // Echte Netzwerkrate aus der Differenz zweier Messungen berechnen.
    const now = Date.now()
    let downMbit = 0
    let upMbit = 0
    if (lastNetSample) {
      const deltaSeconds = (now - lastNetSample.time) / 1000
      if (deltaSeconds > 0) {
        downMbit = Math.max(0, ((netNow.rx - lastNetSample.rx) * 8) / 1e6 / deltaSeconds)
        upMbit = Math.max(0, ((netNow.tx - lastNetSample.tx) * 8) / 1e6 / deltaSeconds)
      }
    }
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
        // Beim allerersten Aufruf gibt es noch keine Vorher-Messung.
        ready: lastNetSample !== null,
      },
      uptimeSeconds: os.uptime(),
      timestamp: now,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
