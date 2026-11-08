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

/** Unpacks a .tgz built by busy-cli into packagesDir/<id>/, next to a copy of the archive. */
export async function importPackage(tgz: string, packagesDir: string, log: Log): Promise<string> {
  mkdirSync(packagesDir, { recursive: true })
  const staging = mkdtempSync(join(packagesDir, '.import-'))
  try {
    // bsdtar (macOS, Windows) and GNU tar both refuse absolute paths and ../ entries by default.
    await runCommand('tar', ['-xzf', tgz, '-C', staging], staging, log)
    const roots = readdirSync(staging, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    const root = roots.find((entry) => existsSync(join(staging, entry.name, 'appmeta', 'manifest.json')))
    if (!root || roots.length !== 1) throw new Error('The package must hold exactly one <id>/ folder with appmeta/manifest.json')
    const { id } = parseManifest(JSON.parse(readFileSync(join(staging, root.name, 'appmeta', 'manifest.json'), 'utf8')))
    if (root.name !== id) throw new Error(`The package folder ${root.name} does not match the app id ${id}`)

    const dest = join(packagesDir, id)
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest)
    renameSync(join(staging, id), join(dest, id))
    cpSync(tgz, join(dest, 'package.tgz'))
    // The built scripts are ES modules; this lets a run on this computer import them.
    writeFileSync(join(dest, 'package.json'), '{ "type": "module" }\n')
    log('info', `Imported ${basename(tgz)} as ${id}`)
    return id
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
