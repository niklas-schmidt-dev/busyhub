import { Badge } from '@/components/reui/badge'
import { hasUpdate } from '@/lib/apps'
import type { AppEntry, RunState } from '../../../../shared/types.ts'

const WHERE = { device: 'on the bar', host: 'on this computer' } as const

/** The one status an app shows on its tile and in its header. */
export function RunBadge({ app, run }: { app: AppEntry; run: RunState | undefined }) {
  if (run?.status === 'running') return <Badge variant="success-light">Running {WHERE[run.mode]}</Badge>
  if (run && ['building', 'installing', 'starting'].includes(run.status)) {
    return <Badge variant="info-light">{run.status === 'building' ? 'Building' : run.status === 'installing' ? 'Installing' : 'Starting'}</Badge>
  }
  if (run?.status === 'error') return <Badge variant="destructive-light">Failed</Badge>
  if (hasUpdate(app)) return <Badge variant="info-light">Update available</Badge>
  if (app.onBar) return <Badge variant="outline">On the bar</Badge>
  if (app.source === 'catalog') return <Badge variant="outline">Not downloaded</Badge>
  return null
}
