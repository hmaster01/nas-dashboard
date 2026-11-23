export type NetworkBytes = { rx: number; tx: number }
export function getSystemMetricsPlatformResponse(platform: string): { status: number; body: { error: string; platform: string } } | null
export function parseNetworkBytes(raw: string): NetworkBytes
export function networkRateMbit(current: NetworkBytes, previous: NetworkBytes | null, elapsedSeconds: number): { downMbit: number; upMbit: number }
