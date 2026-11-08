import type { ComponentProps, ReactNode } from 'react'
import { Badge } from '@/components/reui/badge'
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSeparator, FieldTitle } from '@/components/ui/field'

/** One setting: its label and description, then its control. Stacks in a narrow column, sits side by side in a wide one. */
export function SettingRow({
  title,
  description,
  badge,
  labelFor,
  last,
  children,
}: {
  title: string
  description?: string
  badge?: { label: string; variant: ComponentProps<typeof Badge>['variant'] }
  /** The control's id; without one the title is plain text, e.g. for a color picker that labels itself. */
  labelFor?: string
  last?: boolean
  children: ReactNode
}) {
  return (
    <>
      <Field orientation="responsive" className="gap-3 px-4 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            {labelFor ? <FieldLabel htmlFor={labelFor}>{title}</FieldLabel> : <FieldTitle>{title}</FieldTitle>}
            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          </div>
          {description && <FieldDescription className="text-xs">{description}</FieldDescription>}
        </div>
        <FieldContent className="min-w-0">{children}</FieldContent>
      </Field>
      {!last && <FieldSeparator />}
    </>
  )
}
