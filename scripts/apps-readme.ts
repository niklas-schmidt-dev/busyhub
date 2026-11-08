// Writes the table of official apps into README.md, between the apps:start and apps:end markers.
//   node scripts/apps-readme.ts           update README.md
//   node scripts/apps-readme.ts --check   fail when README.md is out of date (CI)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { officialFolders, readOfficialApp, ROOT } from './official-apps.ts'

const README = join(ROOT, 'README.md')
const START = '<!-- apps:start -->'
const END = '<!-- apps:end -->'
const WHERE = { device: 'Bar', host: 'Computer' } as const

const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ')

function table(): string {
  const rows = officialFolders().map((folder) => {
    const { manifest, hub } = readOfficialApp(folder)
    const author = /^[A-Za-z0-9-]+$/.test(manifest.author) ? `[@${manifest.author}](https://github.com/${manifest.author})` : cell(manifest.author)
    const runs = hub.modes.map((mode) => WHERE[mode]).join(' · ')
    return `| [**${cell(manifest.name)}**](apps/${folder}) | ${cell(hub.tagline || manifest.description)} | ${runs} | ${author} |`
  })
  return ['| App | What it does | Runs on | By |', '| --- | --- | --- | --- |', ...rows].join('\n')
}

const readme = readFileSync(README, 'utf8')
const start = readme.indexOf(START)
const end = readme.indexOf(END)
if (start === -1 || end < start) throw new Error(`README.md needs ${START} and ${END} markers`)
const next = `${readme.slice(0, start + START.length)}\n${table()}\n${readme.slice(end)}`

if (process.argv.includes('--check')) {
  if (next !== readme) {
    console.error('The apps table in README.md is out of date. Run `pnpm apps:readme` and commit the result.')
    process.exit(1)
  }
  console.log('README.md apps table is up to date.')
} else {
  writeFileSync(README, next)
  console.log('Updated the apps table in README.md.')
}
