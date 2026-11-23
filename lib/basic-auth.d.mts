export type AuthResult = { allowed: boolean; status: number; reason: string }
export function checkBasicAuth(header: string | null, env?: Record<string, string | undefined>, nodeEnv?: string): AuthResult
