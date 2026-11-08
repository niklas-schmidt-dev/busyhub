// Checks every official app against the catalog rules in CONTRIBUTING.md. CI runs it on every pull request.
//   node scripts/check-apps.ts
//   node scripts/check-apps.ts --changed-since origin/main   also require a higher version for apps whose code changed
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SettingsField } from '../src/shared/types.ts'
import { compareVersions } from '../src/shared/version.ts'
import { FOLDER, officialFolders, readOfficialApp, ROOT } from './official-apps.ts'

const sinceFlag = process.argv.indexOf('--changed-since')
const since = sinceFlag === -1 ? null : process.argv[sinceFlag + 1]
if (sinceFlag !== -1 && !since) throw new Error('--changed-since needs a git ref, e.g. origin/main')

const git = (args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/** BusyHub offers an update only when the version goes up, so changed code needs a higher version. */
function versionProblem(folder: string, version: string): string | null {
  if (!since) return null
  if (!git(['diff', '--name-only', `${since}...HEAD`, '--', `apps/${folder}/src`])) return null
  let before: string
  try {
    before = (JSON.parse(git(['show', `${since}:apps/${folder}/src/appmeta/manifest.json`])) as { version: string }).version
  } catch {
    // A new app has no earlier version.
    return null
  }
  return compareVersions(version, before) > 0
    ? null
    : `manifest.json: the app's code changed, so raise its version above ${before}; otherwise nobody is offered the update`
}

const TAGLINE_MAX = 100
const FIELD_TYPES = new Set(['boolean', 'integer', 'string', 'enum', 'color', 'time', 'geolocation', 'group'])

function checkFields(fields: Record<string, SettingsField>, path: string, problems: string[], depth = 1): void {
  if (depth > 4) problems.push(`settings.json: ${path} nests groups deeper than the firmware's 4 levels`)
  for (const [key, field] of Object.entries(fields)) {
    const at = path ? `${path}.${key}` : key
    if (!FIELD_TYPES.has(field.type)) problems.push(`settings.json: ${at} has an unknown type "${String(field.type)}"`)
    if (typeof field.label !== 'string' || field.label === '') problems.push(`settings.json: ${at} needs a label`)
    if (field.type === 'group') checkFields(field.fields ?? {}, at, problems, depth + 1)
    else if (!('default' in field)) problems.push(`settings.json: ${at} needs a default`)
  }
}

function check(folder: string): string[] {
  const problems: string[] = []
  if (!FOLDER.test(folder)) problems.push('the folder name must be lower case letters, digits and dashes, at most 24 characters')

  let app
  try {
    app = readOfficialApp(folder)
  } catch (err) {
    return [...problems, `manifest: ${err instanceof Error ? err.message : String(err)}`]
  }
  const { manifest, rawHub, dir } = app

  if (manifest.id !== `busyhub.${folder}`) problems.push(`manifest.json: the id must be "busyhub.${folder}", not "${manifest.id}"`)
  if (!manifest.author.trim()) problems.push('manifest.json: add yourself as author, e.g. your GitHub user name')
  if (!manifest.description.trim()) problems.push('manifest.json: add a description; the bar and BusyHub show it')

  if (!rawHub) {
    problems.push('hub.json is missing')
  } else {
    if (typeof rawHub.category !== 'string' || !rawHub.category.trim()) problems.push('hub.json: set a category')
    if (typeof rawHub.tagline !== 'string' || !rawHub.tagline.trim()) problems.push('hub.json: set a tagline')
    else if (rawHub.tagline.length > TAGLINE_MAX) problems.push(`hub.json: keep the tagline under ${TAGLINE_MAX} characters`)
    if (!Array.isArray(rawHub.modes) || rawHub.modes.length === 0 || rawHub.modes.some((m) => m !== 'device' && m !== 'host')) {
      problems.push('hub.json: modes must list "device", "host" or both')
    }
    if (rawHub.accent !== undefined && (typeof rawHub.accent !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(rawHub.accent))) {
      problems.push('hub.json: accent must be a #RRGGBB color')
    }
    if (rawHub.minHubVersion !== undefined && (typeof rawHub.minHubVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(rawHub.minHubVersion))) {
      problems.push('hub.json: minHubVersion must be a BusyHub version like 0.2.0')
    }
  }

  if (app.hasSettingsFile) {
    if (!app.settings) problems.push('settings.json: needs format_version, a numeric version and fields')
    else checkFields(app.settings.fields, '', problems)
  }

  const bump = versionProblem(folder, manifest.version)
  if (bump) problems.push(bump)

  if (!existsSync(join(dir, 'README.md'))) problems.push('README.md is missing: say what the app shows and how its controls work')

  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    name?: string
    private?: boolean
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  if (pkg.name !== `@busyhub-apps/${folder}`) problems.push(`package.json: the name must be "@busyhub-apps/${folder}"`)
  if (pkg.private !== true) problems.push('package.json: set "private": true')
  if (!pkg.dependencies?.['@busy-app/busy-lib']) problems.push('package.json: depend on @busy-app/busy-lib')
  if (!pkg.devDependencies?.['@busy-app/cli']) problems.push('package.json: add @busy-app/cli as a dev dependency')

  return problems
}

let failed = 0
for (const folder of officialFolders()) {
  const problems = check(folder)
  if (problems.length === 0) {
    console.log(`ok    apps/${folder}`)
    continue
  }
  failed++
  console.log(`fail  apps/${folder}`)
  for (const problem of problems) console.log(`      - ${problem}`)
}
if (failed) {
  console.log(`\n${failed} app(s) need changes. The rules are in CONTRIBUTING.md.`)
  process.exit(1)
}
