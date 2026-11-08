import { useEffect, useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/reui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/hub'
import type { BarConfig, BarStatus } from '../../../../shared/types.ts'

export function ConnectDialog({
  open,
  onOpenChange,
  config,
  onConnected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: BarConfig | null
  onConnected: () => void
}) {
  const id = useId()
  const [addr, setAddr] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAddr(config?.addr ?? '')
    setPassword('')
    setProblem(null)
  }, [open, config?.addr])

  const finish = (status: BarStatus, triedPassword: boolean) => {
    if (status.state === 'online') {
      toast.success(`Connected to ${status.name}`)
      onConnected()
      onOpenChange(false)
    } else if (status.state === 'locked') {
      setProblem(triedPassword ? 'The bar refused this password.' : 'This bar needs its HTTP access password.')
    } else {
      setProblem(status.error)
    }
  }

  const connect = async (nextPassword: string | null) => {
    setBusy(true)
    setProblem(null)
    try {
      const triedPassword = nextPassword === null ? Boolean(config?.hasPassword) : nextPassword !== ''
      finish(await window.hub.connect(addr, nextPassword), triedPassword)
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    // An empty field keeps the stored password.
    void connect(password === '' && config?.hasPassword ? null : password)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Connect to your bar</DialogTitle>
            <DialogDescription>Over USB the bar is at 10.0.4.20. Over Wi-Fi, use the address shown in the bar’s settings.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor={`${id}-addr`}>Address</FieldLabel>
              <Input
                id={`${id}-addr`}
                value={addr}
                autoFocus
                spellCheck={false}
                placeholder="10.0.4.20"
                onChange={(event) => setAddr(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-password`}>HTTP access password</FieldLabel>
              <Input
                id={`${id}-password`}
                type="password"
                autoComplete="off"
                value={password}
                placeholder={config?.hasPassword ? 'Saved; leave empty to keep it' : 'Only when password protection is on'}
                onChange={(event) => setPassword(event.target.value)}
              />
              <FieldDescription>Stored encrypted with your system keychain. Not needed over USB.</FieldDescription>
            </Field>
          </FieldGroup>
          {problem && (
            <Alert variant="destructive" role="status">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            {config?.hasPassword && (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void connect('')}>
                Forget password
              </Button>
            )}
            <Button type="submit" disabled={busy || addr.trim() === ''}>
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
