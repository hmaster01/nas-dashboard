import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { checkBasicAuth } from '../lib/basic-auth.mjs'

test('production Basic Auth fails closed without configured credentials', () => {
  assert.deepEqual(checkBasicAuth(null, {}, 'production'), {
    allowed: false,
    status: 503,
    reason: 'credentials-not-configured-or-weak',
  })
})

test('Basic Auth accepts correct credentials and rejects incorrect or absent credentials', () => {
  const env = { DASHBOARD_USERNAME: 'admin', DASHBOARD_PASSWORD: 'this-is-a-long-random-password' }
  const valid = `Basic ${Buffer.from('admin:this-is-a-long-random-password').toString('base64')}`
  const invalid = `Basic ${Buffer.from('admin:incorrect').toString('base64')}`

  assert.equal(checkBasicAuth(valid, env, 'production').allowed, true)
  assert.equal(checkBasicAuth(invalid, env, 'production').status, 401)
  assert.equal(checkBasicAuth(null, env, 'production').status, 401)
  assert.equal(checkBasicAuth(`Basic ${'a'.repeat(4096)}`, env, 'production').status, 401)
})

test('security proxy protects app and API routes and defines hardening headers', async () => {
  const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8')
  assert.match(proxy, /checkBasicAuth\(request\.headers\.get\('authorization'\)\)/)
  assert.match(proxy, /createLoginRateLimiter/)
  assert.match(proxy, /status: 429/)
  assert.match(proxy, /Retry-After/)
  assert.match(proxy, /recordFailure\(clientKey\)/)
  assert.match(proxy, /export function proxy\(request: NextRequest\)/)
  assert.match(proxy, /matcher: \['\/\(\(\?!_next\/static/)
  assert.match(proxy, /X-Content-Type-Options/)
  assert.match(proxy, /X-Frame-Options/)
  assert.match(proxy, /Content-Security-Policy/)
  assert.match(proxy, /WWW-Authenticate/)
})

test('Compose binds locally and applies container hardening without a Docker socket', async () => {
  const compose = await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8')
  assert.match(compose, /127\.0\.0\.1:3000:3000/)
  assert.match(compose, /no-new-privileges:true/)
  assert.match(compose, /cap_drop:\s*\n\s+- ALL/)
  assert.doesNotMatch(compose, /docker\.sock/)
  assert.match(compose, /DASHBOARD_USERNAME:/)
  assert.match(compose, /DASHBOARD_PASSWORD:/)
  assert.doesNotMatch(compose, /pid:\s*host/)
})
