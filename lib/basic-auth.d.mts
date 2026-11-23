export type AuthResult = { allowed: boolean; status: number; reason: string }
export type LoginRateLimiter = {
  isLimited(key: string): boolean
  recordFailure(key: string): void
  reset(key: string): void
}
export function createLoginRateLimiter(options?: { limit?: number; windowMs?: number; now?: () => number }): LoginRateLimiter
export function checkBasicAuth(header: string | null, env?: Record<string, string | undefined>, nodeEnv?: string): AuthResult
