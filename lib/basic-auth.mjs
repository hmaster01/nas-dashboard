import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// Zufälliges Salz pro Prozessstart. Die Werte werden mit einem speicherschweren KDF abgeleitet,
// sodass sie für einen konstantzeitigen Vergleich auf die gleiche Länge gebracht werden.
const compareSalt = randomBytes(16)

function constantTimeEqual(actual, expected) {
  return timingSafeEqual(
    scryptSync(actual, compareSalt, 32),
    scryptSync(expected, compareSalt, 32),
  )
}

export function createLoginRateLimiter({ limit = 10, windowMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
  const failures = new Map()
  return {
    isLimited(key) {
      const entry = failures.get(key)
      if (!entry || entry.resetAt <= now()) {
        failures.delete(key)
        return false
      }
      return entry.count >= limit
    },
    recordFailure(key) {
      const timestamp = now()
      const entry = failures.get(key)
      if (!entry || entry.resetAt <= timestamp) failures.set(key, { count: 1, resetAt: timestamp + windowMs })
      else entry.count += 1
    },
    reset(key) {
      failures.delete(key)
    },
  }
}

export function checkBasicAuth(header, env = process.env, nodeEnv = process.env.NODE_ENV) {
  const username = env.DASHBOARD_USERNAME
  const password = env.DASHBOARD_PASSWORD

  if (!username || !password || password.length < 24) {
    return nodeEnv === 'production'
      ? { allowed: false, status: 503, reason: 'credentials-not-configured-or-weak' }
      : { allowed: true, status: 200, reason: 'development-no-credentials' }
  }

  if (typeof header !== 'string' || !header.startsWith('Basic ') || header.length > 2048) {
    return { allowed: false, status: 401, reason: 'credentials-required' }
  }

  let decoded
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  } catch {
    return { allowed: false, status: 401, reason: 'invalid-credentials' }
  }

  const separator = decoded.indexOf(':')
  if (separator < 1) return { allowed: false, status: 401, reason: 'invalid-credentials' }

  const validUser = constantTimeEqual(decoded.slice(0, separator), username)
  const validPassword = constantTimeEqual(decoded.slice(separator + 1), password)
  return validUser && validPassword
    ? { allowed: true, status: 200, reason: 'authenticated' }
    : { allowed: false, status: 401, reason: 'invalid-credentials' }
}
