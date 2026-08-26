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

/**
 * Echtes Wetter statt Platzhalter: Standort wird anhand der öffentlichen
 * IP grob bestimmt (keine Nutzereingabe nötig), die eigentlichen Wetterdaten
 * kommen von Open-Meteo (kein API-Key erforderlich).
 */
export async function GET() {
  try {
    const geoRes = await fetch('https://ipapi.co/json/', { cache: 'no-store' })
    const geo = await geoRes.json()
    const { latitude, longitude, city } = geo

    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
      { cache: 'no-store' },
    )
    const weather = await weatherRes.json()
    const code = weather.current_weather?.weathercode ?? 0

    return NextResponse.json({
      city: city ?? null,
      temperature: weather.current_weather?.temperature ?? null,
      description: WEATHER_CODES[code] ?? 'Unbekannt',
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
