// Adds local apps: a new project from the starter template, or a built .tgz package. Linking a folder needs no files and lives in hub.ts.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { installDependencies, runCommand, type Log } from './builder.ts'
import { APP_ID, parseManifest } from './catalog.ts'

/** A firmware-valid id from a display name, unique among `taken`. */
export function slugify(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28)
      .replace(/-+$/, '') || 'my-app'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  if (!APP_ID.test(id)) throw new Error(`Could not make a valid app id from "${name}"`)
  return id
}

const TEMPLATED = ['package.json', 'hub.json', join('src', 'appmeta', 'manifest.json')]

/** Copies the starter into appsFolder/<id> and installs its dependencies. */
export async function createProject(appsFolder: string, templateDir: string, name: string, taken: Set<string>, log: Log): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Give the app a name')
  const id = slugify(trimmed, taken)
  const dest = join(appsFolder, id)
  if (existsSync(dest)) throw new Error(`${dest} already exists`)
  mkdirSync(appsFolder, { recursive: true })
  cpSync(templateDir, dest, { recursive: true })
  for (const file of TEMPLATED) {
    const path = join(dest, file)
    const text = readFileSync(path, 'utf8')
    writeFileSync(path, text.replaceAll('{{id}}', id).replaceAll('{{name}}', JSON.stringify(trimmed).slice(1, -1)))
  }
  log('info', `Created ${dest}`)
  try {
    await installDependencies(dest, log)
  } catch (err) {
    // The project is usable once its dependencies are in; the first build tries again.
    log('warn', `Could not install dependencies yet: ${err instanceof Error ? err.message : String(err)}`)
  }
  return id
}

export interface UnpackOptions {
  /** Refuse a package with another id or version, e.g. when the catalog says what it must hold. */
  expect?: { id: string; version: string }
  /** Extra files written next to the package, such as the catalog's hub.json. */
  extraFiles?: Record<string, string>
}

/**
 * Unpacks a .tgz built by busy-cli into packagesDir/<id>/, next to a copy of the archive.
 * The new folder is assembled beside the old one and swapped in at the end, so a failed update leaves the app as it was.
 */
export async function unpackPackage(tgz: string, packagesDir: string, log: Log, options: UnpackOptions = {}): Promise<{ id: string; version: string }> {
  mkdirSync(packagesDir, { recursive: true })
  const staging = mkdtempSync(join(packagesDir, '.unpack-'))
  try {
    const content = join(staging, 'content')
    mkdirSync(content)
    // bsdtar (macOS, Windows) and GNU tar both refuse absolute paths and ../ entries by default.
    await runCommand('tar', ['-xzf', tgz, '-C', content], content, log)
    const roots = readdirSync(content, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    const root = roots.find((entry) => existsSync(join(content, entry.name, 'appmeta', 'manifest.json')))
    if (!root || roots.length !== 1) throw new Error('The package must hold exactly one <id>/ folder with appmeta/manifest.json')
    const { id, version } = parseManifest(JSON.parse(readFileSync(join(content, root.name, 'appmeta', 'manifest.json'), 'utf8')))
    if (root.name !== id) throw new Error(`The package folder ${root.name} does not match the app id ${id}`)
    if (options.expect && (options.expect.id !== id || options.expect.version !== version)) {
      throw new Error(`The package holds ${id} ${version}, not ${options.expect.id} ${options.expect.version}`)
    }

    const next = join(staging, 'next')
    mkdirSync(next)
    renameSync(join(content, id), join(next, id))
    cpSync(tgz, join(next, 'package.tgz'))
    // The built scripts are ES modules; this lets a run on this computer import them.
    writeFileSync(join(next, 'package.json'), '{ "type": "module" }\n')
    for (const [name, text] of Object.entries(options.extraFiles ?? {})) writeFileSync(join(next, name), text)

    const dest = join(packagesDir, id)
    const previous = join(staging, 'previous')
    if (existsSync(dest)) renameSync(dest, previous)
    renameSync(next, dest)
    return { id, version }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

/** Imports a .tgz you picked into packagesDir/<id>/. */
export async function importPackage(tgz: string, packagesDir: string, log: Log): Promise<string> {
  const { id } = await unpackPackage(tgz, packagesDir, log)
  log('info', `Imported ${basename(tgz)} as ${id}`)
  return id
}
