import { createHash, timingSafeEqual } from 'node:crypto'

function constantTimeEqual(actual, expected) {
  return timingSafeEqual(
    createHash('sha256').update(actual).digest(),
    createHash('sha256').update(expected).digest(),
  )
}

export function checkBasicAuth(header, env = process.env, nodeEnv = process.env.NODE_ENV) {
  const username = env.DASHBOARD_USERNAME
  const password = env.DASHBOARD_PASSWORD

  if (!username || !password) {
    return nodeEnv === 'production'
      ? { allowed: false, status: 503, reason: 'credentials-not-configured' }
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
