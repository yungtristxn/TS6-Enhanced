# Development

Use Windows, Node 22+ and PowerShell 7. Inno Setup 6 is needed to build the installer.

## Checks

```powershell
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

| Command | Checks |
| --- | --- |
| `npm test` | Syntax, updates, restoration, bootstrap and launcher |
| `npm run test:browser` | Layout and interactions in Chromium |
| `npm run test:native` | Exact installed TeamSpeak components and theme schema |
| `npm run test:installer` | Isolated installer and shortcut recovery |

Run the checks relevant to your change. Native and installer checks need the supported TeamSpeak files; set `TSIX_CLIENT_PATH` for a custom location. These suites do not control the running client. Test real streaming and the install/update/uninstall cycle separately in an idle session before release.

## Build and upload

Build locally from the committed source you intend to release:

```powershell
pwsh -NoProfile -File scripts/Build-Release.ps1 -Installer
```

Files go to `dist/<version>/`. Existing artifacts are never overwritten; use a new version or `-OutputDirectory` for another build. Package contents, metadata and checksums are validated automatically.

For publication, add `-ForPublication -Repository yungtristxn/TS6-Enhanced`. This configures updates in the built package. Client update checks require publicly accessible release assets.

After testing the installer, use GitHub CLI (`gh auth login`) to upload a draft:

```powershell
$version = (Get-Content release.json -Raw | ConvertFrom-Json).version
git tag -a "v$version" -m "TS6 Enhanced $version"
git push origin "v$version"
pwsh -NoProfile -File scripts/Upload-Release.ps1 -WhatIf
pwsh -NoProfile -File scripts/Upload-Release.ps1
```

Use `-Directory` for a custom build folder. Review the draft and publish it on GitHub. Builds, checks and uploads are manual. This repository configures no CI or scheduled dependency updates.

## Unattended installation

Run as the signed-in Windows user. Setup has no dialogs in this mode, but still restarts TeamSpeak to activate the layout:

```powershell
$installer = Start-Process '.\TS6-Enhanced-1.0.0-Setup.exe' -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -PassThru
$installer.WaitForExit()
if ($installer.ExitCode -ne 0) { throw "Setup failed with exit code $($installer.ExitCode)" }
```

Wait for the installer process itself; `Start-Process -Wait` also waits for the TeamSpeak process it opens. Exit code 0 means setup completed; failures return a nonzero code and retain logs under `%LOCALAPPDATA%\TS6-Layout\setup-logs`. `/NORESTART` prevents a Windows reboot, not the TeamSpeak restart. The uninstaller accepts the same silent flags.

## Code boundaries

The theme is in `theme/`, client helpers in `tools/`, and installation code in `scripts/` and `installer/`. `release.json` defines the supported client and known limitations; `runtime-lock.json` pins runtime downloads.

Keep the extension ID, Inno AppId and `%LOCALAPPDATA%\TS6-Layout` storage path stable so existing installations retain their recovery data. Preserve native media ownership and the original uninstall baseline. Re-audit native adapters before changing supported-client hashes; do not patch client binaries or write to profile databases.

Keep generated files, profiles, logs and signing keys out of Git. Run focused checks and describe the user-visible change when contributing.
