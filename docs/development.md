# Development

Use Windows x64, Node 22+, PowerShell 7, Visual Studio C++ build tools and Inno Setup 6. The installer uses the built-in Windows PowerShell 5.1; users do not need PowerShell 7 or a separate Node installation.

```powershell
npm ci --ignore-scripts
npx playwright install chromium
npm test
```

Run `npm run format` after editing `tools/`; `npm run format:check` verifies it. Additional checks: `npm run test:browser`, `npm run test:native` and `npm run test:installer`. Native checks read resources from the supported TeamSpeak installation; set `TSIX_CLIENT_PATH` to inspect a copy. These suites do not install into or control the running client.

The start-stream dialog and source picker retain their native layout and controls. The sharing bar forwards navigation/settings to the native stream manager and pause/stop to the original session, including when the preview is hidden. `tests/stream-launch.mjs` renders the supported client's Vue/template/CSS to check that attaching the helper leaves the launch flow unchanged and verifies the manager handlers; `tests/broadcast.mjs` covers synthetic action, keyboard, lifecycle and geometry regressions. Neither test establishes live audio/video acceptance.

## Native integration

`native/` builds the application-local `version.dll`. It checks the supported native images and adds the bundled CSS to the verified main stylesheet response before the UI renders. Vendor files stay unchanged. JavaScript handles interactions, accessibility and maintenance; it supplies the CSS fallback when early loading is unavailable. The original TeamSpeak executable and shortcuts remain the entry points; normal startup does not open a debugging port.

Keep shared control colors, spacing and states in `theme/layout.css`. The maintenance panel retains fallback styling so update and uninstall remain usable without the theme. Tree sizing reads CSS variables and only repairs cached geometry when it differs. Styles are embedded in the DLL; every update installs the complete package through the confirmed restart flow.

Owned sharing controls use an explicit component scope so a late-loading older Enhanced stylesheet cannot shrink the current card. While native Enhanced is active, the renderer suspends only the selected `local.tsix.layout` legacy user stylesheet; it keeps the saved preference and restores the original media attribute on theme changes or cleanup. Other custom themes retain their normal precedence. `tests/broadcast-css.mjs` checks native CSS/fonts, late legacy rules, pane widths, UI scales and device pixel ratios; `tests/native-runtime.mjs` checks legacy-theme lifecycle and recovery.

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

Files go to `dist/<version>/`. Use a new version or `-OutputDirectory` for another package. Write short release notes in the file passed to `-NotesFile`. The upload command creates a GitHub draft with five assets: installer, ZIP, their SHA-256 receipts, and release metadata. Publish it after verifying the uploaded hashes.

Packaging downloads and verifies the pinned Node archive and CEF headers, then bundles Node, `ws` and their licenses. Pass `-CefSdkDirectory` to reuse an SDK. For the DLL alone, use `scripts/Build-Native.ps1 -SdkDirectory <path>`; add `-Test` to run the native CSS filter's chunking, integrity and fallback checks.

Use semantic versions internally: release **2.2** is `2.2.0` and tag `v2.2.0`. Update `release.json` and the version marker in `theme/layout.css` together; native payload generation rejects a mismatch. No separate theme version, live-CSS asset or runtime fingerprint is needed. The optional `tools/client.mjs` diagnostic CLI stays in the repository, outside the installer payload.

## Unattended installation

Run as the signed-in Windows user:

```powershell
$installer = Start-Process '.\TS6-Enhanced-2.2.0-Setup.exe' -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -PassThru
$installer.WaitForExit()
if ($installer.ExitCode -ne 0) { throw "Setup failed with exit code $($installer.ExitCode)" }
```

Wait for the installer process itself; `Start-Process -Wait` also waits for the TeamSpeak window it opens. Silent setup still restarts TeamSpeak. `/NORESTART` prevents a Windows reboot. The uninstaller accepts the same flags.

Confirmed updates install immediately using `Restart-Update.ps1`. The retained queue is a recovery mechanism. If an installation attempt is interrupted, the native loader checks the queue before creating the next main window. A separate Windows PowerShell worker validates the installer, holds the lifecycle lease, waits for that startup process to exit, retries the install, verifies the installed receipt and file hashes, then reopens TeamSpeak with its original arguments. A failed retry retains the queue and opens the previous client once, avoiding a restart loop. Duplicate launches do not retry against an existing main window. No shortcuts or vendor files are replaced.

`/TSIXDEFERRED=1` refuses to close a running client; `/TSIXNOOPEN=1` leaves it closed afterward. `tests/startup-update.ps1` exercises the production startup gate and worker with disposable client/installer executables, including forced installer termination and a successful retry on the next launch. These fixtures do not simulate power loss during arbitrary file replacement or certify a damaged/missing loader; ownership/hash failures retain the queue for repair.

## Confirmed update session recovery

The update confirmation explains the disconnect and restart. After downloading and verifying a target that advertises `updates.sessionRestore: 1`, the manager requests a fresh renderer snapshot and saves it with Windows DPAPI for the current user. The worker acquires the lifecycle lease and verifies the installer before announcing readiness. Only then does the renderer briefly block UI and native hotkey input, recheck the session, prepare the close preference and verify the snapshot again. The manager arms that exact journal and sends the worker its final commit. A changed session, rejected commit, parent EOF or timeout leaves the client running. The worker closes only the matching TeamSpeak executable gracefully, applies the verified installer, checks the installed receipt and hashes, and reopens the client even if installation fails.

