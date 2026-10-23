# Development

Use Windows x64, Node 22+, PowerShell 7, Visual Studio C++ build tools and Inno Setup 6. The installer uses the built-in Windows PowerShell 5.1; users do not need PowerShell 7 or a separate Node installation.

```powershell
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

Additional checks: `npm run test:browser`, `npm run test:native` and `npm run test:installer`. Native checks read resources from the supported TeamSpeak installation; set `TSIX_CLIENT_PATH` to inspect a copy. These suites do not install into or control the running client.

## Native integration

`native/` builds the application-local `version.dll`. It checks the supported native images and adds the bundled CSS to the verified main stylesheet response before the UI renders. Vendor files stay unchanged. JavaScript handles interactions, accessibility and maintenance; it supplies the CSS fallback when early loading is unavailable. The original TeamSpeak executable and shortcuts remain the entry points; normal startup does not open a debugging port.

Keep shared control colors, spacing and states in `theme/layout.css`. The maintenance panel retains fallback styling so update and uninstall remain usable without the theme. Tree sizing reads CSS variables and only repairs cached geometry when it differs. Live CSS updates replace the Enhanced rules while retaining native styles, media and component state.

The bundled Node helper handles update checks and maintenance through an authenticated loopback WebSocket. TeamSpeak owns its lifetime. Recovery adapters are retained only to restore preferences and shortcuts from older installations.

`release.json` defines versions, compatibility and the update repository. `runtime-lock.json` pins Node, and `native/cef.lock.json` pins the CEF SDK. Keep existing extension IDs, storage paths and recovery receipts compatible.

## Release

```powershell
pwsh -NoProfile -File scripts/Build-Release.ps1 -Installer -ForPublication
$version = (Get-Content release.json -Raw | ConvertFrom-Json).version
git tag -a "v$version" -m "TS6 Enhanced $version"
git push origin "v$version"
pwsh -NoProfile -File scripts/Upload-Release.ps1 -NotesFile .\release-notes.md
```

Files go to `dist/<version>/`. Use a new version or `-OutputDirectory` for another package. Write short release notes in the file passed to `-NotesFile`. The upload command creates a GitHub draft; publish it when ready.

Packaging downloads and verifies the pinned Node archive and CEF headers, then bundles Node, `ws` and their licenses. Pass `-CefSdkDirectory` to reuse an SDK. For the DLL alone, use `scripts/Build-Native.ps1 -SdkDirectory <path>`; add `-Test` to run the native CSS filter's chunking, integrity and fallback checks.

Use semantic versions internally: release **2.1** is `2.1.0` and tag `v2.1.0`. Update the release and theme versions in `release.json` and the version marker in `theme/layout.css` together. A stylesheet applies live only when the packaged runtime fingerprint matches; keep component version constants unchanged for CSS-only releases.

## Unattended installation

Run as the signed-in Windows user:

```powershell
$installer = Start-Process '.\TS6-Enhanced-2.1.2-Setup.exe' -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -PassThru
$installer.WaitForExit()
if ($installer.ExitCode -ne 0) { throw "Setup failed with exit code $($installer.ExitCode)" }
```

Wait for the installer process itself; `Start-Process -Wait` also waits for the TeamSpeak window it opens. Silent setup still restarts TeamSpeak. `/NORESTART` prevents a Windows reboot. The uninstaller accepts the same flags.

The updater installs queued DLL changes after TeamSpeak exits. `/TSIXDEFERRED=1` refuses to close a running client; `/TSIXNOOPEN=1` leaves it closed afterward.
