# Release validation - 2026-10-11

**0.6.2-preview.1** - Windows x64 - TS6 **6.0.0-beta4.1 / build 1779880475**. Theme/stream helper: 0.6.2. Workspace helper: 0.4.0.

## Share this package

`dist/TS6-Compact-Layout-0.6.2-preview.1-windows-x64.zip` - **45,770 bytes**, 27 files, 26 content checksums plus the archive checksum. This supersedes 0.6.1-preview.1.

SHA-256: `07e98bfc6c44f6ba59d7469bd468a42c1d45d849a1d77b8fafc0fdff9eaad74d`.

Recipient flow remains **Extract All > double-click Install.cmd**. Missing runtimes are handled automatically. The package excludes account/profile data, client binaries, downloaded runtimes, development dependencies, tests, screenshots and recovery copies.

## Control placement and sidebar

- The stream-view badge is anchored to its own button. Keyboard activation passes the button's coordinates to the native handler, so menus open beside the control rather than at the top-left of the window.
- Stage view controls form a group; the native Leave/Stop button sits at the far right with a separate gap. Incoming Leave also receives its correct label and keyboard handling. Fullscreen and ordinary multi-stream grids retain native control flow.
- Sidebar Bookmarks/Group Chats actions no longer shrink underneath the collapse chevron. Their native click targets are 24x28, with distinct spacing. Sidebar width, content scrolling and the collapsed rail are preserved. Long headings can still ellipsize in a 200px sidebar.

## Verification

- The production browser fixture passed all existing collapse, persistence, focus, volume, lifecycle and cleanup checks. It now includes the native-shaped overlay and count badge, and checks keyboard click coordinates, badge anchoring and separation between view/Leave controls. No browser console warnings or errors. Screenshots were inspected.
- Live TS6 checks passed at 2562x1394/1, 1322x847/1, 1100x720/1.25, 900x650/1.5, 800x600/1 and 640x600/1. Keyboard menus stayed beside their trigger and inside the viewport; stream controls, badges and visible sidebar actions were in bounds and hit-testable. Sidebar section targets did not overlap. A pointer collapse/expand cycle restored the original Bookmarks state. Original window/pane geometry was restored afterward.
- Eight additional live stage checks passed for picture bounds, resize, helper removal/reattachment, retained video/media objects and advancing frames. Native mute/volume stayed unchanged. No audio, Leave/Stop, folder creation or contact action was activated during live verification.
- The official manifest schema and 57 observed selector classes passed. Modified JavaScript syntax and Git whitespace checks passed.
- The exact final ZIP passed its allowlisted inventory, all content/archive hashes, extracted installer dry run and unsupported-client refusal. It was then installed through its own `Install.cmd` after extraction into a path containing spaces.
- Installed CSS/runtime report 0.6.2 with no preview stylesheet present. The badge is correctly anchored, Leave has an 11px gap from pop-out, and sidebar action hit areas are intact. The same video/media and paused state survived installation, frames advanced, and mute/volume and the saved collapse choice were preserved.
- All eight installed launcher/runtime files and three theme files match source. First activation is recorded and the original shortcut recovery copy matches its saved hash.

The installer implementation is unchanged. Portable runtime downloads/cache, Windows PowerShell 5.1 bootstrap, deployment, launcher and shortcut recovery evidence remains in [0.6.0 release validation](release-v0.6.0.md). The preceding volume fix is documented in [0.6.1 release validation](release-v0.6.1.md).

## Remaining boundaries

Several simultaneous live streams, extended audio/video reliability, active pop-out playback, fresh cold launch on a second PC and physical Windows DPI transitions remain acceptance work. Synthetic streams and renderer DPR emulation do not replace those checks. This unsigned preview remains local and has not been published to GitHub.

[Recipient guide](../release-readme.md) - [Development](../development.md) - [UI validation](../validation.md)
