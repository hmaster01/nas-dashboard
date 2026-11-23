import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

test('service links use the browser hostname and hide service ports', async () => {
  const data = await readFile(new URL('../lib/dashboard-data.ts', import.meta.url), 'utf8')
  const component = await readFile(new URL('../components/service-grid.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(data, /https?:\/\/[^\s'\"]+|192\.168\.178\./)
  assert.doesNotMatch(data, /Port\s+\d+|Interner Port/)
  assert.match(component, /window\.location\.hostname/)
  assert.match(component, /service\.port/)
  assert.match(component, /Dienstadresse automatisch erkannt/)
  assert.doesNotMatch(component, /active\.url/)
})
