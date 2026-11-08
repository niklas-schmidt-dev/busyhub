import type { HubApi } from '../../shared/types.ts'

declare global {
  interface Window {
    /** The main-process API, exposed by the preload script. */
    hub: HubApi
  }
}

export {}
