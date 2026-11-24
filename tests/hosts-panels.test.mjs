import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isHostAllowed, parseAllowedHosts } from '../lib/hosts.ts'
import { ALL_PANELS, parsePanels } from '../lib/panels.ts'
import { METRIC_IDS } from '../lib/metrics-view.ts'

const allow = (value) => parseAllowedHosts(value).hosts

test('Hosts: ohne ALLOWED_HOSTS wird nichts geprüft', () => {
  assert.equal(isHostAllowed('irgendwas.example', allow(undefined)), true)
  assert.equal(isHostAllowed(null, allow('')), true)
})

test('Hosts: nur eingetragene Namen kommen durch, Groß-/Kleinschreibung egal', () => {
  const hosts = allow('dashboard.home.arpa, 192.168.178.75:3000')
  assert.equal(isHostAllowed('dashboard.home.arpa', hosts), true)
  assert.equal(isHostAllowed('Dashboard.Home.Arpa:443', hosts), true)
  assert.equal(isHostAllowed('192.168.178.75:3000', hosts), true)
  assert.equal(isHostAllowed('192.168.178.75:8080', hosts), false)
  assert.equal(isHostAllowed('evil.example', hosts), false)
  assert.equal(isHostAllowed('dashboard.home.arpa.evil.example', hosts), false)
  assert.equal(isHostAllowed('evildashboard.home.arpa', hosts), false)
})

test('Hosts: fehlender oder merkwürdiger Host-Header wird abgelehnt, Loopback geht immer', () => {
  const hosts = allow('dashboard.home.arpa')
  assert.equal(isHostAllowed(null, hosts), false)
  assert.equal(isHostAllowed('', hosts), false)
  assert.equal(isHostAllowed('dashboard.home.arpa/evil', hosts), false)
  assert.equal(isHostAllowed('dashboard.home.arpa@evil.example', hosts), false)
  assert.equal(isHostAllowed('a:b:c', hosts), false)
  assert.equal(isHostAllowed('x'.repeat(300), hosts), false)
  assert.equal(isHostAllowed('localhost:3000', hosts), true)
  assert.equal(isHostAllowed('127.0.0.1:3000', hosts), true)
  assert.equal(isHostAllowed('[::1]:3000', hosts), true)
})

test('Hosts: IPv6-Einträge mit und ohne Port', () => {
  const hosts = allow('[fd00::1], [fd00::2]:3000')
  assert.equal(isHostAllowed('[fd00::1]:8080', hosts), true)
  assert.equal(isHostAllowed('[fd00::2]:3000', hosts), true)
  assert.equal(isHostAllowed('[fd00::2]:3001', hosts), false)
})

test('Hosts: ist ALLOWED_HOSTS gesetzt, aber komplett ungültig, wird nicht alles erlaubt', () => {
  const { hosts, invalid } = parseAllowedHosts('https://dashboard.home.arpa/')
  assert.deepEqual(invalid, ['https://dashboard.home.arpa/'])
  assert.equal(isHostAllowed('dashboard.home.arpa', hosts), false)
  assert.equal(isHostAllowed('evil.example', hosts), false)
  assert.equal(isHostAllowed('localhost:3000', hosts), true)
})

test('Hosts: ungültige Einträge werden gemeldet, gültige bleiben', () => {
  const { hosts, invalid } = parseAllowedHosts('ok.home.arpa, *.home.arpa')
  assert.deepEqual(invalid, ['*.home.arpa'])
  assert.equal(isHostAllowed('ok.home.arpa', hosts), true)
  assert.equal(isHostAllowed('x.home.arpa', hosts), false)
})

test('Panels: ohne Angabe alle vier, Reihenfolge und Aliase', () => {
  assert.deepEqual(parsePanels(undefined).panels, ALL_PANELS)
  assert.deepEqual(parsePanels('').panels, ALL_PANELS)
  assert.deepEqual(parsePanels('ram, CPU, disk, ram').panels, ['ram', 'cpu', 'storage'])
  assert.deepEqual(parsePanels('net').panels, ['network'])
})

test('Panels: unbekannte Namen werden gemeldet; nur Unbekanntes ergibt alle vier', () => {
  assert.deepEqual(parsePanels('cpu,gpu').unknown, ['gpu'])
  assert.deepEqual(parsePanels('cpu,gpu').panels, ['cpu'])
  const none = parsePanels('gpu')
  assert.deepEqual(none.panels, ALL_PANELS)
  assert.deepEqual(none.unknown, ['gpu'])
})

test('Panels: die Liste der Kacheln stimmt mit lib/metrics-view.ts überein', () => {
  assert.deepEqual([...ALL_PANELS].sort(), [...METRIC_IDS].sort())
})
