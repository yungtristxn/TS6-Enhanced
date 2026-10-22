# Development

Use Windows, Node 22+, PowerShell 7 and Inno Setup 6.
The installer and installed helpers use Windows PowerShell 5.1; PowerShell 7 is only used for development checks and packaging.

```powershell
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

Additional checks: `npm run test:browser`, `npm run test:native` and `npm run test:installer`. Native checks require the supported TeamSpeak installation; use `TSIX_CLIENT_PATH` for a custom location.

## Release

```powershell
pwsh -NoProfile -File scripts/Build-Release.ps1 -Installer -ForPublication
$version = (Get-Content release.json -Raw | ConvertFrom-Json).version
git tag -a "v$version" -m "TS6 Enhanced $version"
git push origin "v$version"
pwsh -NoProfile -File scripts/Upload-Release.ps1
```

Files go to `dist/<version>/`. Use a new version or `-OutputDirectory` for another package. The upload command creates a GitHub draft; publish it when ready.
The Start Menu uses a fixed launcher path that resolves the current installed helper release. Shortcut changes also notify Windows Shell.
Packaging downloads the pinned Node archive into `.local/runtime-cache`, verifies its SHA-256, and includes only `node.exe` and its license. Setup uses the bundled runtime without a download or PATH changes.
The separate stylesheet can apply live only when the packaged runtime fingerprint matches. Keep helper version constants unchanged for CSS-only releases; bump `release.json`, `themeVersion`, the theme manifest and its CSS version marker together.

## Unattended installation

Run as the signed-in Windows user:

```powershell
$installer = Start-Process '.\TS6-Enhanced-1.0.6-Setup.exe' -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -PassThru
$installer.WaitForExit()
if ($installer.ExitCode -ne 0) { throw "Setup failed with exit code $($installer.ExitCode)" }
```

Wait for the installer process itself; `Start-Process -Wait` also waits for the TeamSpeak window it opens. Silent setup still restarts TeamSpeak. `/NORESTART` prevents a Windows reboot. The uninstaller accepts the same flags.
The in-client updater queues installation for the next managed launch. Its `/TSIXDEFERRED=1` installer mode refuses to close a running client. Updaters from 1.0.3 and earlier still restart TeamSpeak for the upgrade that installs this behavior.

## Source

`theme/` contains the theme, `tools/` the client helpers, and `scripts/` the installation code. `release.json` defines compatibility and updates; `runtime-lock.json` pins the bundled Node version.

Keep extension IDs, storage paths and recovery data compatible with existing installations.
