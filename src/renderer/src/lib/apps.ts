import { compareVersions } from '../../../shared/version.ts'
import type { AppEntry } from '../../../shared/types.ts'

/** A downloaded official app whose catalog version is newer than the copy on this computer. */
export function hasUpdate(app: AppEntry): boolean {
  const latest = app.catalog?.latest
  return app.official && app.source === 'package' && latest != null && compareVersions(latest, app.version) > 0
}

// These phrases sit inside English sentences, so they are English too, whatever the system language is.
const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const DATE = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' })

/** "5 minutes ago", "yesterday". */
export function ago(at: number, now = Date.now()): string {
  const seconds = Math.round((at - now) / 1000)
  if (Math.abs(seconds) < 60) return RELATIVE.format(0, 'minute')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, 'hour')
  return RELATIVE.format(Math.round(hours / 24), 'day')
}

export function day(iso: string | null): string {
  if (!iso) return 'an earlier day'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'an earlier day' : DATE.format(date)
}