For Hide on Close profiles, the original `application.ignore_exit_request` value is part of the encrypted snapshot. Final preparation temporarily disables it, and cancellation or startup recovery restores it, including expired recovery. Relaunch uses `CreateProcessW` without handle inheritance and with an explicit environment that excludes maintenance capabilities. The reopened GUI client cannot keep the old updater's stderr pipe alive.

The native loader signals an existing restore record through CEF extra info before the vendor UI starts. A temporary adapter suppresses automatic connections in both settings reads and native saved-settings notifications; native saves retain the original startup preferences. The guard is released after recovery, on unsupported startup, or on timeout, using beta5's effective defaults when saved keys are absent. Server/user identities and the target channel are checked before restoring microphone state. Audio capture, microphone/speaker mute state and global mute indicators are restored immediately after connection verification, before capture-source discovery, stream joins or view restoration. The watched-stream lookup retains its existing behavior and timeout, but cannot hold the microphone muted. Input is briefly blocked only during the early asynchronous capture/voice commit, then becomes available while media recovery continues. Trusted input, native hotkeys, synchronous mute changes or a new call stop subsequent automatic restoration; already restored audio is never reapplied over those newer choices. Draft lookup is independent of the set of connections authorized for voice/media restoration. Optional view failures do not prevent voice restoration. When replay stops early (input, timeout or failure), the temporary global mute defaults are unwound unless the user changed global mute, reconnected servers receive their saved voice state if identity and channel still match (speakers only otherwise) unless the user changed that server's mute, and connections opened meanwhile lose the forced mute; otherwise later joins would inherit it. Broadcasts start paused and are resumed only after their target is checked. Window sources are also checked against their process ID and process creation time. Captured source names/IDs must still match; no fallback source is selected.

The supported restoration scope is server connections and channels, nickname, input/output mute and capture owner, away state, server-channel broadcasts and their quality/audio/access/pause/hidden settings, watched streams and volume/mute/hidden state, focused stream, and serializable unsent text drafts. Private/group calls, chat-room sharing, fullscreen, unsent attachments, unavailable or transient application-audio selections, and password-protected channels without a restorable password stop preparation before restart. A stopped remote stream or unavailable server/source is reported rather than replaced. Popup window geometry is not restored by this adapter.

The automatic replay expires after ten minutes and is claimed once before restoration. Repeated transport messages resend the same result instead of replaying actions. Successful completion removes the protected record. Unrecovered drafts move to independent encrypted records in `draft-recovery`, freeing the active update transaction. These records retain the protected snapshot bytes; their metadata contains only IDs, phases and pending draft indices. Later renderers receive only draft recovery data, without reconnect passwords or media settings. Partial draft acknowledgements are durable and retried across transport reconnects; recovering text never authorizes microphone or broadcast replay. Journal deletion records a clearing phase before removing files, and startup completes interrupted cleanup, including legacy metadata whose data file is already absent. The snapshot is not written to logs or the profile database.

Same-version repair queues use the confirmed restart flow too, including interrupted installations whose running version already matches the target while `fromVersion` still identifies the old release. The current release must still be published and its installer and compatibility metadata must pass the usual verification. A withdrawn release or corrupt download cannot start maintenance.

Validation: `session-runtime.mjs` uses a recording bridge and compares outbound IPC payloads with the supported client's actual methods; it also covers rejected own identities, failed view navigation, timeout cleanup and independent passive draft watches. `session-guard.mjs` checks native saved-settings notifications and omitted-key defaults against the pinned beta5 bundle. `session-state.test.mjs` covers one-use/expiry, interrupted cleanup, separate draft transactions, partial acknowledgements and real Windows DPAPI. `session-update.test.mjs` checks the authenticated save/prepare/install/restore handshake, same-version repair and new updates while drafts remain pending; `native-runtime.mjs` checks transport retry. These are not live server, remote-owner approval, physical microphone, audio routing, or capture acceptance. A local live test confirmed reconnect, the user's shared stream and audio state; watched-stream rejoin failed and remains best-effort. Faster audio ordering and later cleanup have regression coverage, without a repeat live restart.

The voice-priority regressions hold source discovery and watched-stream joins pending and assert that audio and input availability have already recovered. They also cover a missing watched stream's deadline, delayed native mute-state notifications, previously muted sessions, rejected channels/identities, and newer user mute/call choices after early audio recovery.

`tests/restart-update.ps1` compiles a disposable GUI-subsystem client with a transparent off-screen window and an installer stand-in, then runs the unmodified production `Restart-Update.ps1`, `Native-Setup.ps1` and lifecycle/launch helpers under an isolated `LOCALAPPDATA`. It covers final-commit refusal, parent EOF, concurrent workers, Hide on Close preparation, installer verification/failure/interruption, refused shutdown, and worker completion while the reopened client remains alive. `session-runtime.mjs` uses the pinned native Vue runtime to test synchronous intent cancellation and both short input-blocking phases. No test targets the installed client or its profile.
