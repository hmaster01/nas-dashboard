import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideOidcGate } from '../lib/gate.ts'

test('Gate: ohne Sitzung sind nur die Anmelde-Pfade offen', () => {
  for (const path of ['/login', '/api/auth/login', '/api/auth/callback', '/api/auth/logout']) {
    assert.equal(decideOidcGate(path, false), 'allow', path)
  }
})

test('Gate: Seiten leiten ohne Sitzung zur Anmeldung, API-Aufrufe bekommen 401', () => {
  assert.equal(decideOidcGate('/', false), 'login')
  assert.equal(decideOidcGate('/irgendwas', false), 'login')
  assert.equal(decideOidcGate('/api/services', false), 'deny')
  assert.equal(decideOidcGate('/api/system', false), 'deny')
  assert.equal(decideOidcGate('/api/weather', false), 'deny')
  assert.equal(decideOidcGate('/api', false), 'deny')
})

test('Gate: mit Sitzung ist alles offen', () => {
  for (const path of ['/', '/api/services', '/api/system', '/login']) {
    assert.equal(decideOidcGate(path, true), 'allow', path)
  }
})

test('Gate: Tricks mit ähnlichen Pfaden öffnen nichts', () => {
  for (const path of ['/login/../api/system', '/api/auth', '/api/auth/', '/api/auth/login/extra', '/api/authx/login', '/Login', '//login', '/login.json', '/api/auth/callback2']) {
    assert.notEqual(decideOidcGate(path, false), 'allow', path)
  }
})

test('Gate: ein abschließender Schrägstrich ändert die Regel nicht', () => {
  assert.equal(decideOidcGate('/login/', false), 'allow')
  assert.equal(decideOidcGate('/api/services/', false), 'deny')
})
