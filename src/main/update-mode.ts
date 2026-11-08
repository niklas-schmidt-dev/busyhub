// Whether this copy of BusyHub can replace itself with an update. Pure, so it is tested without Electron.

export type UpdateMode = 'auto' | 'manual'

export interface InstallFacts {
  /** The Team ID of a Mac build's signature; null for ad-hoc and unsigned builds. */
  teamId: string | null
  /** Started as an AppImage (electron-builder's AppImage sets $APPIMAGE). */
  appImage: boolean
  /** Installed from a .deb or another package (electron-builder writes resources/package-type for those). */
  packaged: boolean
}

/**
 * Windows (the per-user NSIS installer), a Linux AppImage or .deb, and a Mac build signed with a Developer ID update
 * themselves. Squirrel.Mac only accepts an update signed like the running app, which an ad-hoc signature never is.
 */
export function updateMode(platform: NodeJS.Platform, facts: InstallFacts): UpdateMode {
  if (platform === 'win32') return 'auto'
  if (platform === 'darwin') return facts.teamId ? 'auto' : 'manual'
  if (platform === 'linux') return facts.appImage || facts.packaged ? 'auto' : 'manual'
  return 'manual'
}

/** The TeamIdentifier line of `codesign -dv` output; "not set" for ad-hoc signatures. */
export function teamIdentifier(codesignOutput: string): string | null {
  const value = /^TeamIdentifier=(.*)$/m.exec(codesignOutput)?.[1]?.trim()
  return value && value !== 'not set' ? value : null
}
