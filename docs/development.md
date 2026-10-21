# Development

Use **Node 22+** and **PowerShell 7** on Windows. Inno Setup 6 is needed only to build or exercise the EXE installer. The shipped helpers have no npm dependencies; Playwright is pinned development tooling.

## Clean checkout

```powershell
npm ci --ignore-scripts
npx playwright install chromium
npm test
npm run test:browser
```

Use the lockfile. Keep dependency upgrades separate from feature fixes; Dependabot proposes monthly updates for review and does not merge them automatically.

## Existing checks

| Command | Scope | Requirements |
| --- | --- | --- |
| `npm test` | Syntax, update/restoration units, maintenance, launcher and bootstrap fixtures | Node, PowerShell 7 and Windows PowerShell 5.1 |
| `npm run test:browser` | Native-shell simulation, keyboard controls, stream/tray/chat, audio and broadcast fixtures | Installed Playwright Chromium |
| `npm run test:native` | Official theme/schema plus exact native Vue/virtual-list tests and management artwork | Supported TeamSpeak files; no running client needed |
| `npm run test:installer` | Compiled harmless installer fixture and isolated theme/shortcut recovery | Supported TeamSpeak files and Inno Setup 6 |

These commands call the existing suites. They do not start, stop or interact with a live TeamSpeak session. Run the scope relevant to the change; add a focused regression only when it protects a concrete behavior.

Native-component tests use `%LOCALAPPDATA%\Programs\TeamSpeak`. Set `TSIX_CLIENT_PATH` to another supported installation when needed. `TSIX_BROWSER_CHANNEL=msedge` uses installed Edge instead of Playwright Chromium. `TSIX_SCREENSHOT_DIR` selects an output folder for fixture captures. An existing Playwright module can be supplied through `TSIX_PLAYWRIGHT_MODULE`, but a normal checkout uses its local dependency.

## Source map

| Path | Purpose |
| --- | --- |
| `theme/local.tsix.layout/` | Official theme manifest, CSS and illustration |
| `tools/*-runtime.js` | Owned controls and in-memory enhancements |
| `tools/*.mjs` | Verified transport, attachment, settings recovery and updates |
| `scripts/`, `installer/` | Setup, graceful maintenance, recovery and builds |
| `tests/` | Focused fixtures, native-component checks and opt-in live checks |

Read [architecture](architecture.md) for ownership boundaries and [stream maintenance](stream-maintenance.md) for exact native contracts, failure history and regression selection. Re-audit native internals when supporting another TeamSpeak build; do not just replace the hashes.

## Local installation work

```powershell
pwsh -NoProfile -File scripts/Test-Theme.ps1
pwsh -NoProfile -File scripts/Theme.ps1 Update
pwsh -NoProfile -File scripts/Start-Layout.ps1
```

Use `Install` rather than `Update` for a first theme deployment. Refresh the selected theme after CSS changes. The development launcher attaches to an existing inspection session or starts a stopped client; it does not restart a normal active client. Finish calls before running installer or removal actions.

Setup captures its appearance baseline before activation, then selects the official theme, Compact tree and Dynamic chat formatting. Normal later launches respect appearance changes. The original shortcut and immutable helper releases are retained. Tree density changes refresh TeamSpeak's cached measurements; ordinary stream changes preserve native media/session owners.

## Live acceptance is separate

Run these only in a consenting test session. They temporarily change layout, focus or presentation and restore those choices afterward:

```powershell
node tests/layout-live.mjs
node tests/stream-controls-live.mjs --fullscreen
node tests/broadcast-live.mjs --current-size
node tests/stream-focus-live.mjs --fullscreen
```

The preview, volume and extended fullscreen scripts have their own explicit exercise flags; inspect their headers before using them. Do not run them as an unattended default suite. Verify actual advancing frames and audio when claiming playback; renderer size/DPR emulation is not physical-device acceptance. Exact coverage and remaining gaps are in [release readiness](release-validation.md) and [validation history](validation.md).

## Build locally on Windows

```powershell
pwsh -NoProfile -File scripts/Build-Release.ps1 -Installer
```

Outputs go to `dist/<version>/` by default. `-OutputDirectory` chooses another fresh directory. No existing EXE, ZIP, metadata or hash file is overwritten. The package inventory is an explicit allowlist, excluding client data, tests, development packages and private artifacts.

The build checks package contents, version/repository metadata and checksums, including the installer. It does not rerun development suites or launch TeamSpeak. Run relevant development checks before building, and smoke-test the finished installer on Windows before publishing.

When a real repository exists, build from the clean, committed checkout that you intend to tag:

```powershell
pwsh -NoProfile -File scripts/Build-Release.ps1 -Installer -ForPublication -Repository owner/repository
```

This sets both the staged updater repository and theme repository URL. The official extension schema requires a repository field, so local source retains a reserved placeholder; it must not reach a publication build. No source file is rewritten and this command does not publish anything.

## Connect the GitHub repository

Create an empty repository named `TS6-Enhanced` under your chosen GitHub account. Choose its visibility there and leave README, license and `.gitignore` initialization off; this checkout already contains them and starts with one initial commit on `main`.

```powershell
git remote add origin https://github.com/OWNER/TS6-Enhanced.git
git push -u origin main
```

Replace `OWNER` with the chosen account. Use the same `OWNER/TS6-Enhanced` value with `Build-Release.ps1 -Repository`. Keep build outputs, signing keys and `.local/` backups out of Git.

## Upload a draft release

Install [GitHub CLI](https://cli.github.com/) and sign in with `gh auth login`. Once the finished installer has been checked, tag the same commit used for the build and push it to the configured GitHub repository:

```powershell
$version = (Get-Content release.json -Raw | ConvertFrom-Json).version
git tag -a "v$version" -m "TS6 Enhanced $version"
git push origin "v$version"
pwsh -NoProfile -File scripts/Upload-Release.ps1 -WhatIf
pwsh -NoProfile -File scripts/Upload-Release.ps1
```

The upload command uses `dist/<version>/`; pass `-Directory` for a custom build folder. It rechecks the files, reads the destination from the built metadata, and uploads only the EXE, ZIP, their checksum files and `release.json`. `-WhatIf` validates and previews without contacting GitHub. The [GitHub CLI command](https://cli.github.com/manual/gh_release_create) requires an existing remote tag and creates a draft, marking preview versions as prereleases. It does not replace existing releases or assets.

Review the uploaded files and generated notes, then publish the draft on GitHub. If an upload fails, inspect the draft before retrying. The updater uses [GitHub's release API](https://docs.github.com/en/rest/releases/releases) and requires valid asset digests, compatibility metadata and complete published assets. It does not depend on GitHub Actions to build them.

## GitHub checks

Checks run on pull requests and default-branch changes. GitHub Actions does not build or publish releases; the Windows development PC produces the release files. Official actions are pinned to verified full commit SHAs; checkouts do not retain credentials and checks have read-only repository access.

The manager checks only while the managed client runs and opens no HTTP control port. New installs retain `before-install.json` through updates. Removal uses native settings APIs rather than SQLite; failure to restore stops Inno before deletion. Older installs without an original baseline are identified explicitly.

## Recovery

Use the [recipient guide](release-readme.md) for ordinary uninstall and recovery. For debugging, helper removal, theme restore and saved pane geometry are separate operations; inspect the matching tool before using it. Preserve `.local/`, installed backups and logs while investigating a failure. Never commit profiles, unredacted captures, generated installers or signing keys.
