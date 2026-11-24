import assert from 'node:assert/strict'
import http from 'node:http'
import { afterEach, test } from 'node:test'
import { authModeFromEnv, readConfig } from '../lib/config.ts'
import { canSee, isAdminUser, splitList } from '../lib/groups.ts'
import {
  buildAuthorizeUrl,
  challengeFor,
  createPkce,
  createState,
  discover,
  exchangeCode,
  fetchUserinfo,
  resetDiscoveryCache,
} from '../lib/oidc.ts'
import {
  createSessionToken,
  readSessionToken,
  safeEqual,
  signToken,
  verifyToken,
} from '../lib/session.ts'

const SECRET = 's'.repeat(40)
const NOW = 1_700_000_000
const USER = { sub: 'u-1', name: 'Max', email: 'max@example.org', groups: ['family', 'authentik Admins'] }

afterEach(() => resetDiscoveryCache())

// ---------------------------------------------------------------- Sessions

test('Session: Rundreise erzeugt dieselben Daten', () => {
  const token = createSessionToken(USER, SECRET, 3600, NOW)
  assert.deepEqual(readSessionToken(token, SECRET, NOW + 10), { ...USER, exp: NOW + 3600 })
})

test('Session: abgelaufene Sitzung wird abgelehnt', () => {
  const token = createSessionToken(USER, SECRET, 3600, NOW)
  assert.equal(readSessionToken(token, SECRET, NOW + 3600), null)
  assert.equal(readSessionToken(token, SECRET, NOW + 99999), null)
})

test('Session: falsches Secret, manipulierter Inhalt und manipulierte Signatur scheitern', () => {
  const token = createSessionToken(USER, SECRET, 3600, NOW)
  assert.equal(readSessionToken(token, 'x'.repeat(40), NOW), null)

  const [body, signature] = token.split('.')

  // Gruppen im Inhalt austauschen (Rechteausweitung) — Signatur passt dann nicht mehr
  const forged = Buffer.from(JSON.stringify({ ...USER, groups: ['root'], exp: NOW + 3600 })).toString('base64url')
  assert.equal(readSessionToken(`${forged}.${signature}`, SECRET, NOW), null)

  const flipped = signature.slice(0, -2) + (signature.endsWith('AA') ? 'BB' : 'AA')
  assert.equal(readSessionToken(`${body}.${flipped}`, SECRET, NOW), null)
})

test('Session: kaputte Eingaben ergeben null und werfen nicht', () => {
  for (const bad of [undefined, null, '', 'abc', 'a.b.c', '.', 'a.', '.b', 'x'.repeat(9000)]) {
    assert.equal(readSessionToken(bad, SECRET, NOW), null)
  }
})

test('Session: ein OIDC-Zwischenstand lässt sich nicht als Sitzung verwenden', () => {
  // gleicher Inhalt, gleiches Secret, aber anderer Zweck
  const oidcToken = signToken(
    'oidc',
    { sub: 'u-1', name: 'Max', email: null, groups: ['authentik Admins'], exp: NOW + 600 },
    SECRET,
  )
  assert.equal(readSessionToken(oidcToken, SECRET, NOW), null)
  assert.notEqual(verifyToken('oidc', oidcToken, SECRET, NOW), null)
})

test('Session: Inhalt mit falschen Typen wird verworfen', () => {
  const sign = (payload) => signToken('session', payload, SECRET)
  const base = { sub: 'u', name: 'n', email: null, groups: [], exp: NOW + 100 }
  assert.notEqual(readSessionToken(sign(base), SECRET, NOW), null)
  assert.equal(readSessionToken(sign({ ...base, sub: '' }), SECRET, NOW), null)
  assert.equal(readSessionToken(sign({ ...base, sub: 5 }), SECRET, NOW), null)
  assert.equal(readSessionToken(sign({ ...base, groups: 'admin' }), SECRET, NOW), null)
  assert.equal(readSessionToken(sign({ ...base, groups: [1] }), SECRET, NOW), null)
  assert.equal(readSessionToken(sign({ ...base, email: 3 }), SECRET, NOW), null)
  assert.equal(readSessionToken(sign({ ...base, exp: 'bald' }), SECRET, NOW), null)
})

