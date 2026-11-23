export function getSystemMetricsPlatformResponse(platform) {
  if (platform === 'linux') return null

  return {
    status: 501,
    body: {
      error: 'System metrics are only available on Linux.',
      platform,
    },
  }
}

export function parseNetworkBytes(raw) {
  let rx = 0
  let tx = 0

  for (const line of raw.trim().split(/\r?\n/).slice(2)) {
    const separator = line.indexOf(':')
    if (separator < 0) continue

    const iface = line.slice(0, separator).trim()
    const rest = line.slice(separator + 1).trim()
    if (!rest || iface === 'lo') continue

    const fields = rest.split(/\s+/).map(Number)
    const received = fields[0]
    const transmitted = fields[8]
    if (!Number.isFinite(received) || !Number.isFinite(transmitted)) continue

    rx += received
    tx += transmitted
  }

  return { rx, tx }
}

export function networkRateMbit(current, previous, elapsedSeconds) {
  if (!previous || elapsedSeconds <= 0) return { downMbit: 0, upMbit: 0 }

  return {
    downMbit: Math.max(0, ((current.rx - previous.rx) * 8) / 1e6 / elapsedSeconds),
    upMbit: Math.max(0, ((current.tx - previous.tx) * 8) / 1e6 / elapsedSeconds),
  }
}
