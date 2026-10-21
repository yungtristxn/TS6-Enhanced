# Release validation - 2026-10-11

**0.6.0-preview.3** - Windows x64 - TS6 **6.0.0-beta4.1 / build 1779880475**. Theme/stream helper: 0.6.0. Workspace helper: 0.4.0.

## Share this package

`dist/TS6-Compact-Layout-0.6.0-preview.3-windows-x64.zip` - **44,773 bytes**, 27 files, 26 content checksums plus the archive checksum. Only this final package should be shared; preview.1 and preview.2 were superseded during installer validation.

SHA-256: `7738076c38d8259d628e2713381f96989dc3d1eec45971c6a71650b11d73981f`.

Recipient flow: **Extract All > double-click Install.cmd**. Setup downloads missing runtimes, installs the official theme and managed shortcut, selects the theme and Compact tree, and attaches the helpers. A normally running client is never closed: setup waits for its user to exit when ready.

The ZIP contains only source/runtime installation files, theme assets, README, MIT license and checksums. It excludes downloaded runtimes, account/profile data, client binaries, tests, logs, screenshots, and recovery copies.

## Installer verification

- The exact final ZIP was extracted to a folder containing spaces and run through its `Install.cmd` entry point. It completed local update and automatic native theme activation; the loaded CSS release sentinel and runtime both reported 0.6.0.
- Windows PowerShell 5.1 bootstrap tests passed verified extraction, cache reuse, corrupt-download/cached-executable refusal, executable path containment and package tampering rejection.
- Both real pinned portable runtimes were downloaded from the official sources, SHA-256 checked, executed and reused from an isolated project cache. PowerShell 7.4.20 passed the schema audit, shortcut tests and launcher tests. Node 22.23.3 passed its executable/syntax check. A second-PC environment with no preinstalled tools has not been exercised end-to-end.
- First-launch argument tests passed under both development and downloaded PowerShell: `--setup` reaches Node as one argument; successful activation writes a marker, subsequent starts omit the flag, and errors preserve retry behavior and report their cause.
- Shortcut tests passed update/recovery, saved executable paths, byte-identical original restoration, metadata-only repair, and rejection of changed launch fields/flags. Deployment tests passed theme backups, restore/uninstall, ownership collisions, linked-path refusal, and unrelated-theme preservation.
- Exact archive inventory, all file/archive hashes, extracted-package dry run and unsupported-client refusal passed. Installed runtime/theme hashes match source; the original shortcut recovery copy remains intact.

## Rendered checks

Browser plugin unavailable; the isolated fixture ran with bundled Playwright and headless Edge at localhost, at 1322x847, 900x650 and 640x480, plus a resize to 1100x720. Viewport measurements are awaited before comparing sizes.

| Check | Result |
| --- | --- |
| Page identity, meaningful nonblank content, no error overlay | Passed |
| Browser console warnings/errors | None |
| Pointer, Enter/Space, remembered collapse/refocus/reload | Passed |
| Bottom control icon containment, 32px targets, corner hit tests | Passed |
| Fullscreen, drag, theme/pop-out state, ending streams, disposal | Passed in the synthetic fixture |
| Expanded/collapsed screenshot inspection | Passed; synthetic media only |
| Native single-stream resizing and control targets | Eight checks passed; video/media identities retained, frames advanced |

During final ZIP installation, the existing video/media object and paused state stayed unchanged, its frame count advanced, and the saved collapsed-tray choice was retained. The native bottom stream targets measured 32x32; server footer targets measured at least 36x32, with the connection indicator given 48px of total button width.

The stream subsequently left the viewer during work. A later optional single-stream test correctly refused its missing precondition; no new playback acceptance is claimed from that attempt. Final read-only checks confirmed CSS/runtime 0.6.0 and the remembered collapsed preference.

## Remaining boundaries

Several simultaneous live streams, extended incoming audio/video, fresh cold launch on a second PC, and physical Windows DPI transitions remain acceptance work. This unsigned preview has not been published to GitHub. The theme metadata keeps a reserved repository URL until a public repository is selected.

[Recipient guide](../release-readme.md) - [Development](../development.md) - [UI validation](../validation.md)

Historical releases: [0.5.1](release-v0.5.1.md), [0.5.0](release-v0.5.0.md), [0.4.1](release-v0.4.1.md).
