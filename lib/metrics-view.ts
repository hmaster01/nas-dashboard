/**
 * Macht aus den Agent-Messwerten die Texte für Statusleiste und Detail-Dialoge.
 * Reine Funktionen, keine erfundenen Werte: was nicht gemessen wird, bleibt "—".
 */

import type { DetailGroup, LegacySystemResponse, Metrics } from './types'

export type MetricId = 'cpu' | 'ram' | 'storage' | 'network'
export const METRIC_IDS: MetricId[] = ['cpu', 'ram', 'storage', 'network']

export type Readout = { id: MetricId; label: string; value: string; caption: string; percent: number }
export type MetricModal = { title: string; subtitle: string; groups: DetailGroup[] }

const MAX_CORE_ROWS = 32
const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit <= 1 ? 0 : value >= 100 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days > 0 ? `${days}d ${String(hours).padStart(2, '0')}h` : `${hours}h ${String(minutes).padStart(2, '0')}m`
}

export const formatMbit = (value: number) => `${value.toFixed(1)} Mbit/s`

/** Balken der Netzwerkkachel: 1 Gbit/s (down + up) entspricht "voll". */
const networkPercent = (down: number, up: number) => clampPercent(((down + up) / 1000) * 100)

export function readoutsFor(metrics: Metrics | null): Readout[] {
  const loading = (id: MetricId, label: string): Readout => ({ id, label, value: '—', caption: 'Lädt …', percent: 0 })
  if (!metrics) return [loading('cpu', 'CPU'), loading('ram', 'RAM'), loading('storage', 'Speicher'), loading('network', 'Netzwerk')]

  const { cpu, ram, disks, network, host } = metrics

  const cpuReadout: Readout = cpu.ready
    ? {
        id: 'cpu',
        label: 'CPU',
        value: `${cpu.percent} %`,
        caption: cpu.tempC !== null ? `${host.threads} Threads · ${cpu.tempC.toFixed(0)} °C` : `${host.threads} Threads`,
        percent: clampPercent(cpu.percent),
      }
    : { id: 'cpu', label: 'CPU', value: '—', caption: 'Erste Messung läuft …', percent: 0 }

  const ramReadout: Readout = {
    id: 'ram',
    label: 'RAM',
    value: `${formatBytes(ram.usedBytes)} / ${formatBytes(ram.totalBytes)}`,
    caption: `${ram.percent} % belegt`,
    percent: clampPercent(ram.percent),
  }

  // Die erste konfigurierte Platte steht in der Leiste — alle weiteren im Dialog.
  const first = disks[0]
  let storageReadout: Readout
  if (!first) {
    storageReadout = { id: 'storage', label: 'Speicher', value: '—', caption: 'Keine Platte konfiguriert', percent: 0 }
  } else if (!first.ok) {
    storageReadout = { id: 'storage', label: 'Speicher', value: '—', caption: `${first.name}: nicht lesbar`, percent: 0 }
  } else {
    storageReadout = {
      id: 'storage',
      label: 'Speicher',
      value: `${formatBytes(first.freeBytes)} frei`,
      caption: `von ${formatBytes(first.totalBytes)} · ${first.name}`,
      percent: clampPercent(first.percent),
    }
  }

  const networkReadout: Readout = network.ready
    ? {
        id: 'network',
        label: 'Netzwerk',
        value: formatMbit(network.downMbit + network.upMbit),
        caption: `↓ ${network.downMbit.toFixed(1)} · ↑ ${network.upMbit.toFixed(1)} Mbit/s`,
        percent: networkPercent(network.downMbit, network.upMbit),
      }
    : { id: 'network', label: 'Netzwerk', value: '—', caption: 'Erste Messung läuft …', percent: 0 }

  return [cpuReadout, ramReadout, storageReadout, networkReadout]
}

