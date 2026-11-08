import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { teamIdentifier, updateMode } from './update-mode.ts'

const none = { teamId: null, appImage: false, packaged: false }

test('only installs that can replace themselves update automatically', () => {
  assert.equal(updateMode('win32', none), 'auto')
  assert.equal(updateMode('darwin', { ...none, teamId: 'ABCDE12345' }), 'auto')
  assert.equal(updateMode('darwin', none), 'manual')
  assert.equal(updateMode('linux', { ...none, appImage: true }), 'auto')
  assert.equal(updateMode('linux', { ...none, packaged: true }), 'auto')
  assert.equal(updateMode('linux', none), 'manual')
})

test('the Team ID comes from codesign, and an ad-hoc signature has none', () => {
  const signed = 'Executable=/Applications/BusyHub.app/Contents/MacOS/BusyHub\nAuthority=Developer ID Application: Niklas Schmidt (ABCDE12345)\nTeamIdentifier=ABCDE12345\n'
  const adhoc = 'Executable=/Applications/BusyHub.app/Contents/MacOS/BusyHub\nSignature=adhoc\nTeamIdentifier=not set\n'
  assert.equal(teamIdentifier(signed), 'ABCDE12345')
  assert.equal(teamIdentifier(adhoc), null)
  assert.equal(teamIdentifier(''), null)
})
