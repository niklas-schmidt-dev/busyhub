// Builds every official app with its busy-cli into build/official/, the layout a release bundles:
//   build/official/<folder>/package.tgz   what the bar installs
//   build/official/<folder>/<id>/          the unpacked package, for runs on the computer
//   build/official/<folder>/hub.json, README.md, package.json ("type": "module")
//   node scripts/build-official-apps.ts
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { officialFolders, readOfficialApp, ROOT } from './official-apps.ts'

const OUT = join(ROOT, 'build', 'official')

function cliFor(dir: string): string {
  const manifest = createRequire(join(dir, 'package.json')).resolve('@busy-app/cli/package.json')
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: string | Record<string, string> }
  return join(dirname(manifest), typeof bin === 'string' ? bin : (bin['busy-cli'] ?? ''))
}

rmSync(OUT, { recursive: true, force: true })
for (const folder of officialFolders()) {
  const app = readOfficialApp(folder)
  const { id } = app.manifest
  console.log(`Building ${id}`)
  execFileSync(process.execPath, [cliFor(app.dir), 'build', '--emit', 'both'], {
    cwd: app.dir,
    stdio: 'inherit',
    env: { ...process.env, NO_COLOR: '1', CI: '1' },
  })
  const dest = join(OUT, folder)
  mkdirSync(dest, { recursive: true })
  cpSync(join(app.dir, 'dist', `${id}.tgz`), join(dest, 'package.tgz'))
  cpSync(join(app.dir, 'dist', id), join(dest, id), { recursive: true })
  for (const file of ['hub.json', 'README.md']) cpSync(join(app.dir, file), join(dest, file))
  writeFileSync(join(dest, 'package.json'), '{ "type": "module" }\n')
}
console.log(`Official apps are in ${OUT}`)
