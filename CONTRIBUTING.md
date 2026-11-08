# Contributing to BusyHub

Thanks for helping. You can contribute two kinds of things:

- **An app for the catalog.** This is the most common contribution, and it needs no knowledge of BusyHub's own code.
- **A change to BusyHub itself:** a fix, a feature, or docs.

Both start the same way: fork the repository, make your change on a branch, and open a pull request from your fork.

## Add an app to the catalog

### 1. Set up

You need [Node.js 24+](https://nodejs.org), [pnpm](https://pnpm.io) and a BUSY Bar with firmware 1.3.1 or newer.

```sh
git clone https://github.com/<you>/busyhub.git
cd busyhub
pnpm install
```

### 2. Create the app

Copy the starter into `apps/<name>`. The folder name becomes part of the app id, so keep it short: lower case letters, digits and dashes, at most 24 characters.

```sh
cp -R templates/starter apps/pixel-rain
```

Then fill in the placeholders:

| File | What to set |
| --- | --- |
| `package.json` | `"name": "@busyhub-apps/pixel-rain"` |
| `src/appmeta/manifest.json` | `"id": "busyhub.pixel-rain"`, a `name`, a one-sentence `description`, and your GitHub user name as `author` |
| `hub.json` | `category`, a `tagline` under 100 characters, and `modes` (`device` for the bar, `host` for the computer) |
| `README.md` | What the app shows, its controls, its settings |

Run `pnpm install` again so the workspace links the new app, then start BusyHub with `pnpm dev`. Your app shows up in the catalog right away. Press **Run**, try it on the bar and on your computer, and edit `src/main.ts` until it does what you want. The [BUSY JS app guide](https://docs.busy.app/bar/dev/js-apps/build) and the two apps in `apps/` show the drawing, input and settings APIs.

### 3. Check it

```sh
pnpm apps:check          # the catalog rules below
pnpm apps:readme         # adds your app to the table in README.md
pnpm --filter "./apps/*" exec tsc
```

Commit the updated `README.md` along with your app.

### 4. Open a pull request

Push your branch to your fork and open a pull request against `main`. CI runs the same checks and builds every app. A maintainer then tries your app on a real bar and reviews it. Once it's merged, the catalog workflow publishes it to GitHub Pages, and it shows up in everyone's BusyHub within minutes. No BusyHub release is needed.

### Update an app

Change the code, then raise `version` in `src/appmeta/manifest.json` and `package.json`. BusyHub offers an update only when the version goes up, so CI fails a pull request that changes an app's `src/` without raising it. Use a patch version for fixes and a minor version for new features.

If the app starts using something only newer BusyHub versions have, set `minHubVersion` in `hub.json` to the first BusyHub version that has it. Older BusyHub versions then keep showing the version they can run, until they're updated.

### Catalog rules

CI checks these:

- The folder is `apps/<name>`, the app id is `busyhub.<name>`, and the package name is `@busyhub-apps/<name>`.
- `manifest.json` has a name, a description and an author.
- `hub.json` has a category, a tagline under 100 characters, and valid `modes`. `minHubVersion`, if set, is a BusyHub version like `0.2.0`.
- A pull request that changes an app's `src/` raises its `version`.
- `settings.json`, if there is one, follows the [settings schema](https://developer.busy.app/javascript-applications-settings-schema.html): every field has a type, a label and a default.
- There is a `README.md`.

A maintainer reviews these:

- **It's honest.** It does what its README says. Every host it talks to is named in the README.
- **It's safe.** No tracking, no crypto mining, no reading files outside the app's own storage. Secrets go in `settings.json` fields marked `"sensitive": true`, never in code.
- **It's kind to the bar.** It stops its timers and listeners when you press Back. It refreshes remote data every few minutes, not every second.
- **It's yours to give.** You wrote it or have the right to share it under the MIT license. Images and sounds are yours or openly licensed.

## Change BusyHub itself

```sh
pnpm dev          # the app with hot reload
pnpm typecheck
pnpm test
pnpm dist         # installers for your platform, in release/
```

- Keep changes focused, and say in the pull request what changed and how you tested it. Include a screenshot when the interface changes.
- Code is TypeScript. Keep it typed, and avoid `any`.
- The interface uses [shadcn/ui](https://ui.shadcn.com) and [ReUI](https://reui.io)'s free components. Reuse them before writing new ones. Only add UI code that may be published under MIT.
- Logic shared by the main process and the window goes in `src/shared/`, with tests next to it.

## Releases

Maintainers publish a release by pushing a version tag:

```sh
pnpm version minor -m "Release %s"   # or patch / major
git push --follow-tags
```

The release workflow builds the installers for macOS, Windows and Linux and publishes them as a GitHub release. Each installer carries a snapshot of the catalog, so a first start without a connection still has the official apps.

Releases are for BusyHub itself. Adding, updating or removing an app only needs a merge to `main`: the catalog workflow (`.github/workflows/catalog.yml`) publishes `catalog.json` and the app packages to GitHub Pages, and every BusyHub picks them up the next time it checks, at start and every six hours.

## Code of conduct

Be kind and assume good intent. Maintainers may remove comments, apps or contributions that are hostile, deceptive or unsafe.
