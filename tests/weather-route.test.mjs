import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

const routeSource = await readFile(new URL('../app/api/weather/route.ts', import.meta.url), 'utf8')

test('weather API route is dynamic and uses external geo/weather responses', () => {
  assert.match(routeSource, /export const dynamic = 'force-dynamic'/)
  assert.match(routeSource, /https:\/\/ipapi\.co\/json\//)
  assert.match(routeSource, /https:\/\/api\.open-meteo\.com\/v1\/forecast/)
  assert.match(routeSource, /temperature: weather\.current_weather\?\.temperature \?\? null/)
})

test('weather API route returns structured error JSON for failed upstream requests', () => {
  assert.match(routeSource, /catch \(error\)/)
  assert.match(routeSource, /NextResponse\.json\(\{\s*error:\s*String\(error\)\s*\},\s*\{\s*status:\s*500\s*\}\)/)
})