export function modalFor(id: MetricId, metrics: Metrics): MetricModal {
  const { cpu, ram, disks, network, host } = metrics

  if (id === 'cpu') {
    const detailRows = [
      { label: 'Threads', value: String(host.threads) },
      { label: 'Load Average', value: host.load.map((n) => n.toFixed(2)).join(' / ') },
    ]
    if (cpu.mhz !== null) detailRows.push({ label: 'Taktfrequenz (Ø)', value: `${(cpu.mhz / 1000).toFixed(2)} GHz` })
    detailRows.push({ label: 'Temperatur', value: cpu.tempC !== null ? `${cpu.tempC.toFixed(1)} °C` : 'Kein Sensor sichtbar' })

    const groups: DetailGroup[] = []
    if (cpu.perCore.length > 0) {
      groups.push({
        title: 'Kern-Auslastung',
        rows: cpu.perCore.slice(0, MAX_CORE_ROWS).map((percent, index) => ({
          label: `Kern ${index + 1}`,
          value: `${percent} %`,
          percent: clampPercent(percent),
        })),
      })
    }
    groups.push({ title: 'Details', rows: detailRows })

    return { title: 'Prozessor', subtitle: host.cpuModel ?? 'Unbekanntes Modell', groups }
  }

  if (id === 'ram') {
    const percentOf = (bytes: number) => (ram.totalBytes > 0 ? clampPercent((bytes / ram.totalBytes) * 100) : 0)
    const swap =
      ram.swapTotalBytes > 0
        ? {
            label: 'Swap',
            value: `${formatBytes(ram.swapUsedBytes)} / ${formatBytes(ram.swapTotalBytes)}`,
            percent: clampPercent((ram.swapUsedBytes / ram.swapTotalBytes) * 100),
          }
        : { label: 'Swap', value: 'Nicht aktiv' }

    return {
      title: 'Arbeitsspeicher',
      subtitle: `${formatBytes(ram.totalBytes)} gesamt`,
      groups: [
        {
          title: 'Belegung',
          rows: [
            { label: 'Belegt', value: formatBytes(ram.usedBytes), percent: percentOf(ram.usedBytes) },
            { label: 'Cache & Puffer', value: formatBytes(ram.cachedBytes), percent: percentOf(ram.cachedBytes) },
            { label: 'Verfügbar', value: formatBytes(ram.availableBytes), percent: percentOf(ram.availableBytes) },
          ],
        },
        { title: 'Auslagerung', rows: [swap] },
      ],
    }
  }

  if (id === 'storage') {
    return {
      title: 'Massenspeicher',
      subtitle: disks.length === 1 ? '1 Laufwerk' : `${disks.length} Laufwerke`,
      groups: [
        {
          title: 'Laufwerke',
          rows:
            disks.length === 0
              ? [{ label: 'Keine Platte konfiguriert', value: 'DISKS setzen' }]
              : disks.map((disk) =>
                  disk.ok
                    ? {
                        label: disk.name,
                        value: `${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)}`,
                        percent: clampPercent(disk.percent),
                      }
                    : { label: disk.name, value: 'Nicht lesbar' },
                ),
        },
      ],
    }
  }

  return {
    title: 'Netzwerk',
    subtitle: network.interfaces.length > 0 ? network.interfaces.join(', ') : 'Keine Schnittstelle',
    groups: [
      {
        title: 'Durchsatz',
        rows: network.ready
          ? [
              { label: 'Download', value: formatMbit(network.downMbit), percent: networkPercent(network.downMbit, 0) },
              { label: 'Upload', value: formatMbit(network.upMbit), percent: networkPercent(0, network.upMbit) },
            ]
          : [{ label: 'Messung', value: 'Läuft …' }],
      },
    ],
  }
}

// ---------------------------------------------------------------- Ohne Agent

/**
 * Anzeige für die Werte, die der Dashboard-Container selbst lesen kann (kein Agent eingerichtet).
 * Gleiche Regel wie oben: nichts erfinden — was fehlt, bleibt "—".
 */
