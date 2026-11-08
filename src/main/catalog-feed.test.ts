import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { compatibleApps, packageUrl, parseCatalog, type CatalogApp } from './catalog-feed.ts'

const app = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id.toUpperCase(),
  version: '1.0.0',
  modes: ['device', 'host'],
  package: { path: `packages/${id}-1.0.0.tgz`, sha256: 'a'.repeat(64), size: 1234 },
  ...extra,
})

test('a valid catalog parses with defaults filled in', () => {
  const { feed, skipped } = parseCatalog({ format: 1, generatedAt: '2026-11-08T12:00:00Z', commit: 'abc', apps: [app('busyhub.one')] })
  assert.deepEqual(skipped, [])
  assert.equal(feed.apps[0]?.category, 'Apps')
  assert.equal(feed.apps[0]?.minHubVersion, '0.2.0')
  assert.equal(feed.apps[0]?.icon, null)
})

test('broken entries are skipped one by one, never the whole catalog', () => {
  const { feed, skipped } = parseCatalog({
    format: 1,
    apps: [
      app('busyhub.ok'),
      app('busyhub.bad-sha', { package: { path: 'packages/x.tgz', sha256: 'nope', size: 1 } }),
      app('busyhub.escape', { package: { path: '../../etc/passwd.tgz', sha256: 'a'.repeat(64), size: 1 } }),
      app('busyhub.huge', { package: { path: 'packages/h.tgz', sha256: 'a'.repeat(64), size: 500 * 1024 * 1024 } }),
      app('busyhub.ok'),
      { id: '../nope' },
    ],
  })
  assert.deepEqual(feed.apps.map((a) => a.id), ['busyhub.ok'])
  assert.equal(skipped.length, 5)
})

test('an unknown catalog format asks for an update instead of guessing', () => {
  assert.throws(() => parseCatalog({ format: 2, apps: [] }), /update BusyHub/)
})

test('apps that need a newer BusyHub are held back', () => {
  const { feed } = parseCatalog({ format: 1, apps: [app('busyhub.old'), app('busyhub.new', { minHubVersion: '0.9.0' })] })
  assert.deepEqual(compatibleApps(feed, '0.2.0').map((a) => a.id), ['busyhub.old'])
  assert.equal(compatibleApps(feed, '0.9.0').length, 2)
})

test('packages download only from the catalog host, over HTTPS', () => {
  const entry = parseCatalog({ format: 1, apps: [app('busyhub.one')] }).feed.apps[0] as CatalogApp
  assert.equal(packageUrl('https://example.github.io/busyhub/catalog.json', entry).href, 'https://example.github.io/busyhub/packages/busyhub.one-1.0.0.tgz')
  assert.equal(packageUrl('http://localhost:4173/catalog.json', entry).protocol, 'http:')
  assert.throws(() => packageUrl('http://example.com/catalog.json', entry), /HTTPS/)
})
