// Reine Hilfsfunktionen des Agents: parsen und rechnen, kein I/O.
// Dadurch lassen sie sich mit festen Testdaten prüfen (siehe tests/).

import { createHash, timingSafeEqual } from 'node:crypto'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const round1 = (value) => Math.round(value * 10) / 10

// ---------------------------------------------------------------- CPU

/** Liest /proc/stat: Gesamt- und Pro-Kern-Zähler (Ticks). */
export function parseCpuStat(text) {
  const result = { total: null, cores: [] }

  for (const line of String(text).split('\n')) {
    const match = /^(cpu\d*)\s+(.+)$/.exec(line)
    if (!match) continue

    const nums = match[2].trim().split(/\s+/).map(Number)
    if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) continue

    // user nice system idle iowait irq softirq steal — guest steckt bereits in user.
    const total = nums.slice(0, 8).reduce((sum, n) => sum + n, 0)
    const idle = (nums[3] ?? 0) + (nums[4] ?? 0)
    const entry = { total, idle }

    if (match[1] === 'cpu') result.total = entry
    else result.cores.push(entry)
  }

  return result
}

/** Auslastung in Prozent zwischen zwei Zählerständen. */
export function cpuPercent(prev, next) {
  if (!prev || !next) return 0
  const deltaTotal = next.total - prev.total
  const deltaIdle = next.idle - prev.idle
  if (deltaTotal <= 0) return 0
  return clamp(((deltaTotal - deltaIdle) / deltaTotal) * 100, 0, 100)
}

/** Modellname, Thread-Zahl und mittlere Taktfrequenz aus /proc/cpuinfo. */
export function parseCpuInfo(text) {
  const source = String(text)
  const model = /^model name\s*:\s*(.+)$/m.exec(source)?.[1]?.trim() ?? null
  const threads = (source.match(/^processor\s*:/gm) ?? []).length
  const mhzValues = [...source.matchAll(/^cpu MHz\s*:\s*([\d.]+)$/gm)].map((m) => Number(m[1]))
  const mhz = mhzValues.length
    ? Math.round(mhzValues.reduce((a, b) => a + b, 0) / mhzValues.length)
    : null

  return { model, threads, mhz }
}

/** Wählt die Paket-Temperatur: bevorzugt x86_pkg_temp, sonst den höchsten Wert. */
export function pickTemperature(zones) {
  const valid = zones.filter((zone) => Number.isFinite(zone.milliCelsius) && zone.milliCelsius > 0)
  if (valid.length === 0) return null

  const preferred = valid.find((zone) => zone.type === 'x86_pkg_temp')
  const milli = preferred ? preferred.milliCelsius : Math.max(...valid.map((zone) => zone.milliCelsius))
  return round1(milli / 1000)
}

// ---------------------------------------------------------------- RAM

/** Liest /proc/meminfo und liefert Bytes je Schlüssel. */
export function parseMeminfo(text) {
  const info = {}
  for (const line of String(text).split('\n')) {
    const match = /^([A-Za-z_()0-9]+):\s+(\d+)(?:\s+kB)?$/.exec(line.trim())
    if (match) info[match[1]] = Number(match[2]) * 1024
  }
  return info
}

export function memoryFrom(info) {
  const total = info.MemTotal ?? 0
  const available =
    info.MemAvailable ?? (info.MemFree ?? 0) + (info.Cached ?? 0) + (info.Buffers ?? 0)
  const used = Math.max(0, total - available)
  const swapTotal = info.SwapTotal ?? 0

  return {
    totalBytes: total,
    usedBytes: used,
    availableBytes: available,
    cachedBytes: (info.Cached ?? 0) + (info.Buffers ?? 0),
    swapTotalBytes: swapTotal,
    swapUsedBytes: Math.max(0, swapTotal - (info.SwapFree ?? 0)),
    percent: total > 0 ? Math.round((used / total) * 100) : 0,
  }
}

// ---------------------------------------------------------------- Netzwerk

/** Liest /proc/net/dev: Bytes empfangen/gesendet je Schnittstelle. */
export function parseNetDev(text) {
  const out = []
  for (const line of String(text).split('\n').slice(2)) {
    const colon = line.indexOf(':')
    if (colon === -1) continue

    const name = line.slice(0, colon).trim()
    const fields = line
      .slice(colon + 1)
      .trim()
      .split(/\s+/)
      .map(Number)

    if (!name || !Number.isFinite(fields[0]) || !Number.isFinite(fields[8])) continue
    out.push({ name, rx: fields[0], tx: fields[8] })
  }
  return out
}