test('safeEqual vergleicht Strings unabhängig von der Länge', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
  assert.equal(safeEqual('abc', 'abcd'), false)
  assert.equal(safeEqual('', ''), true)
})

// ---------------------------------------------------------------- Gruppen

test('Gruppen: Dienste ohne Gruppe oder mit * sind für alle sichtbar', () => {
  assert.equal(canSee([], [], []), true)
  assert.equal(canSee(['*'], [], []), true)
  assert.equal(canSee([' * '], ['x'], []), true)
})

test('Gruppen: sonst zählt die Schnittmenge, Groß-/Kleinschreibung egal', () => {
  assert.equal(canSee(['family'], ['Family'], []), true)
  assert.equal(canSee(['family', 'kids'], ['kids'], []), true)
  assert.equal(canSee(['family'], ['friends'], []), false)
  assert.equal(canSee(['family'], [], []), false)
})

test('Gruppen: Admins sehen alles', () => {
  assert.equal(canSee(['geheim'], ['authentik Admins'], ['authentik Admins']), true)
  assert.equal(canSee(['geheim'], ['AUTHENTIK ADMINS'], ['authentik admins']), true)
  assert.equal(canSee(['geheim'], ['family'], ['authentik Admins']), false)
  assert.equal(isAdminUser(['family'], ['authentik Admins']), false)
  assert.equal(isAdminUser(['authentik Admins'], ['authentik Admins']), true)
  assert.equal(isAdminUser([], []), false)
})

test('splitList schneidet Leerraum und leere Einträge weg', () => {
  assert.deepEqual(splitList(' a, b ,,c '), ['a', 'b', 'c'])
  assert.deepEqual(splitList(''), [])
  assert.deepEqual(splitList(undefined), [])
})

// ---------------------------------------------------------------- PKCE

test('PKCE: Testvektor aus RFC 7636, Anhang B', () => {
  assert.equal(
    challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  )
})

test('PKCE: Verifier hat gültige Länge und Zeichen, Challenge passt dazu, Werte sind einmalig', () => {
  const a = createPkce()
  const b = createPkce()
  assert.match(a.verifier, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(a.challenge, challengeFor(a.verifier))
  assert.notEqual(a.verifier, b.verifier)
  assert.notEqual(createState(), createState())
  assert.ok(createState().length >= 32)
})

// ---------------------------------------------------------------- OIDC-Ablauf gegen einen Testanbieter

function startFakeProvider({ groups = ['family'], withGroups = true } = {}) {
  const seen = { challenge: null, tokenBodies: [], userinfoAuth: [] }
  let issuer = ''

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://provider')
    const json = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    }

    if (url.pathname === '/app/.well-known/openid-configuration') {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}authorize`,
        token_endpoint: `${issuer}token`,
        userinfo_endpoint: `${issuer}userinfo`,
      })
    }

    if (url.pathname === '/app/token' && request.method === 'POST') {
      let body = ''
      for await (const chunk of request) body += chunk
      const form = new URLSearchParams(body)
      seen.tokenBodies.push(Object.fromEntries(form))

      const verifierOk = challengeFor(form.get('code_verifier') ?? '') === seen.challenge
      const ok =
        verifierOk &&
        form.get('grant_type') === 'authorization_code' &&
        form.get('code') === 'good-code' &&
        form.get('client_id') === 'my-client' &&
        form.get('client_secret') === 'my-secret' &&
        form.get('redirect_uri') === 'https://dash.example/api/auth/callback'
      if (!ok) return json(400, { error: 'invalid_grant', detail: 'GEHEIM-DETAIL' })
      return json(200, { access_token: 'access-123', token_type: 'Bearer' })
    }

    if (url.pathname === '/app/userinfo') {
      seen.userinfoAuth.push(request.headers.authorization)
      if (request.headers.authorization !== 'Bearer access-123') return json(401, {})
      return json(200, {
        sub: 'user-42',
        preferred_username: 'max',
        email: 'max@example.org',
        ...(withGroups ? { groups: [...groups, 42, null] } : {}),
      })
    }

    json(404, {})
  })

  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      issuer = `http://127.0.0.1:${server.address().port}/app/`
      resolve({ server, seen, issuer })
    }),
  )
}

