import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { appOrigin } from './apps.ts'

test('apps are grouped by who made them', () => {
  assert.equal(appOrigin({ id: 'app.busy.clock', official: false, source: 'bar' }), 'busy')
  assert.equal(appOrigin({ id: 'busyhub.bounce', official: true, source: 'catalog' }), 'busyhub')
  assert.equal(appOrigin({ id: 'busyhub.bounce', official: true, source: 'package' }), 'busyhub')
  assert.equal(appOrigin({ id: 'my.thing', official: false, source: 'bar' }), 'own')
  assert.equal(appOrigin({ id: 'my.thing', official: false, source: 'project' }), 'own')
})

test('a local copy of a BUSY app is the user’s own, not BUSY’s', () => {
  assert.equal(appOrigin({ id: 'app.busy.js_example', official: false, source: 'project' }), 'own')
  assert.equal(appOrigin({ id: 'app.busybody.x', official: false, source: 'bar' }), 'own')
})
