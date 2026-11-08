import { CircleArrowUpIcon, RotateCwIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { errorMessage, useUpdateStatus } from '@/lib/hub'

const install = () => void window.hub.installUpdate().catch((err: unknown) => toast.error(errorMessage(err)))

/**
 * BusyHub's own update, in the header: its progress while it downloads, then a restart into it. Where this install
 * cannot replace itself, a link to the release instead.
 */
export function UpdateButton() {
  const status = useUpdateStatus()
  const announced = useRef<string | null>(null)

  // Said once per version; the button stays until BusyHub restarts.
  useEffect(() => {
    if (status.state !== 'ready' || announced.current === status.version) return
    announced.current = status.version
    toast(`BusyHub ${status.version} is ready`, {
      description: 'It installs when BusyHub quits.',
      action: { label: 'Restart now', onClick: install },
    })
  }, [status])

  switch (status.state) {
    case 'downloading':
      return (
        <span className="text-xs text-muted-foreground tabular-nums" role="status">
          Updating to {status.version} · {status.percent}%
        </span>
      )
    case 'ready':
      return (
        <Button variant="outline" size="sm" onClick={install}>
          <RotateCwIcon aria-hidden />
          Restart to update
        </Button>
      )
    case 'manual':
      return (
        <Button variant="ghost" size="sm" onClick={install}>
          <CircleArrowUpIcon aria-hidden />
          BusyHub {status.version} available
        </Button>
      )
    default:
      return null
  }
}