const clientFor = (issuer) => ({
  issuer,
  clientId: 'my-client',
  clientSecret: 'my-secret',
  redirectUri: 'https://dash.example/api/auth/callback',
})

test('OIDC: kompletter Ablauf — Discovery, Authorize-URL, Token-Austausch mit PKCE, userinfo', async () => {
  const provider = await startFakeProvider({ groups: ['family', 'authentik Admins'] })
  try {
    const endpoints = await discover(provider.issuer)
    assert.equal(endpoints.tokenEndpoint, `${provider.issuer}token`)

    const { verifier, challenge } = createPkce()
    const state = createState()
    const authorize = new URL(buildAuthorizeUrl(endpoints, clientFor(provider.issuer), { state, challenge }))
    assert.equal(authorize.origin + authorize.pathname, `${provider.issuer}authorize`)
    assert.equal(authorize.searchParams.get('response_type'), 'code')
    assert.equal(authorize.searchParams.get('client_id'), 'my-client')
    assert.equal(authorize.searchParams.get('redirect_uri'), 'https://dash.example/api/auth/callback')
    assert.equal(authorize.searchParams.get('scope'), 'openid profile email')
    assert.equal(authorize.searchParams.get('state'), state)
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256')

    // Der Anbieter merkt sich die Challenge aus der Authorize-URL und prüft später den Verifier.
    provider.seen.challenge = authorize.searchParams.get('code_challenge')

    const accessToken = await exchangeCode(endpoints, clientFor(provider.issuer), 'good-code', verifier)
    assert.equal(accessToken, 'access-123')

    const user = await fetchUserinfo(endpoints, accessToken)
    assert.deepEqual(user, {
      sub: 'user-42',
      name: 'max', // Fallback auf preferred_username
      email: 'max@example.org',
      groups: ['family', 'authentik Admins'], // Nicht-Strings wurden verworfen
    })
  } finally {
    provider.server.close()
  }
})

test('OIDC: falscher Verifier wird vom Anbieter abgelehnt, Fehlermeldung verrät nichts', async () => {
  const provider = await startFakeProvider()
  try {
    const endpoints = await discover(provider.issuer)
    const { challenge } = createPkce()
    provider.seen.challenge = challenge

    await assert.rejects(
      exchangeCode(endpoints, clientFor(provider.issuer), 'good-code', 'ein-anderer-verifier'),
      (error) => {
        assert.equal(error.message, 'Token-Austausch fehlgeschlagen (HTTP 400)')
        assert.ok(!error.message.includes('GEHEIM'))
        assert.ok(!error.message.includes('my-secret'))
        return true
      },
    )
  } finally {
    provider.server.close()
  }
})

test('OIDC: userinfo ohne Gruppen ergibt eine leere Gruppenliste', async () => {
  const provider = await startFakeProvider({ withGroups: false })
  try {
    const endpoints = await discover(provider.issuer)
    const user = await fetchUserinfo(endpoints, 'access-123')
    assert.deepEqual(user.groups, [])
  } finally {
    provider.server.close()
  }
})

test('OIDC: userinfo mit ungültigem Token schlägt fehl', async () => {
  const provider = await startFakeProvider()
  try {
    const endpoints = await discover(provider.issuer)
    await assert.rejects(fetchUserinfo(endpoints, 'falsch'), /HTTP 401/)
  } finally {
    provider.server.close()
  }
})

