import type { SettingsField, SettingsSchema, SettingsValues } from './types.ts'

const isObject = (value: unknown): value is SettingsValues =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The schema's defaults, with groups as nested objects. */
export function defaultValues(fields: Record<string, SettingsField>): SettingsValues {
  const values: SettingsValues = {}
  for (const [id, field] of Object.entries(fields)) {
    values[id] = field.type === 'group' ? defaultValues(field.fields) : field.default
  }
  return values
}

/** Stored values over the defaults; fields the schema no longer has are dropped, wrongly typed values fall back to the default. */
export function resolveValues(schema: SettingsSchema | null, stored: SettingsValues | undefined): SettingsValues {
  if (!schema) return {}
  return overlay(schema.fields, stored ?? {})
}

function overlay(fields: Record<string, SettingsField>, stored: SettingsValues): SettingsValues {
  const values: SettingsValues = {}
  for (const [id, field] of Object.entries(fields)) {
    const value = stored[id]
    if (field.type === 'group') {
      values[id] = overlay(field.fields, isObject(value) ? value : {})
    } else {
      values[id] = fits(field, value) ? value : field.default
    }
  }
  return values
}

function fits(field: Exclude<SettingsField, { type: 'group' }>, value: unknown): boolean {
  switch (field.type) {
    case 'boolean':
      return typeof value === 'boolean'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'geolocation':
      return isObject(value) && (value.mode === 'auto' || value.mode === 'fixed')
    case 'enum':
      return field.options.some((option) => option.value === value)
    default:
      return typeof value === 'string'
  }
}

/** Ids of string fields marked sensitive, as dotted paths into the values. */
export function sensitivePaths(fields: Record<string, SettingsField>, prefix = ''): string[] {
  return Object.entries(fields).flatMap(([id, field]) => {
    if (field.type === 'group') return sensitivePaths(field.fields, `${prefix}${id}.`)
    return field.type === 'string' && field.sensitive ? [`${prefix}${id}`] : []
  })
}
