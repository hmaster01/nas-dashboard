import assert from 'node:assert/strict'
import { test } from 'node:test'
const {
  getSystemMetricsPlatformResponse,
  networkRateMbit,
  parseNetworkBytes,
} = await import('../lib/system-metrics.mjs')

test('non-Linux platforms return an explicit 501 platform response', () => {
  assert.equal(getSystemMetricsPlatformResponse('linux'), null)
  assert.deepEqual(getSystemMetricsPlatformResponse('win32'), {
    status: 501,
    body: {
      error: 'System metrics are only available on Linux.',
      platform: 'win32',
    },
  })
  assert.equal(getSystemMetricsPlatformResponse('darwin').status, 501)
})

test('parseNetworkBytes sums interfaces and ignores loopback', () => {
  const sample = [
    'Inter-| Receive | Transmit',
    ' face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed',
    '    lo: 999 0 0 0 0 0 0 0 888 0 0 0 0 0 0 0',
    '  eth0: 100 1 0 0 0 0 0 0 200 1 0 0 0 0 0 0',
    ' wlan0: 300 1 0 0 0 0 0 0 400 1 0 0 0 0 0 0',
  ].join('\n')

  assert.deepEqual(parseNetworkBytes(sample), { rx: 400, tx: 600 })
})

test('parseNetworkBytes accepts CRLF and skips malformed rows', () => {
  const sample = [
    'header',
    'header',
    ' malformed row',
    ' eth0: 20 0 0 0 0 0 0 0 40 0 0 0 0 0 0 0',
  ].join('\r\n')

  assert.deepEqual(parseNetworkBytes(sample), { rx: 20, tx: 40 })
})

test('networkRateMbit returns zero until a previous sample exists', () => {
  assert.deepEqual(networkRateMbit({ rx: 10, tx: 20 }, null, 1), { downMbit: 0, upMbit: 0 })
  assert.deepEqual(networkRateMbit({ rx: 10, tx: 20 }, { rx: 0, tx: 0 }, 0), { downMbit: 0, upMbit: 0 })
})

test('networkRateMbit calculates rates and clamps counter resets', () => {
  assert.deepEqual(
    networkRateMbit({ rx: 125_000, tx: 250_000 }, { rx: 0, tx: 0 }, 1),
    { downMbit: 1, upMbit: 2 },
  )
  assert.deepEqual(
    networkRateMbit({ rx: 5, tx: 10 }, { rx: 100, tx: 200 }, 1),
    { downMbit: 0, upMbit: 0 },
  )
})
