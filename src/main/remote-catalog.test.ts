import { strict as assert } from 'node:assert'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { RemoteCatalog } from './remote-catalog.ts'

const feed = (generatedAt: string, version: string, sha: string) => ({
  format: 1,
  generatedAt,
  apps: [
    {
      id: 'busyhub.one',
      name: 'One',
      version,
      modes: ['device'],
      package: { path: `packages/busyhub.one-${version}.tgz`, sha256: sha.repeat(64), size: 10 },
    },
  ],
})

function write(path: string, data: unknown) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(data))
}

test('a failed update never falls back to an older or equal bundled version', async () => {
  const root = mkdtempSync(join(tmpdir(), 'busyhub-remote-'))
  try {
    // The saved catalog lists 0.1.3; the release shipped 0.1.0; nothing answers at the catalog's address.
    write(join(root, 'cache', 'catalog.json'), feed('2026-11-09T00:00:00Z', '0.1.3', 'b'))
    write(join(root, 'bundle', 'catalog.json'), feed('2026-11-01T00:00:00Z', '0.1.0', 'a'))
    const catalog = new RemoteCatalog({
      url: 'http://127.0.0.1:9/catalog.json',
      cacheDir: join(root, 'cache'),
      bundledDir: join(root, 'bundle'),
      hubVersion: '0.2.0',
      log: () => {},
    })
    assert.equal(catalog.apps()[0]?.version, '0.1.3')
    await assert.rejects(catalog.download('busyhub.one', '0.1.2'), /Could not download One/)
    await assert.rejects(catalog.download('busyhub.one', '0.1.0'), /Could not download One/)
    await assert.rejects(catalog.download('busyhub.nope'), /not in the catalog/)
    assert.equal(existsSync(join(catalog.packagesDir, 'busyhub.one')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
