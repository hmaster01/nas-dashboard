import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBasicAuth } from '../lib/basic-auth.mjs'

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
    reason: 'credentials-not-configured',
  })
})

test('development remains usable without configured credentials', () => {
  assert.equal(checkBasicAuth(null, {}, 'development').allowed, true)
})

test('oversized auth headers are rejected', () => {
  assert.equal(checkBasicAuth(`Basic ${'a'.repeat(4096)}`, configured, 'production').status, 401)
})
