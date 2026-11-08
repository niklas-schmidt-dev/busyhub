import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseCatalog } from './catalog-feed.ts'
import { parseHub, parseManifest, scan, withBarApps, withCatalog } from './catalog.ts'

const manifest = (id: string) => ({ format_version: 1, id, name: id.toUpperCase(), version: '0.1.0', api_version: '27.12.0' })

function write(path: string, data: unknown) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data))
}

test('manifests are checked the way the firmware checks them', () => {
  assert.equal(parseManifest(manifest('busyhub.bounce')).id, 'busyhub.bounce')
  assert.throws(() => parseManifest({ ...manifest('.hidden') }), /valid app id/)
  assert.throws(() => parseManifest({ ...manifest('a/b') }), /valid app id/)
  assert.throws(() => parseManifest({ ...manifest('ok'), version: '1' }), /x\.y\.z/)
})

test('hub.json falls back to sane defaults', () => {
  const hub = parseHub({ modes: ['host', 'nonsense', 'host'], accent: 'red' }, 'x', ['device', 'host'])
  assert.deepEqual(hub.modes, ['host'])
  assert.match(hub.accent, /^#[0-9A-F]{6}$/)
  assert.deepEqual(parseHub(undefined, 'x', ['device']).modes, ['device'])
})

test('scan finds official projects and packages, linked folders and folders of apps', () => {
  const root = mkdtempSync(join(tmpdir(), 'busyhub-scan-'))
  try {
    const official = join(root, 'official')
    // A source project (development) and a prebuilt package (release) side by side.
    write(join(official, 'one', 'src', 'appmeta', 'manifest.json'), manifest('one'))
    write(join(official, 'one', 'hub.json'), { category: 'Fun', modes: ['device'] })
    write(join(official, 'two', 'package.tgz'), 'tgz')
    write(join(official, 'two', 'two', 'appmeta', 'manifest.json'), manifest('two'))
    // A linked folder that is an app itself.
    const linked = join(root, 'my-app')
    write(join(linked, 'appmeta', 'manifest.json'), manifest('mine'))
    // A folder of apps, with one broken app, one non-app and a copy of an official id.
    const folder = join(root, 'apps')
    write(join(folder, 'three', 'src', 'appmeta', 'manifest.json'), manifest('three'))
    write(join(folder, 'broken', 'appmeta', 'manifest.json'), { id: 'broken' })
    mkdirSync(join(folder, 'not-an-app'), { recursive: true })
    write(join(folder, 'copy', 'appmeta', 'manifest.json'), manifest('one'))

    const result = scan({ official: [official], local: [linked, folder, join(root, 'missing')] })
    const byId = new Map(result.apps.map((app) => [app.id, app]))
    assert.deepEqual([...byId.keys()].sort(), ['mine', 'one', 'three', 'two'])
    assert.equal(byId.get('one')?.official, true)
    assert.equal(byId.get('one')?.source, 'project')
    assert.equal(byId.get('one')?.hub.category, 'Fun')
    assert.equal(byId.get('two')?.source, 'package')
    assert.equal(byId.get('mine')?.official, false)
    assert.deepEqual(result.problems.map((p) => p.path.split('/').at(-1)).sort(), ['broken', 'copy'])
    assert.match(result.problems.find((p) => p.path.endsWith('copy'))?.error ?? '', /already used/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a source project shadows the downloaded copy of the same official app without a warning', () => {
  const root = mkdtempSync(join(tmpdir(), 'busyhub-shadow-'))
  try {
    write(join(root, 'repo', 'one', 'src', 'appmeta', 'manifest.json'), manifest('one'))
    write(join(root, 'downloads', 'one', 'package.tgz'), 'tgz')
    write(join(root, 'downloads', 'one', 'one', 'appmeta', 'manifest.json'), manifest('one'))
    const result = scan({ official: [join(root, 'repo'), join(root, 'downloads')], local: [] })
    assert.equal(result.apps.length, 1)
    assert.equal(result.apps[0]?.source, 'project')
    assert.deepEqual(result.problems, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the catalog adds listed apps and tells downloaded ones the latest version', () => {
  const pkg = (id: string, version: string) => ({ path: `packages/${id}-${version}.tgz`, sha256: 'a'.repeat(64), size: 10 })
  const { feed } = parseCatalog({
    format: 1,
    apps: [
      { id: 'one', name: 'One', version: '1.1.0', modes: ['host'], package: pkg('one', '1.1.0') },
      { id: 'two', name: 'Two', version: '2.0.0', modes: ['device'], category: 'Fun', package: pkg('two', '2.0.0') },
    ],
  })
  const downloaded = { ...baseEntry('one'), source: 'package' as const, official: true, version: '1.0.0' }
  const gone = { ...baseEntry('old'), source: 'package' as const, official: true }
  const mine = baseEntry('mine')
  const merged = withCatalog([downloaded, gone, mine], feed.apps)
  const byId = new Map(merged.map((a) => [a.id, a]))
  assert.deepEqual(byId.get('one')?.catalog, { latest: '1.1.0' })
  assert.deepEqual(byId.get('old')?.catalog, { latest: null })
  assert.equal(byId.get('mine')?.catalog, null)
  assert.equal(byId.get('two')?.source, 'catalog')
  assert.equal(byId.get('two')?.official, true)
  assert.equal(byId.get('two')?.hub.category, 'Fun')
})

test('apps that only live on the bar join the catalog as launch-only entries', () => {
  const merged = withBarApps([baseEntry('mine')], [
    { id: 'mine', name: 'Mine', version: '0.2.0', author: '', description: '' },
    { id: 'clock', name: 'Clock', version: '1.0.0', author: 'BUSY', description: '' },
  ])
  assert.equal(merged.find((a) => a.id === 'mine')?.onBar?.version, '0.2.0')
  const clock = merged.find((a) => a.id === 'clock')
  assert.equal(clock?.source, 'bar')
  assert.equal(clock?.official, false)
  assert.deepEqual(clock?.hub.modes, ['device'])
})

function baseEntry(id: string) {
  return {
    id,
    name: id,
    version: '0.1.0',
    description: '',
    author: '',
    source: 'project' as const,
    official: false,
    catalog: null,
    dir: `/apps/${id}`,
    hub: parseHub(undefined, id, ['device', 'host']),
    settings: null,
    icon: null,
    onBar: null,
  }
}
