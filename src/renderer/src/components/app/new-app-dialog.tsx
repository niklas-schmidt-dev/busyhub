import { useEffect, useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/hub'

export function NewAppDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
}) {
  const id = useId()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setName('')
  }, [open])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const created = await window.hub.createApp(name)
      toast.success(`Created apps/${created}`, { description: 'Edit src/main.ts, then press Run.' })
      onCreated(created)
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !busy && onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New app</DialogTitle>
            <DialogDescription>A project in apps/ from the starter: settings, wheel input and storage already wired.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input id={`${id}-name`} value={name} autoFocus placeholder="Pomodoro Pixels" onChange={(event) => setName(event.target.value)} />
            <FieldDescription>The id is made from it: lower case, dashes, at most 32 characters.</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={busy || name.trim() === ''}>
              {busy ? 'Creating…' : 'Create app'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
