// Builds every official app and writes the catalog BusyHub downloads, ready for GitHub Pages:
//   build/catalog/catalog.json                    every app, its version, checksum and where its package is
//   build/catalog/packages/<id>-<version>.tgz     what the bar installs and BusyHub unpacks
//   build/catalog/index.html                      the same list for people
// The release workflow ships this folder inside each installer, as the snapshot for a first start offline.
//   node scripts/build-catalog.ts
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { CATALOG_FORMAT, FIRST_CATALOG_HUB, parseCatalog, type CatalogApp, type CatalogFeed } from '../src/main/catalog-feed.ts'
import { projectAppmeta } from '../src/main/catalog.ts'
import { officialFolders, readOfficialApp, ROOT } from './official-apps.ts'

const OUT = join(ROOT, 'build', 'catalog')
const REPO = 'https://github.com/niklas-schmidt-dev/busyhub'

function cliFor(dir: string): string {
  const manifest = createRequire(join(dir, 'package.json')).resolve('@busy-app/cli/package.json')
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: string | Record<string, string> }
  return join(dirname(manifest), typeof bin === 'string' ? bin : (bin['busy-cli'] ?? ''))
}

function commit(): string | null {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function page(feed: CatalogFeed): string {
  const rows = feed.apps
    .map(
      (app) => `      <li>
        <span class="icon" style="color:${escape(app.accent)}">${app.icon ? `<img src="${app.icon}" alt="" width="8" height="8">` : escape(app.name.slice(0, 1))}</span>
        <span class="text"><strong>${escape(app.name)}</strong> <small>v${escape(app.version)} · ${escape(app.category)}</small><br>${escape(app.tagline || app.description)}</span>
        ${app.source ? `<a href="${escape(app.source)}">Source</a>` : ''}
      </li>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BusyHub catalog</title>
  <link rel="icon" href="logo.png">
  <style>
    :root { color-scheme: dark; --bg: #0b0b0c; --card: #151517; --line: rgb(255 255 255 / 0.08); --muted: #9b9ba1; --accent: #ff5a4f; }
    body { margin: 0; background: var(--bg); color: #f4f4f5; font: 15px/1.5 system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
    main { max-width: 760px; margin: 0 auto; padding: 48px 16px; }
    header { display: flex; gap: 16px; align-items: center; margin-bottom: 32px; }
    h1 { margin: 0; font-size: 24px; letter-spacing: -0.01em; }
    p { margin: 4px 0 0; color: var(--muted); }
    a { color: var(--accent); }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { display: flex; gap: 14px; align-items: center; padding: 14px; background: var(--card); border-radius: 12px; box-shadow: 0 0 0 1px var(--line); }
    .icon { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 8px; background: #000; font: 700 16px ui-monospace, monospace; }
    .icon img { width: 28px; height: 28px; image-rendering: pixelated; }
    .text { flex: 1; min-width: 0; }
    small { color: var(--muted); font-variant-numeric: tabular-nums; }
    footer { margin-top: 32px; color: var(--muted); font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <header>
      <img src="logo.png" alt="" width="56" height="56">
      <div>
        <h1>BusyHub catalog</h1>
        <p>Official apps for the BUSY Bar. Open <a href="${REPO}#install">BusyHub</a> to run them on the bar or from your computer.</p>
      </div>
    </header>
    <ul>
${rows}
    </ul>
    <footer>${feed.apps.length} apps · updated ${escape(feed.generatedAt)} · <a href="catalog.json">catalog.json</a> · <a href="${REPO}/blob/main/CONTRIBUTING.md">Add your app</a></footer>
  </main>
</body>
</html>
`
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'packages'), { recursive: true })

const apps: CatalogApp[] = []
for (const folder of officialFolders()) {
  const app = readOfficialApp(folder)
  const { id, version } = app.manifest
  console.log(`Building ${id} ${version}`)
  execFileSync(process.execPath, [cliFor(app.dir), 'build'], { cwd: app.dir, stdio: 'inherit', env: { ...process.env, NO_COLOR: '1', CI: '1' } })

  const file = `packages/${id}-${version}.tgz`
  cpSync(join(app.dir, 'dist', `${id}.tgz`), join(OUT, file))
  const bytes = readFileSync(join(OUT, file))
  const appmeta = projectAppmeta(app.dir) ?? ''
  const iconPath = join(appmeta, 'icon_front_8x8.png')
  const minHub = typeof app.rawHub?.minHubVersion === 'string' ? app.rawHub.minHubVersion : FIRST_CATALOG_HUB

  apps.push({
    id,
    name: app.manifest.name,
    version,
    description: app.manifest.description,
    author: app.manifest.author,
    category: app.hub.category,
    tagline: app.hub.tagline,
    accent: app.hub.accent,
    modes: app.hub.modes,
    minHubVersion: minHub,
    icon: existsSync(iconPath) ? `data:image/png;base64,${readFileSync(iconPath).toString('base64')}` : null,
    source: `${REPO}/tree/main/apps/${folder}`,
    package: { path: file, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length },
  })
}

const feed: CatalogFeed = { format: CATALOG_FORMAT, generatedAt: new Date().toISOString(), commit: commit(), apps }
const json = `${JSON.stringify(feed, null, 2)}\n`

// The hub's own parser has to accept every entry, or a broken app would silently vanish for users.
const { skipped } = parseCatalog(JSON.parse(json))
if (skipped.length) throw new Error(`The catalog has entries BusyHub would skip:\n${skipped.join('\n')}`)

writeFileSync(join(OUT, 'catalog.json'), json)
writeFileSync(join(OUT, 'index.html'), page(feed))
cpSync(join(ROOT, 'assets', 'branding', 'busyhub-logo-128.png'), join(OUT, 'logo.png'))
// Serve files as they are; no Jekyll processing on GitHub Pages.
writeFileSync(join(OUT, '.nojekyll'), '')
console.log(`Catalog with ${apps.length} apps in ${OUT}`)
