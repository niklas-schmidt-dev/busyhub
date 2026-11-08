import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { compareVersions } from './version.ts'

test('versions compare by number, not as text', () => {
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1)
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.equal(compareVersions('0.2.0', '0.2.1'), -1)
  assert.equal(compareVersions('2.0.0', '10.0.0'), -1)
})

test('pre-release tags and missing parts do not break the comparison', () => {
  assert.equal(compareVersions('0.2.0-rc.1', '0.2.0'), 0)
  assert.equal(compareVersions('1', '1.0.0'), 0)
})
