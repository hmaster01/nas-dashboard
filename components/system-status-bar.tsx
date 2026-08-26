'use client'

import { useEffect, useState } from 'react'
import { DetailGroups } from '@/components/detail-groups'
import { GlassModal } from '@/components/glass-modal'
import { SYSTEM_METRICS } from '@/lib/dashboard-data'
import type { MetricId, SystemMetric } from '@/lib/dashboard-data'

type LiveTraffic = { down: number; up: number }

type LiveSystem = {
  cpu: { percent: number; cores: number; speedMHz: number | null }
  ram: { used: number; total: number; percent: number }
  storage: { free: string; total: string; percent: number }
  network: { downMbit: number; upMbit: number; ready: boolean }
  uptimeSeconds: number
} | null

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  return `${days}d ${String(hours).padStart(2, '0')}h`
}

/** Gentle random walk so the readout breathes instead of jumping around. */
function nextTraffic({ down, up }: LiveTraffic): LiveTraffic {
  const drift = (value: number, spread: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value + (Math.random() - 0.5) * spread))

  return {
    down: drift(down, 22, 4, 240),
    up: drift(up, 5, 0.4, 40),
  }
}

function MetricButton({
  metric,
  value,
  caption,
  percent,
  onOpen,
}: {
  metric: SystemMetric
  value: string
  caption: string
  percent: number
  onOpen: (id: MetricId) => void
}) {
  const Icon = metric.icon

  return (
    <button
      type="button"
      onClick={() => onOpen(metric.id)}
      aria-label={`${metric.label} Details anzeigen`}
      className="group flex min-w-0 flex-col gap-2 rounded-2xl px-3 py-2.5 text-left transition-colors duration-500 ease-out hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          className="size-[15px] shrink-0 text-white/40 transition-colors duration-500 group-hover:text-sky-300"
          strokeWidth={1.75}
        />
        <span className="truncate text-[11px] font-medium tracking-[0.12em] text-white/40 uppercase">
          {metric.label}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate font-mono text-[13px] tabular-nums text-white/90">{value}</p>
        <p className="truncate text-[11px] text-white/35">{caption}</p>
      </div>

      <div className="h-[3px] overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400/60 to-sky-300 transition-[width] duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </button>
  )
}

export function SystemStatusBar() {
  const [openId, setOpenId] = useState<MetricId | null>(null)
  const [live, setLive] = useState<LiveSystem>(null)

  // Polls the NAS for real CPU/RAM/Speicher/Netzwerk/Uptime-Werte über /api/system.
  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch('/api/system', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setLive(data)
      } catch {
        // NAS unreachable / Route noch nicht bereit – vorherigen Stand behalten.
      }
    }

    poll()
    const id = window.setInterval(poll, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const active = SYSTEM_METRICS.find((metric) => metric.id === openId) ?? null
  const ActiveIcon = active?.icon

  function readoutFor(metric: SystemMetric) {
    if (metric.id === 'cpu' && live) {
      const caption = live.cpu.speedMHz
        ? `${live.cpu.cores} Kerne · ${(live.cpu.speedMHz / 1000).toFixed(1)} GHz`
        : `${live.cpu.cores} Kerne`
      return { value: `${live.cpu.percent} %`, caption, percent: live.cpu.percent }
    }

    if (metric.id === 'ram' && live) {
      return {
        value: `${live.ram.used.toFixed(1)} / ${live.ram.total.toFixed(0)} GB`,
        caption: metric.caption,
        percent: live.ram.percent,
      }
    }

    if (metric.id === 'storage' && live) {
      return {
        value: live.storage.free,
        caption: `von ${live.storage.total}`,
        percent: live.storage.percent,
      }
    }

    if (metric.id === 'network' && live) {
      if (!live.network.ready) {
        return { value: '—', caption: 'Erste Messung läuft …', percent: 0 }
      }
      return {
        value: `${live.network.downMbit.toFixed(1)} Mbit/s`,
        caption: `↓ ${live.network.downMbit.toFixed(1)} · ↑ ${live.network.upMbit.toFixed(1)} Mbit/s`,
        percent: Math.min(100, (live.network.downMbit / 150) * 100),
      }
    }

    return { value: metric.value, caption: metric.caption, percent: metric.percent }
  }

  return (
    <>
      {/* masks the strip above the sticky bar so nothing shows through */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-10 h-10 bg-[#08090b]" />

      <header className="sticky top-4 z-20">
        <div className="flex flex-col gap-3 rounded-3xl bg-[#101216] bg-gradient-to-b from-white/6 to-white/2 px-3 py-3 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-3 px-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="relative grid size-2 shrink-0 place-items-center">
                <span className="absolute size-2 animate-ping rounded-full bg-emerald-400/60" />
                <span className="size-1.5 rounded-full bg-emerald-400" />
              </span>
              <p className="truncate text-[13px] font-medium tracking-tight text-white/90">Home Server</p>
            </div>
            <p className="shrink-0 font-mono text-[11px] tabular-nums text-white/35">
              {live ? `Uptime ${formatUptime(live.uptimeSeconds)}` : 'Uptime —'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 min-[560px]:grid-cols-4">
            {SYSTEM_METRICS.map((metric) => {
              const readout = readoutFor(metric)
              return (
                <MetricButton
                  key={metric.id}
                  metric={metric}
                  value={readout.value}
                  caption={readout.caption}
                  percent={readout.percent}
                  onOpen={setOpenId}
                />
              )
            })}
          </div>
        </div>
      </header>

      <GlassModal
        open={active !== null}
        onClose={() => setOpenId(null)}
        title={active?.modalTitle ?? ''}
        subtitle={active?.modalSubtitle ?? ''}
        eyebrow={
          ActiveIcon ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/6 ring-1 ring-white/10">
              <ActiveIcon className="size-[18px] text-sky-300" strokeWidth={1.75} />
            </span>
          ) : null
        }
      >
        {active ? <DetailGroups groups={active.groups} /> : null}
      </GlassModal>
    </>
  )
}
