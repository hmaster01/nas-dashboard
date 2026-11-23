import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

test('dashboard footer derives its address from the current browser URL', async () => {
  const component = await readFile(new URL('../components/device-address.tsx', import.meta.url), 'utf8')
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8')

  assert.match(component, /window\.location\.hostname/)
  assert.match(page, /<DeviceAddress\s*\/>/)
  assert.doesNotMatch(page, /(?:\d{1,3}\.){3}\d{1,3}/)
  assert.doesNotMatch(component, /location\.host\b/)
})
