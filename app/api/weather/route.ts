import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WEATHER_CODES: Record<number, string> = {
  0: 'Klar',
  1: 'Meist klar',
  2: 'Teilweise bewölkt',
  3: 'Bewölkt',
  45: 'Nebel',
  48: 'Nebel',
  51: 'Leichter Regen',
  53: 'Regen',
  55: 'Starker Regen',
  61: 'Regen',
  63: 'Regen',
  65: 'Starker Regen',
  71: 'Schnee',
  73: 'Schnee',
  75: 'Starker Schnee',
  80: 'Regenschauer',
  81: 'Regenschauer',
  82: 'Starke Schauer',
  95: 'Gewitter',
  96: 'Gewitter mit Hagel',
  99: 'Gewitter mit Hagel',
}

export async function GET() {
  try {
    const geoRes = await fetch('https://ipapi.co/json/', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!geoRes.ok) throw new Error('Geolocation service unavailable')
    const geo = await geoRes.json()
    const latitude = Number(geo.latitude)
    const longitude = Number(geo.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ city: null, temperature: null, description: 'Standort nicht verfügbar' })
    }

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    )
    if (!weatherRes.ok) throw new Error('Weather service unavailable')
    const weather = await weatherRes.json()
    const code = weather.current_weather?.weathercode ?? 0

    return NextResponse.json({
      city: typeof geo.city === 'string' ? geo.city : null,
      temperature: Number.isFinite(weather.current_weather?.temperature) ? weather.current_weather.temperature : null,
      description: WEATHER_CODES[code] ?? 'Unbekannt',
    })
  } catch {
    return NextResponse.json({ error: 'Weather data is temporarily unavailable.' }, { status: 502 })
  }
}
