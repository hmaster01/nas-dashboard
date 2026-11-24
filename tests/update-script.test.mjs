import assert from 'node:assert/strict'
import { chmod, copyFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const script = new URL('../scripts/update.sh', import.meta.url).pathname

/** Legt ein falsches `docker` an, das je nach Szenario antwortet, und führt update.sh damit aus. */
async function run({ agentId, health }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'update-test-'))
  const bin = path.join(dir, 'bin')
  await mkdir(bin)
  // Kopie in einem Ordner ohne .git, damit das Skript kein echtes `git pull` ausführt.
  await mkdir(path.join(dir, 'scripts'))
  const copy = path.join(dir, 'scripts', 'update.sh')
  await copyFile(script, copy)
  const fake = `#!/bin/sh
case "$1 $2" in
  "compose ps")
    if [ "$3" = "-q" ]; then echo "${agentId}"; else echo "NAME STATUS"; fi ;;
  "inspect -f") echo "${health}" ;;
  "compose logs") echo "agent: AGENT_TOKEN zu kurz" ;;
  *) : ;;
esac
exit 0
`
  await writeFile(path.join(bin, 'docker'), fake)
  await chmod(path.join(bin, 'docker'), 0o755)
  return spawnSync('sh', [copy], {
    env: { PATH: `${bin}:/usr/bin:/bin`, AGENT_WAIT_TRIES: '2', AGENT_WAIT_SLEEP: '0' },
    encoding: 'utf8',
  })
}

test('update.sh: ohne Agent kein Test und Erfolg', async () => {
  const result = await run({ agentId: '', health: '' })
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /Agent/)
})

test('update.sh: gesunder Agent -> Erfolg', async () => {
  const result = await run({ agentId: 'abc123', health: 'healthy' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Agent: ok/)
})

test('update.sh: Agent bleibt ungesund -> Abbruch mit Meldung und Log', async () => {
  const result = await run({ agentId: 'abc123', health: 'unhealthy' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /FEHLER: Der Agent ist nicht erreichbar \(Zustand: unhealthy\)/)
  assert.match(result.stderr, /AGENT_TOKEN zu kurz/)
})
