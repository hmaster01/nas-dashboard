import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectLinuxTrafficCounters, createSystemSnapshot, parseProcNetDev } from '../lib/system-metrics.mjs'

const procSample = [
  'Inter-| Receive | Transmit',
  ' face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed',
  '    lo: 999 9 0 0 0 0 0 0 888 8 0 0 0 0 0 0',
  '  eth0: 100 1 0 0 0 0 0 0 200 2 0 0 0 0 0 0',
  ' enp3s0: 300 3 0 0 0 0 0 0 400 4 0 0 0 0 0 0',
].join('\n')

test('parseProcNetDev returns interface byte and packet counters including loopback', () => {
  assert.deepEqual(parseProcNetDev(procSample), {
    lo: { rxBytes: 999, rxPackets: 9, txBytes: 888, txPackets: 8 },
    eth0: { rxBytes: 100, rxPackets: 1, txBytes: 200, txPackets: 2 },
    enp3s0: { rxBytes: 300, rxPackets: 3, txBytes: 400, txPackets: 4 },
  })
})

test('parseProcNetDev handles CRLF and skips invalid rows', () => {
  assert.deepEqual(parseProcNetDev(['header', 'header', 'bad row', 'eth0: 2 1 0 0 0 0 0 0 4 3 0 0 0 0 0 0'].join('\r\n')), {
    eth0: { rxBytes: 2, rxPackets: 1, txBytes: 4, txPackets: 3 },
  })
})

test('Linux collector prefers procfs and reports interface counters', async () => {
  const result = await collectLinuxTrafficCounters(async () => procSample, async () => ['eth0', 'enp3s0'])
  assert.equal(result.source, 'procfs')
  assert.equal(result.trafficCountersSupported, true)
  assert.deepEqual(result.counters.eth0, { rxBytes: 100, rxPackets: 1, txBytes: 200, txPackets: 2 })
})

test('Linux collector fills missing or masked procfs counters from sysfs', async () => {
  const result = await collectLinuxTrafficCounters(
    async (path) => {
      if (path === '/proc/net/dev') throw new Error('masked procfs')
      return ({
        '/sys/class/net/eth0/statistics/rx_bytes': '11',
        '/sys/class/net/eth0/statistics/rx_packets': '2',
        '/sys/class/net/eth0/statistics/tx_bytes': '33',
        '/sys/class/net/eth0/statistics/tx_packets': '4',
      })[path]
    },
    async () => ['eth0'],
  )
  assert.equal(result.source, 'sysfs')
  assert.equal(result.trafficCountersSupported, true)
  assert.deepEqual(result.counters.eth0, { rxBytes: 11, rxPackets: 2, txBytes: 33, txPackets: 4 })
})

test('collector gracefully reports unsupported counters when procfs and sysfs are unavailable', async () => {
  const result = await collectLinuxTrafficCounters(async () => { throw new Error('unavailable') }, async () => { throw new Error('unavailable') })
  assert.deepEqual(result, { counters: null, trafficCountersSupported: false, source: 'os-only' })
})

test('OS snapshot preserves portable telemetry and explicit counter capability', () => {
  const fakeOs = {
    platform: () => 'win32', release: () => 'release', arch: () => 'x64', uptime: () => 123,
    loadavg: () => [0, 0, 0], totalmem: () => 1000, freemem: () => 400,
    networkInterfaces: () => ({ Ethernet: [{ address: '10.0.0.2', family: 'IPv4', internal: false, mac: 'aa' }] }),
  }
  const snapshot = createSystemSnapshot(fakeOs, { counters: null, trafficCountersSupported: false, source: 'os-only' }, 42)
  assert.equal(snapshot.platform, 'win32')
  assert.equal(snapshot.uptimeSec, 123)
  assert.deepEqual(snapshot.loadAvg, [0, 0, 0])
  assert.equal(snapshot.memory.freeBytes, 400)
  assert.equal(snapshot.interfaces.Ethernet[0].internal, false)
  assert.equal(snapshot.trafficCountersSupported, false)
  assert.equal(snapshot.counters, null)
  assert.equal(snapshot.timestamp, 42)
})
