# Distribution and persistence validation — 2026-10-09

Release: **0.4.1-preview.1**, with unchanged v0.4.0 theme/helper behavior. Supported target: Windows x64, default per-user TeamSpeak **6.0.0-beta4.1, build 1779880475**, default profile. PowerShell 7+ and Node 22+ are prerequisites.

## Completed

- `tests/persistence.ps1` exercised actual Windows shortcut files in an isolated project scratch directory: dry run, install, update, reinstall, byte-identical original backup/restoration, repeated uninstall, retention of earlier runtimes, and refusal of unowned state or independently edited shortcuts. Test shortcuts were not launched.
- The real per-user Start Menu entry was installed with an exact backup of its MSI-advertised original. Launching that entry completed automatic attachment with status `ready`; the existing TS6 main process stayed unchanged. No restart or stream action was performed. Runtime files are copied into a versioned LocalAppData directory, so the project/download directory is not a launch dependency.
- Combined setup validates installed UI resource hashes, official theme schema, theme ownership, shortcut ownership, and runtime prerequisites before installation. The helper separately verifies the loopback listener owner, main document, runtime build and selected theme before attachment.
- `tests/release.ps1` verified the built archive, 21 content-file hashes and the archive checksum. It checked package paths for personal data categories and developer absolute paths, extracted the package, ran its installer with `-WhatIf`, and confirmed that a deliberately mismatched resource fingerprint is refused without changing the real shortcut.
- The release contains 22 files including its checksum manifest. Packaging uses an explicit allowlist; no installed client bundle, personal data, screenshots, logs, shortcut backups or scratch files are included.
- PowerShell syntax checks, Node syntax checks, official schema/selector validation and whitespace checks passed. Existing theme deployment lifecycle tests passed during this work.

Artifact: `dist/TS6-Compact-Layout-0.4.1-preview.1-windows-x64.zip`. The adjacent `.zip.sha256` records its checksum. The package is unsigned and has not been published.

## Remaining acceptance work

- Full cold launch with an already selected theme, including launch timing on slower machines.
- Fresh installation, first theme selection, update and uninstall on a second Windows PC. The combined installer currently supports only the default per-user path/profile and an existing standard Start Menu shortcut.
- Multiple live streams: focus one picture, switch focus, return to grid, pagination, participant controls and aspect-ratio changes.
- Incoming playback/audio and continued playback through fullscreen/pop-out transitions. The last layout review finished with playback explicitly unverified after the source stopped sending frames.
- Physical Windows DPI changes, other appearance scales and large trees, as detailed in [the layout validation record](../validation.md).

The native multi-stream click mapping was inspected in the installed source; it was not tested with several live streams. Focus mode can retain smaller previews and does not persist a selected stream across ended sessions.

## Scope and recovery

The official theme persists through TS6's theme mechanism. JavaScript is automatically reapplied by the replaced Start Menu shortcut; it is not loaded by the theme engine. Direct EXE launches, protocol links, other shortcuts and pre-existing taskbar pins bypass attachment. Renderer reloads need another shortcut launch. Client repair/update may replace the shortcut; setup refuses to overwrite an independently changed link.

Setup does not restart an existing client. Combined uninstall requires the user to exit TS6 when idle, then restores the original shortcut and backs up the theme. Recovery/runtime history is retained. If shortcut installation fails after theme deployment, setup reports that partial result explicitly and leaves recovery available; the combined installation is not one atomic transaction.

The selected theme and user pane widths are not forced by setup. First-time theme selection is one manual action in TeamSpeak's official Appearance picker. See [the packaged guide](../release-readme.md) for exact commands.
