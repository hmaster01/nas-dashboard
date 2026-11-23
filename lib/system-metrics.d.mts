export type TrafficCounter = { rxBytes: number; rxPackets: number; txBytes: number; txPackets: number }
export type TrafficSnapshot = {
  counters: Record<string, Partial<TrafficCounter>> | null
  trafficCountersSupported: boolean
  source: 'procfs' | 'sysfs' | 'procfs+sysfs' | 'os-only'
}
export function parseProcNetDev(raw: string): Record<string, TrafficCounter>
export function collectLinuxTrafficCounters(
  readFileFn: (path: string, encoding: string) => Promise<string>,
  readdirFn: (path: string) => Promise<string[]>,
  procPath?: string,
  sysClassNetPath?: string,
): Promise<TrafficSnapshot>
export function createSystemSnapshot(osInfo: {
  platform(): string
  release(): string
  arch(): string
  uptime(): number
  loadavg(): number[]
  totalmem(): number
  freemem(): number
  networkInterfaces(): Record<string, unknown>
}, traffic?: TrafficSnapshot, timestamp?: number): Record<string, unknown>
