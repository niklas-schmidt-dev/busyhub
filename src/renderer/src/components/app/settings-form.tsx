import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { ColorPicker } from '@/components/reui/color-picker'
import { Frame, FrameDescription, FrameFooter, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame'
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/reui/number-field'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { errorMessage } from '@/lib/hub'
import { SettingRow } from './setting-row'
import { defaultValues } from '../../../../shared/settings.ts'
import type { AppEntry, GeoDefault, SettingsField, SettingsSchema, SettingsValues } from '../../../../shared/types.ts'

type Leaf = Exclude<SettingsField, { type: 'group' }>

function read(values: SettingsValues, path: string[]): unknown {
  let at: unknown = values
  for (const key of path) at = typeof at === 'object' && at !== null ? (at as SettingsValues)[key] : undefined
  return at
}

function write(values: SettingsValues, path: string[], value: unknown): SettingsValues {
  const [head, ...rest] = path
  if (head === undefined) return values
  const child = values[head]
  return {
    ...values,
    [head]: rest.length === 0 ? value : write(typeof child === 'object' && child !== null ? (child as SettingsValues) : {}, rest, value),
  }
}

function SecretInput({ id, value, onChange, label }: { id: string; value: string; onChange: (value: string) => void; label: string }) {
  const [shown, setShown] = useState(false)
  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        type={shown ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label={shown ? `Hide ${label}` : `Show ${label}`} onClick={() => setShown(!shown)}>
          {shown ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

function Control({ id, field, value, onChange }: { id: string; field: Leaf; value: unknown; onChange: (value: unknown) => void }) {
  switch (field.type) {
    case 'boolean':
      return <Switch id={id} checked={value === true} onCheckedChange={(checked: boolean) => onChange(checked)} />
    case 'integer':
      return (
        <NumberField
          id={id}
          size="sm"
          value={typeof value === 'number' ? value : null}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onValueChange={(next: number | null) => onChange(next ?? field.default)}
        >
          <NumberFieldGroup>
            <NumberFieldDecrement />
            <NumberFieldInput className="tabular-nums" />
            <NumberFieldIncrement />
          </NumberFieldGroup>
        </NumberField>
      )
    case 'enum':
      return (
        <Select value={String(value ?? field.default)} onValueChange={(next: string | null) => onChange(next ?? field.default)}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue>{field.options.find((option) => option.value === value)?.label ?? String(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {field.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )
    case 'color':
      return <ColorPicker value={typeof value === 'string' ? value : field.default} onValueChange={(next: string | null) => onChange(next ?? field.default)} />
    case 'time':
      return <Input id={id} type="time" step={1} value={String(value ?? field.default)} onChange={(event) => onChange(event.target.value)} />
    case 'geolocation': {
      const geo = (typeof value === 'object' && value !== null ? value : field.default) as GeoDefault
      return (
        <div className="flex flex-col gap-2">
          <Select value={geo.mode} onValueChange={(mode: string | null) => onChange({ ...geo, mode: mode === 'fixed' ? 'fixed' : 'auto' })}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue>{geo.mode === 'fixed' ? 'Fixed place' : 'Automatic'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="auto">Automatic</SelectItem>
                <SelectItem value="fixed">Fixed place</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {geo.mode === 'fixed' && (
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label="Latitude" inputMode="decimal" placeholder="Latitude" value={geo.lat ?? ''} onChange={(event) => onChange({ ...geo, lat: Number(event.target.value) })} />
              <Input aria-label="Longitude" inputMode="decimal" placeholder="Longitude" value={geo.lon ?? ''} onChange={(event) => onChange({ ...geo, lon: Number(event.target.value) })} />
            </div>
          )}
        </div>
      )
    }
    case 'string':
      return field.sensitive ? (
        <SecretInput id={id} label={field.label} value={String(value ?? '')} onChange={onChange} />
      ) : (
        <Input id={id} value={String(value ?? '')} maxLength={field.max_length} onChange={(event) => onChange(event.target.value)} />
      )
  }
}

/** Flattens groups into rows; a group's label prefixes its fields' titles. */
function rows(fields: Record<string, SettingsField>, path: string[] = [], prefix = ''): Array<{ path: string[]; title: string; field: Leaf }> {
  return Object.entries(fields).flatMap(([key, field]) =>
    field.type === 'group'
      ? rows(field.fields, [...path, key], `${prefix}${field.label} · `)
      : [{ path: [...path, key], title: `${prefix}${field.label}`, field }],
  )
}

export function SettingsForm({ app, schema }: { app: AppEntry; schema: SettingsSchema }) {
  const baseId = useId()
  const [saved, setSaved] = useState<SettingsValues | null>(null)
  const [values, setValues] = useState<SettingsValues | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let current = true
    setValues(null)
    window.hub
      .values(app.id)
      .then((loaded) => {
        if (!current) return
        setSaved(loaded)
        setValues(loaded)
      })
      .catch((err: unknown) => toast.error(errorMessage(err)))
    return () => {
      current = false
    }
  }, [app.id])

  const dirty = values !== null && JSON.stringify(values) !== JSON.stringify(saved)
  const all = rows(schema.fields)

  const save = async () => {
    if (!values) return
    setSaving(true)
    try {
      await window.hub.saveValues(app.id, values)
      setSaved(values)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Frame spacing="sm">
      <FrameHeader>
        <FrameTitle>Settings</FrameTitle>
        <FrameDescription className="text-xs">
          From the app’s settings.json. Secrets stay on this computer and go to the bar only when the app runs there.
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="p-0">
        {values === null ? (
          <div className="flex flex-col gap-3 p-4">
            {all.map((row) => (
              <Skeleton key={row.path.join('.')} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <FieldGroup className="gap-0">
            {all.map((row, index) => {
              const id = `${baseId}-${row.path.join('-')}`
              return (
                <SettingRow
                  key={id}
                  title={row.title}
                  description={row.field.description}
                  labelFor={row.field.type === 'color' ? undefined : id}
                  last={index === all.length - 1}
                  {...(row.field.type === 'string' && row.field.sensitive ? { badge: { label: 'Secret', variant: 'warning-light' as const } } : {})}
                >
                  <Control
                    id={id}
                    field={row.field}
                    value={read(values, row.path)}
                    onChange={(next) => setValues((prev) => (prev ? write(prev, row.path, next) : prev))}
                  />
                </SettingRow>
              )
            })}
          </FieldGroup>
        )}
      </FramePanel>
      <FrameFooter className="flex-row justify-end gap-2">
        <Button variant="outline" size="sm" disabled={!values} onClick={() => setValues(defaultValues(schema.fields))}>
          Defaults
        </Button>
        <Button size="sm" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </FrameFooter>
    </Frame>
  )
}
