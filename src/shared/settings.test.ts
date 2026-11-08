import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { defaultValues, resolveValues, sensitivePaths } from './settings.ts'
import type { SettingsSchema } from './types.ts'

const schema: SettingsSchema = {
  format_version: 1,
  version: 1,
  fields: {
    url: { type: 'string', label: 'URL', default: '' },
    token: { type: 'string', label: 'Token', default: '', sensitive: true },
    budget: { type: 'integer', label: 'Budget', default: 50, min: 1 },
    unit: {
      type: 'enum',
      label: 'Unit',
      default: 'usd',
      options: [
        { value: 'usd', label: 'USD' },
        { value: 'eur', label: 'EUR' },
      ],
    },
    look: {
      type: 'group',
      label: 'Look',
      fields: { color: { type: 'color', label: 'Color', default: '#3DDC84' } },
    },
  },
}

test('defaults nest groups', () => {
  assert.deepEqual(defaultValues(schema.fields), {
    url: '',
    token: '',
    budget: 50,
    unit: 'usd',
    look: { color: '#3DDC84' },
  })
})

test('stored values win, but only when they fit the field', () => {
  const values = resolveValues(schema, {
    url: 'https://example.test/spend',
    budget: 12.5,
    unit: 'gbp',
    look: { color: '#FF0000' },
    gone: true,
  })
  assert.deepEqual(values, {
    url: 'https://example.test/spend',
    token: '',
    budget: 50,
    unit: 'usd',
    look: { color: '#FF0000' },
  })
})

test('an app without a schema has no values', () => {
  assert.deepEqual(resolveValues(null, { anything: 1 }), {})
})

test('sensitive string fields are found inside groups too', () => {
  const nested: SettingsSchema = {
    ...schema,
    fields: { ...schema.fields, auth: { type: 'group', label: 'Auth', fields: { key: { type: 'string', label: 'Key', default: '', sensitive: true } } } },
  }
  assert.deepEqual(sensitivePaths(nested.fields), ['token', 'auth.key'])
})
