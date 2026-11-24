'use client'

import { CloudSun } from 'lucide-react'
import { useEffect, useState } from 'react'

function greetingFor(hour: number): string {
  if (hour < 5) return 'Gute Nacht'
  if (hour < 11) return 'Guten Morgen'
  if (hour < 14) return 'Hallo'
  if (hour < 18) return 'Guten Tag'
  return 'Guten Abend'
}

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}

// Die Route kann temperature=null liefern (Standort/Wetterdienst nicht verfügbar) — dann bleibt das Feld leer.
type Weather = { temperature: number | null; description: string }

const WEATHER_REFRESH_MS = 10 * 60 * 1000

export function GreetingClock({ name = '' }: { name?: string }) {
  // Rendered only after mount: the clock depends on the visitor's local time,
  // so keeping the first paint empty avoids a server/client hydration mismatch.
  const [now, setNow] = useState<Date | null>(null)
  const [weather, setWeather] = useState<Weather | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Das Wetter kommt von /api/weather (Open-Meteo); schlägt es fehl, wird es einfach ausgeblendet.
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/weather', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setWeather(null)
          return
        }
        const data = (await res.json()) as Weather
        if (!cancelled) setWeather(data)
      } catch {
        // Wetter ist nur Zierde — bei Fehlern einfach ausblenden.
      }
    }

    load()
    const id = window.setInterval(load, WEATHER_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  const firstName = name.trim().split(/\s+/)[0] ?? ''
  const greeting = now ? greetingFor(now.getHours()) : 'Willkommen'
  const time = now ? now.toLocaleTimeString('de-DE', TIME_FORMAT) : '--:--'
  const seconds = now ? String(now.getSeconds()).padStart(2, '0') : '--'
  const date = now ? now.toLocaleDateString('de-DE', DATE_FORMAT) : ''

  return (
    <section className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0">
        <h1 className="text-3xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl">
          {greeting}
          {firstName ? `, ${firstName}` : ''}.
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/45">{date}</p>
      </div>

      <div className="flex items-center gap-4">
        {weather && typeof weather.temperature === 'number' ? (
          <div className="flex items-center gap-2 rounded-full bg-white/4 px-3.5 py-2 ring-1 ring-white/10 backdrop-blur-xl">
            <CloudSun className="size-4 text-sky-300/80" strokeWidth={1.75} />
            <span className="font-mono text-[12px] tabular-nums text-white/70">
              {Math.round(weather.temperature)} °C
            </span>
            <span className="text-[12px] text-white/35">{weather.description}</span>
          </div>
        ) : null}

        <p
          className="font-mono text-[28px] leading-none tracking-tight tabular-nums text-white/90"
          aria-label={now ? `Aktuelle Uhrzeit ${time}` : undefined}
        >
          {time}
          <span className="ml-1 align-baseline text-[15px] text-white/30">{seconds}</span>
        </p>
      </div>
    </section>
  )
}