test('OIDC: Discovery prüft den issuer, Pflichtfelder und merkt sich das Ergebnis', async () => {
  const document = {
    issuer: 'https://auth.example/application/o/dash/',
    authorization_endpoint: 'https://auth.example/application/o/authorize/',
    token_endpoint: 'https://auth.example/application/o/token/',
    userinfo_endpoint: 'https://auth.example/application/o/userinfo/',
  }
  let calls = 0
  const fakeFetch = (body, status = 200) => async () => {
    calls += 1
    return new Response(JSON.stringify(body), { status })
  }

  const ok = await discover('https://auth.example/application/o/dash', fakeFetch(document))
  assert.equal(ok.userinfoEndpoint, document.userinfo_endpoint)
  await discover('https://auth.example/application/o/dash/', fakeFetch(document))
  assert.equal(calls, 1, 'zweiter Aufruf kommt aus dem Zwischenspeicher')

  resetDiscoveryCache()
  await assert.rejects(
    discover('https://auth.example/application/o/dash/', fakeFetch({ ...document, issuer: 'https://evil.example/' })),
    /issuer stimmt nicht/,
  )
  await assert.rejects(
    discover('https://auth.example/application/o/dash/', fakeFetch({ ...document, token_endpoint: undefined })),
    /token_endpoint/,
  )
  await assert.rejects(
    discover('https://auth.example/application/o/dash/', fakeFetch({ ...document, token_endpoint: 'ftp://x/' })),
    /http\(s\)/,
  )
  await assert.rejects(discover('https://auth.example/application/o/dash/', fakeFetch({}, 500)), /HTTP 500/)
})

test('OIDC: Token-Antwort ohne access_token oder mit fremdem token_type wird abgelehnt', async () => {
  const endpoints = {
    issuer: 'https://a/',
    authorizationEndpoint: 'https://a/authorize',
    tokenEndpoint: 'https://a/token',
    userinfoEndpoint: 'https://a/userinfo',
  }
  const reply = (body) => async () => new Response(JSON.stringify(body), { status: 200 })
  const client = clientFor('https://a/')

  await assert.rejects(exchangeCode(endpoints, client, 'c', 'v', reply({ token_type: 'Bearer' })), /access_token/)
  await assert.rejects(
    exchangeCode(endpoints, client, 'c', 'v', reply({ access_token: 'x', token_type: 'mac' })),
    /token_type/,
  )
  assert.equal(await exchangeCode(endpoints, client, 'c', 'v', reply({ access_token: 'x', token_type: 'bearer' })), 'x')
})

// ---------------------------------------------------------------- Konfiguration

const OIDC_ENV = {
  OIDC_ISSUER: 'https://auth.home.arpa/application/o/nas-dashboard/',
  PUBLIC_URL: 'https://dashboard.home.arpa',
  OIDC_CLIENT_ID: 'client',
  OIDC_CLIENT_SECRET: 'client-secret-wert',
  SESSION_SECRET: 'a'.repeat(32),
}
const AGENT_ENV = { AGENT_SOCKET: '/run/agent/agent.sock', AGENT_TOKEN: 'b'.repeat(24) }

test('Konfiguration: ohne OIDC_ISSUER gilt Basic-Auth und nichts weiter ist nötig', () => {
  assert.equal(authModeFromEnv({}), 'basic')
  assert.equal(authModeFromEnv({ OIDC_ISSUER: '   ' }), 'basic')

  const { config, problems, warnings } = readConfig({})
  assert.deepEqual(problems, [])
  assert.deepEqual(warnings, [])
  assert.equal(config.authMode, 'basic')
  assert.equal(config.oidc, null)
  assert.equal(config.sessionSecret, null)
  assert.equal(config.agent, null)
  assert.equal(config.secureCookies, false)
  assert.equal(config.extraServicesFile, '/config/services.json')
})

