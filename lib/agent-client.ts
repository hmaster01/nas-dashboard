import http from 'node:http'
import type { AppConfig } from '@/lib/config'

const TIMEOUT_MS = 4000
const MAX_BYTES = 2 * 1024 * 1024

type Agent = NonNullable<AppConfig['agent']>

/**
 * Fragt den Agent über seinen Unix-Socket ab (kein offener Netzwerkport).
 * Wirft bei Fehlern — Meldungen enthalten nie das Token.
 */
export function agentGet<T>(agent: Agent, path: '/metrics' | '/discovery'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = http.request(
      {
        socketPath: agent.socketPath,
        path,
        method: 'GET',
        headers: { Authorization: `Bearer ${agent.token}`, Accept: 'application/json', Host: 'agent' },
        timeout: TIMEOUT_MS,
      },
      (response) => {
        const chunks: Buffer[] = []
        let size = 0

        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BYTES) {
            request.destroy(new Error('Agent-Antwort zu groß'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`Agent antwortet mit HTTP ${response.statusCode}`))
            return
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T)
          } catch {
            reject(new Error('Agent-Antwort ist kein gültiges JSON'))
          }
        })
        response.on('error', reject)
      },
    )

    request.on('timeout', () => request.destroy(new Error('Agent: Zeitüberschreitung')))
    request.on('error', reject)
    request.end()
  })
}
