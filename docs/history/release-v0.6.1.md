# Release validation - 2026-10-11

**0.6.1-preview.1** - Windows x64 - TS6 **6.0.0-beta4.1 / build 1779880475**. Theme/stream helper: 0.6.1. Workspace helper: 0.4.0.

## Share this package

`dist/TS6-Compact-Layout-0.6.1-preview.1-windows-x64.zip` - **45,177 bytes**, 27 files, 26 content checksums plus the archive checksum. This supersedes 0.6.0-preview.3.

SHA-256: `11cd8af06d484097f4cf1b05ec61d5ddfdc00850067ec6b5b188848393009405`.

Recipient flow: **Extract All > double-click Install.cmd**. Missing runtimes are handled automatically; setup activates the theme and Compact tree and prepares the Start Menu launcher. A normally running client is never closed: setup waits for its user to exit when ready.

The explicit package inventory excludes client binaries, account/profile data, downloaded runtimes, development dependencies, tests, logs, screenshots and recovery copies.

## Incoming volume fix

The native incoming volume slider was collapsed by a hover animation while the relocated view/pop-out buttons occupied the same left-side space. The idle participant name also overlapped the persistent strip. The slider now retains a usable track, the stage reserves a separate right-side area for view/pop-out, and the idle name sits above the strip. Native audio handlers and fullscreen presentation are retained.

- The synthetic browser fixture passed focused, preview, grid and collapsed incoming controls at 1322x847, 900x650 and 640x480, plus a single stream at 360x540. Endpoint drags, value-bubble containment, button/track hit areas, mute Enter/Space and retained focus/media identities passed with no console warnings or errors.
- Existing remembered tray, reload, restricted-storage, fullscreen, drag, theme/pop-out state, disposal and resize regressions passed. Rendered synthetic screenshots were inspected.
- A real incoming stream passed five temporary renderer size/DPR combinations: 1322x847/1, 1100x720/1.25, 900x650/1.5, 1920x1080/1 and 960x540/2. The original view was restored. Eight live stage checks passed, including retained video/media objects and advancing decoded frames. The native mute and volume values stayed unchanged throughout. Live audio was not adjusted; drag/mute interactions were exercised only in the isolated fixture.

## Exact package and local installation

- The final ZIP passed its exact inventory, all file/archive hashes, extracted installer dry run and unsupported-client refusal. The bundled official manifest schema and all 49 observed selector classes passed static validation; modified JavaScript syntax and Git whitespace checks passed.
- The same ZIP was extracted into a folder containing spaces and installed through its `Install.cmd` entry point. Setup completed and automatically loaded CSS/runtime 0.6.1, with the temporary preview stylesheet removed.
- Final installed checks found a 138px unobscured native volume track, all five controls hit-testable with contained icons, and the idle name above the strip. The original video/media, paused state, mute/volume and saved collapsed choice remained unchanged, and decoded frames advanced during installation.
- All eight installed launcher/runtime files and three theme files match source hashes. The first-activation marker exists and the original shortcut backup matches its recorded hash.
- The bootstrap and runtime-download implementation is unchanged from 0.6.0-preview.3. Its Windows PowerShell 5.1, pinned portable-runtime downloads/cache checks, launcher, deployment and shortcut recovery results are recorded in [the prior release evidence](release-v0.6.0.md).

## Remaining boundaries

A short incoming-playback observation does not establish extended audio/video reliability. Several simultaneous live streams, active pop-out playback, a fresh cold launch on a second PC and physical Windows DPI transitions remain acceptance work. This unsigned preview remains local; it has not been published to GitHub. The theme metadata retains a reserved repository URL until a public repository is selected.

[Recipient guide](../release-readme.md) - [Development](../development.md) - [UI validation](../validation.md)