// Loopback und virtuelle Schnittstellen zählen sonst doppelt (Container-Traffic,
// VPN-Tunnel laufen zusätzlich über die echte Netzwerkkarte).
const VIRTUAL_INTERFACE = /^(lo|docker\d*|br-.*|veth.*|virbr.*|ifb\d*|tailscale\d*|wg\d*|tun\d*|tap\d*)$/

/** Ohne `include` werden alle nicht-virtuellen Schnittstellen verwendet. */
export function selectInterfaces(list, include = []) {
  if (include.length > 0) return list.filter((iface) => include.includes(iface.name))
  return list.filter((iface) => !VIRTUAL_INTERFACE.test(iface.name))
}

/**
 * Rate in Mbit/s zwischen zwei Messungen. Nur Schnittstellen, die in beiden
 * Messungen vorkommen, zählen — eine neu auftauchende Schnittstelle bringt sonst
 * ihren kompletten Zählerstand als Ausschlag mit.
 */
export function networkRates(prev, next, seconds) {
  if (!prev || seconds <= 0) return { downMbit: 0, upMbit: 0 }

  let rx = 0
  let tx = 0
  for (const [name, now] of next) {
    const before = prev.get(name)
    if (!before) continue
    rx += Math.max(0, now.rx - before.rx)
    tx += Math.max(0, now.tx - before.tx)
  }

  const toMbit = (bytes) => round1((bytes * 8) / 1e6 / seconds)
  return { downMbit: toMbit(rx), upMbit: toMbit(tx) }
}

// ---------------------------------------------------------------- Platten

/** Format: "System=/mnt/probe/system,Daten=/mnt/probe/daten". */
export function parseDisks(spec) {
  const disks = []
  for (const part of String(spec ?? '').split(',')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    const name = part.slice(0, index).trim()
    const path = part.slice(index + 1).trim()
    if (name && path.startsWith('/')) disks.push({ name, path })
  }
  return disks
}

/** Rechnet statfs-Werte wie `df` um (Genutzt = belegt, Frei = für Nutzer verfügbar). */
export function diskUsage(stats) {
  const block = stats.bsize
  const used = (stats.blocks - stats.bfree) * block
  const free = stats.bavail * block
  const total = stats.blocks * block
  const denominator = used + free

  return {
    totalBytes: total,
    freeBytes: free,
    usedBytes: used,
    percent: denominator > 0 ? clamp(Math.round((used / denominator) * 100), 0, 100) : 0,
  }
}

// ---------------------------------------------------------------- Docker

/** "Up 3 days (healthy)" → healthy | unhealthy | starting | none */
export function healthFromStatus(status) {
  const text = String(status ?? '')
  if (/\(unhealthy\)/i.test(text)) return 'unhealthy'
  if (/\(health: starting\)/i.test(text)) return 'starting'
  if (/\(healthy\)/i.test(text)) return 'healthy'
  return 'none'
}

/** Nur dashboard.*-Labels weitergeben — alles andere bleibt im Agent. */
export function pickLabels(labels) {
  const picked = {}
  if (!labels || typeof labels !== 'object') return picked

  for (const [key, value] of Object.entries(labels)) {
    if (!key.startsWith('dashboard.') || key.length > 64) continue
    picked[key] = String(value).slice(0, 300)
  }
  return picked
}

/** Reduziert einen Eintrag der Docker-API auf das, was das Dashboard braucht. */
export function toDiscoveryEntry(container) {
  const rawName = Array.isArray(container.Names) && container.Names[0] ? container.Names[0] : container.Id
  return {
    id: String(container.Id ?? '').slice(0, 12),
    container: String(rawName ?? '').replace(/^\//, ''),
    image: String(container.Image ?? ''),
    state: String(container.State ?? ''),
    status: String(container.Status ?? ''),
    health: healthFromStatus(container.Status),
    created: Number(container.Created) || 0,
    labels: pickLabels(container.Labels),
  }
}

// ---------------------------------------------------------------- Zugriff

/** Vergleicht das Bearer-Token zeitkonstant (über SHA-256, damit die Länge nichts verrät). */
export function tokenMatches(authorization, token) {
  const match = /^Bearer (.+)$/.exec(authorization ?? '')
  if (!match || !token) return false

  const given = createHash('sha256').update(match[1]).digest()
  const expected = createHash('sha256').update(token).digest()
  return timingSafeEqual(given, expected)
}