test('Konfiguration: vollständige OIDC-Umgebung ergibt eine gültige Config', () => {
  assert.equal(authModeFromEnv(OIDC_ENV), 'oidc')
  const { config, problems } = readConfig({ ...OIDC_ENV, ...AGENT_ENV })
  assert.deepEqual(problems, [])
  assert.equal(config.authMode, 'oidc')
  assert.equal(config.publicUrl, 'https://dashboard.home.arpa')
  assert.equal(config.secureCookies, true)
  assert.deepEqual(config.adminGroups, ['authentik Admins'])
  assert.deepEqual(config.agent, { socketPath: '/run/agent/agent.sock', token: 'b'.repeat(24) })
})

test('Konfiguration: PUBLIC_URL wird auf die Origin gekürzt, http ergibt keine Secure-Cookies', () => {
  const { config } = readConfig({ ...OIDC_ENV, PUBLIC_URL: 'http://192.168.178.75:3000/irgendein/pfad/' })
  assert.equal(config.publicUrl, 'http://192.168.178.75:3000')
  assert.equal(config.secureCookies, false)
})

test('Konfiguration: OIDC mit fehlenden Angaben sperrt alles (fail closed) und nennt, was fehlt', () => {
  const { config, problems } = readConfig({ OIDC_ISSUER: 'https://auth.home.arpa/application/o/x/' })
  assert.equal(config, null)
  assert.ok(problems.some((p) => p.startsWith('PUBLIC_URL')))
  assert.ok(problems.some((p) => p.startsWith('OIDC_CLIENT_ID')))
  assert.ok(problems.some((p) => p.startsWith('OIDC_CLIENT_SECRET')))
  assert.ok(problems.some((p) => p.startsWith('SESSION_SECRET')))
})

test('Konfiguration: zu kurzes SESSION_SECRET wird abgelehnt, ohne den Wert zu nennen', () => {
  const { config, problems } = readConfig({ ...OIDC_ENV, SESSION_SECRET: 'zu-kurz-und-geheim' })
  assert.equal(config, null)
  assert.match(problems.join(' | '), /SESSION_SECRET/)
  assert.ok(!problems.join(' | ').includes('geheim'))
})

test('Konfiguration: ungültige Adressen werden abgelehnt', () => {
  assert.equal(readConfig({ ...OIDC_ENV, PUBLIC_URL: 'javascript:alert(1)' }).config, null)
  assert.equal(readConfig({ ...OIDC_ENV, OIDC_ISSUER: 'kein url' }).config, null)
})

test('Konfiguration: Agent-Fehler sind nur Warnungen, die Anmeldung bleibt davon unberührt', () => {
  const tooShort = readConfig({ AGENT_SOCKET: '/run/agent/agent.sock', AGENT_TOKEN: 'geheim-aber-kurz' })
  assert.notEqual(tooShort.config, null)
  assert.equal(tooShort.config.agent, null)
  assert.match(tooShort.warnings.join(' | '), /AGENT_TOKEN/)
  assert.ok(!tooShort.warnings.join(' | ').includes('geheim'))

  const relative = readConfig({ AGENT_SOCKET: 'run/agent.sock', AGENT_TOKEN: 'b'.repeat(24) })
  assert.equal(relative.config.agent, null)
  assert.match(relative.warnings.join(' | '), /absoluter Pfad/)

  // Ein Token allein ohne Socket schaltet nichts ein.
  assert.equal(readConfig({ AGENT_TOKEN: 'b'.repeat(24) }).config.agent, null)
})

test('Konfiguration: Admin-Gruppen lassen sich einstellen', () => {
  const custom = readConfig({ ...OIDC_ENV, ADMIN_GROUPS: 'admins, eltern ,' })
  assert.deepEqual(custom.config.adminGroups, ['admins', 'eltern'])
})
