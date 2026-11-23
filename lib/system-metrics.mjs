export function parseProcNetDev(raw) {
  const counters = {}

  for (const line of raw.trim().split(/\r?\n/).slice(2)) {
    const separator = line.indexOf(':')
    if (separator < 0) continue

    const iface = line.slice(0, separator).trim()
    const fields = line.slice(separator + 1).trim().split(/\s+/).map(Number)
    if (!iface || fields.length < 16 || fields.some((value) => !Number.isFinite(value))) continue

    counters[iface] = {
      rxBytes: fields[0],
      rxPackets: fields[1],
      txBytes: fields[8],
      txPackets: fields[9],
    }
  }

  return counters
}

export async function collectLinuxTrafficCounters(
  readFileFn,
  readdirFn,
  procPath = '/proc/net/dev',
  sysClassNetPath = '/sys/class/net',
) {
  let counters = {}
  let source = 'os-only'

  try {
    counters = parseProcNetDev(await readFileFn(procPath, 'utf8'))
    if (Object.keys(counters).length) source = 'procfs'
  } catch {
    // /proc may be restricted or masked in hardened containers; fall back to sysfs.
  }

  try {
    const interfaces = await readdirFn(sysClassNetPath)
    let readSysfs = false

    for (const iface of interfaces) {
      const current = counters[iface] ?? {}
      const statsPath = `${sysClassNetPath}/${iface}/statistics`
      for (const field of ['rxBytes', 'rxPackets', 'txBytes', 'txPackets']) {
        if (Number.isFinite(current[field])) continue
        const file = `${statsPath}/${field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`
        try {
          const value = Number((await readFileFn(file, 'utf8')).trim())
          if (Number.isFinite(value)) {
            current[field] = value
            readSysfs = true
          }
        } catch {
          // Preserve missing counters as unavailable instead of failing the snapshot.
        }
      }

      if (Object.keys(current).length) counters[iface] = current
    }

    if (readSysfs) source = source === 'procfs' ? 'procfs+sysfs' : 'sysfs'
  } catch {
    // Keep any procfs counters already collected.
  }

  return {
    counters: Object.keys(counters).length ? counters : null,
    trafficCountersSupported: Object.keys(counters).length > 0,
    source,
  }
}

export function createSystemSnapshot(osInfo, traffic = {
  counters: null,
  trafficCountersSupported: false,
  source: 'os-only',
}, timestamp = Date.now()) {
  const interfaces = osInfo.networkInterfaces()
  return {
    platform: osInfo.platform(),
    release: osInfo.release(),
    arch: osInfo.arch(),
    uptimeSec: osInfo.uptime(),
    loadAvg: osInfo.loadavg(),
    memory: {
      totalBytes: osInfo.totalmem(),
      freeBytes: osInfo.freemem(),
    },
    interfaces,
    trafficCountersSupported: traffic.trafficCountersSupported,
    trafficSource: traffic.source,
    counters: traffic.counters,
    timestamp,
  }
}
