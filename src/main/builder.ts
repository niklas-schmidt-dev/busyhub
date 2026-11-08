// Builds app projects with their own busy-cli, and installs a project's dependencies when they are missing.
import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export type Log = (level: 'info' | 'warn' | 'error', text: string) => void

/** What the bar installs (the .tgz) and what a run on this computer executes (scripts/main.js). */
export interface Artifacts {
  tgz: string
  entry: string
}

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g

let shellPath: Promise<string | undefined> | undefined

/**
 * Apps started from the Finder or a desktop launcher get a bare PATH without Homebrew, nvm or volta.
 * The user's login shell knows the real one, so package managers are looked up there.
 */
function loginShellPath(): Promise<string | undefined> {
  if (process.platform === 'win32') return Promise.resolve(process.env.PATH)
  shellPath ??= new Promise((resolve) => {
    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh')
    execFile(shell, ['-ilc', 'printf "__PATH__%s__PATH__" "$PATH"'], { timeout: 5000 }, (err, stdout) => {
      const found = /__PATH__(.*)__PATH__/.exec(stdout ?? '')?.[1]
      resolve(err || !found ? process.env.PATH : found)
    })
  })
  return shellPath
}

/** Runs a command without a shell and streams its output, line by line, into the log. */
export async function runCommand(command: string, args: string[], cwd: string, log: Log, env: NodeJS.ProcessEnv = {}): Promise<void> {
  const path = await loginShellPath()
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...(path ? { PATH: path } : {}), NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      // npm and friends are .cmd scripts on Windows, which need a shell there.
      shell: process.platform === 'win32' && command !== process.execPath,
    })
    const pipe = (level: 'info' | 'warn') => (chunk: Buffer) => {
      for (const line of chunk.toString().replace(ANSI, '').split(/\r?\n/)) {
        const text = line.trim()
        if (text) log(level, text)
      }
    }
    child.stdout.on('data', pipe('info'))
    child.stderr.on('data', pipe('warn'))
    child.on('error', (err: NodeJS.ErrnoException) => {
      reject(err.code === 'ENOENT' ? new Error(`${command} was not found. Install Node.js 24 or newer to build your own apps.`) : err)
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

/** The package manager a project's lockfile asks for; npm when there is none. */
export function packageManagerFor(dir: string): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  for (let at = dir; ; at = dirname(at)) {
    if (existsSync(join(at, 'pnpm-lock.yaml')) || existsSync(join(at, 'pnpm-workspace.yaml'))) return 'pnpm'
    if (existsSync(join(at, 'yarn.lock'))) return 'yarn'
    if (existsSync(join(at, 'bun.lock')) || existsSync(join(at, 'bun.lockb'))) return 'bun'
    if (existsSync(join(at, 'package-lock.json'))) return 'npm'
    if (dirname(at) === at) return 'npm'
  }
}

export function installDependencies(dir: string, log: Log): Promise<void> {
  const manager = packageManagerFor(dir)
  log('info', `Installing dependencies with ${manager} in ${dir}`)
  return runCommand(manager, ['install'], dir, log)
}

/** The busy-cli entry the project itself depends on, or null until its dependencies are installed. */
function projectCli(dir: string): string | null {
  try {
    const manifest = createRequire(join(dir, 'package.json')).resolve('@busy-app/cli/package.json')
    const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: string | Record<string, string> }
    return join(dirname(manifest), typeof bin === 'string' ? bin : (bin['busy-cli'] ?? Object.values(bin)[0] ?? ''))
  } catch {
    return null
  }
}

/**
 * `busy-cli build --emit both` leaves dist/<id>.tgz for the bar and dist/<id>/ for a run on this computer.
 * It runs on the Node inside BusyHub (ELECTRON_RUN_AS_NODE), so building needs no Node on the system;
 * only installing a project's dependencies does.
 */
export async function buildProject(dir: string, id: string, log: Log): Promise<Artifacts> {
  if (!existsSync(join(dir, 'package.json'))) throw new Error(`${dir} has no package.json, so there is nothing to build with`)
  let cli = projectCli(dir)
  if (!cli) {
    await installDependencies(dir, log)
    cli = projectCli(dir)
    if (!cli) throw new Error(`${dir} does not depend on @busy-app/cli; add it to build this app`)
  }
  await runCommand(process.execPath, [cli, 'build', '--emit', 'both'], dir, log, { ELECTRON_RUN_AS_NODE: '1' })
  const artifacts = { tgz: join(dir, 'dist', `${id}.tgz`), entry: join(dir, 'dist', id, 'scripts', 'main.js') }
  for (const path of Object.values(artifacts)) {
    if (!existsSync(path)) throw new Error(`The build finished without ${path}`)
  }
  return artifacts
}

/** A package is already built: package.tgz and its unpacked <id>/ folder. */
export function packageArtifacts(dir: string, id: string): Artifacts {
  return { tgz: join(dir, 'package.tgz'), entry: join(dir, id, 'scripts', 'main.js') }
}
