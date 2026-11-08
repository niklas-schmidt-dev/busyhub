import { compareVersions } from '../../../shared/version.ts'
import type { AppEntry } from '../../../shared/types.ts'

/** Who an app comes from: BUSY itself, BusyHub's official catalog, or the person using BusyHub. */
export type AppOrigin = 'busy' | 'busyhub' | 'own'

/** BUSY's own apps (Clock, Weather, the JS example) use the app.busy namespace. */
const BUSY_APP_ID = /^app\.busy\./

/**
 * Official catalog apps first; then BUSY's apps as the bar lists them. A local project with a BUSY id, such as an
 * edited copy of the JS example, is the user's own.
 */
export function appOrigin(app: Pick<AppEntry, 'id' | 'official' | 'source'>): AppOrigin {
  if (app.official) return 'busyhub'
  if (app.source === 'bar' && BUSY_APP_ID.test(app.id)) return 'busy'
  return 'own'
}

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