export function legacyReadoutsFor(live: LegacySystemResponse | null): Readout[] {
  const loading = (id: MetricId, label: string): Readout => ({ id, label, value: '—', caption: 'Lädt …', percent: 0 })
  if (!live) return [loading('cpu', 'CPU'), loading('ram', 'RAM'), loading('storage', 'Speicher'), loading('network', 'Netzwerk')]

  const { cpu, ram, storage, network } = live

  const cpuCaption = cpu.speedMHz ? `${cpu.cores} Kerne · ${(cpu.speedMHz / 1000).toFixed(1)} GHz` : `${cpu.cores} Kerne`

  return [
    {
      id: 'cpu',
      label: 'CPU',
      value: cpu.percent === null ? '—' : `${cpu.percent} %`,
      caption: cpuCaption,
      percent: cpu.percent === null ? 0 : clampPercent(cpu.percent),
    },
    {
      id: 'ram',
      label: 'RAM',
      value: `${ram.used.toFixed(1)} / ${ram.total.toFixed(0)} GB`,
      caption: ram.percent === null ? '—' : `${ram.percent} % belegt`,
      percent: ram.percent === null ? 0 : clampPercent(ram.percent),
    },
    {
      id: 'storage',
      label: 'Speicher',
      value: storage.free ?? '—',
      caption: storage.total ? `von ${storage.total}` : 'Nicht lesbar',
      percent: storage.percent === null ? 0 : clampPercent(storage.percent),
    },
    network.ready
      ? {
          id: 'network',
          label: 'Netzwerk',
          value: formatMbit(network.downMbit),
          caption: `↓ ${network.downMbit.toFixed(1)} · ↑ ${network.upMbit.toFixed(1)} Mbit/s`,
          percent: clampPercent((network.downMbit / 150) * 100),
        }
      : { id: 'network', label: 'Netzwerk', value: '—', caption: 'Erste Messung läuft …', percent: 0 },
  ]
}

const AGENT_HINT: DetailGroup = {
  title: 'Mehr Details',
  rows: [{ label: 'Einzelne Kerne, Temperatur, Platten', value: 'Agent einrichten' }],
}

export function legacyModalFor(id: MetricId, live: LegacySystemResponse): MetricModal {
  const { cpu, ram, storage, network } = live

  if (id === 'cpu') {
    return {
      title: 'Prozessor',
      subtitle: `${cpu.cores} Kerne`,
      groups: [
        {
          title: 'Auslastung',
          rows: [
            cpu.percent === null
              ? { label: 'Gesamt', value: 'Nicht lesbar' }
              : { label: 'Gesamt', value: `${cpu.percent} %`, percent: clampPercent(cpu.percent) },
            ...(cpu.speedMHz ? [{ label: 'Taktfrequenz', value: `${(cpu.speedMHz / 1000).toFixed(2)} GHz` }] : []),
          ],
        },
        AGENT_HINT,
      ],
    }
  }

  if (id === 'ram') {
    const percent = ram.percent === null ? undefined : clampPercent(ram.percent)
    return {
      title: 'Arbeitsspeicher',
      subtitle: `${ram.total.toFixed(1)} GB gesamt`,
      groups: [
        { title: 'Belegung', rows: [{ label: 'Belegt', value: `${ram.used.toFixed(1)} GB`, ...(percent === undefined ? {} : { percent }) }] },
        AGENT_HINT,
      ],
    }
  }

  if (id === 'storage') {
    return {
      title: 'Massenspeicher',
      subtitle: storage.total ?? 'Nicht lesbar',
      groups: [
        {
          title: 'Dateisystem des Containers',
          rows: [
            { label: 'Frei', value: storage.free ?? '—' },
            { label: 'Gesamt', value: storage.total ?? '—', ...(storage.percent === null ? {} : { percent: clampPercent(storage.percent) }) },
          ],
        },
        AGENT_HINT,
      ],
    }
  }

  return {
    title: 'Netzwerk',
    subtitle: 'Schnittstellen des Containers',
    groups: [
      {
        title: 'Durchsatz',
        rows: network.ready
          ? [
              { label: 'Download', value: formatMbit(network.downMbit) },
              { label: 'Upload', value: formatMbit(network.upMbit) },
            ]
          : [{ label: 'Messung', value: 'Läuft …' }],
      },
      AGENT_HINT,
    ],
  }
}
