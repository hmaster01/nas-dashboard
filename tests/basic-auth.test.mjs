import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBasicAuth, createLoginRateLimiter } from '../lib/basic-auth.mjs'

const configured = { DASHBOARD_USERNAME: 'operator', DASHBOARD_PASSWORD: 'a-long-random-test-password' }
const validHeader = `Basic ${Buffer.from('operator:a-long-random-test-password').toString('base64')}`

test('Basic Auth accepts only matching configured credentials', () => {
  assert.equal(checkBasicAuth(validHeader, configured, 'production').allowed, true)
  assert.equal(checkBasicAuth('Basic ' + Buffer.from('operator:wrong').toString('base64'), configured, 'production').status, 401)
  assert.equal(checkBasicAuth(null, configured, 'production').status, 401)
})

test('production fails closed when credentials are missing', () => {
  assert.deepEqual(checkBasicAuth(null, {}, 'production'), {
    allowed: false,
    status: 503,
    reason: 'credentials-not-configured-or-weak',
  })
})

test('production rejects configured passwords shorter than 24 characters', () => {
  assert.deepEqual(checkBasicAuth(null, {
    DASHBOARD_USERNAME: 'operator',
    DASHBOARD_PASSWORD: 'too-short',
  }, 'production'), {
    allowed: false,
    status: 503,
    reason: 'credentials-not-configured-or-weak',
  })
})

test('development remains usable without configured credentials', () => {
  assert.equal(checkBasicAuth(null, {}, 'development').allowed, true)
})

test('login limiter blocks repeated failures and expires its window', () => {
  let time = 1000
  const limiter = createLoginRateLimiter({ limit: 2, windowMs: 500, now: () => time })
  assert.equal(limiter.isLimited('client'), false)
  limiter.recordFailure('client')
  limiter.recordFailure('client')
  assert.equal(limiter.isLimited('client'), true)
  time += 501
  assert.equal(limiter.isLimited('client'), false)
})

test('oversized auth headers are rejected', () => {
  assert.equal(checkBasicAuth(`Basic ${'a'.repeat(4096)}`, configured, 'production').status, 401)
})
