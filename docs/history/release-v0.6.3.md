# Release validation - 2026-10-11

**0.6.3-preview.1** - Windows x64 - TS6 **6.0.0-beta4.1 / build 1779880475**. Theme: 0.6.3. Workspace helper: 0.4.1. Stream helper remains 0.6.2.

## Share this package

`dist/TS6-Compact-Layout-0.6.3-preview.1-windows-x64.zip` - **46,509 bytes**, 27 files, 26 content checksums plus the archive checksum. This supersedes 0.6.2-preview.1.

SHA-256: `514c13080b60266efb71b8253031997ba78ec86b3fb789aedd846e46fe6a0dcf`.

Recipient flow remains **Extract All > double-click Install.cmd**. Missing runtimes are handled automatically. The package excludes account/profile data, client binaries, downloaded runtimes, development dependencies, tests, screenshots and recovery copies.

## Sidebar changes

- Hide the community promotion and standalone Group Chats section. Bookmarks, contacts, active server/chat entries and the server channel tree remain available. The activity area shrinks with the promotion; no empty placeholder remains.
- Group Chats is identified by its native section key, including collapsed/combined-header rendering. Mixed custom stacks are deliberately retained so their other sections remain reachable. Theme disable and helper disposal restore the prior owned attribute.
- Reduce nested footer padding and the avatar/name gap. Preserve native profile actions, a separate 28x32 edit target and a 32px-wide settings target. The current username fits fully in the unchanged 200px sidebar. Longer names can still ellipsize.

## Verification

- Live sidebar checks passed at 2562x1394/1, 1322x847/1, 900x650/1.5 and 640x600/1, including an expanded/collapsed/expanded cycle. Requested sections were hidden, retained navigation remained mounted, visible footer targets were in bounds and hit-testable without overlaps, and the current name fit whenever expanded. Native hover-to-reveal edit behavior was tested after hovering. Original pane sizes, viewport and sidebar scroll position were restored.
- Temporary adapter fixtures exercised standalone versus mixed resource stacks, transition to a mixed stack, restoration of existing attributes, theme disable, disposal and reattachment. No account resource collections were changed. CSS reversal restored the native promotion and group visibility.
- Preview and installed sidebar captures were inspected. All 12 server-tree rows remained mounted. The existing video/media objects, paused state, native audio values and saved tray choice survived testing and installation; video frames advanced. No stream, message, contact, folder or audio action was activated.
- The official manifest schema and 65 observed selector classes passed. Modified JavaScript syntax and Git whitespace checks passed.
- The exact final ZIP passed its allowlisted inventory, all content/archive hashes, extracted installer dry run and unsupported-client refusal. It was installed through its own `Install.cmd` after extraction into a path containing spaces.
- Installed CSS reports 0.6.3 and the workspace helper reports 0.4.1, with no preview stylesheet present. The requested sections are hidden and the current username fits. All eight installed launcher/runtime files and three theme files match source. First activation is recorded and the original shortcut recovery copy matches its saved hash.

Stream code and installer behavior are unchanged. Their preceding checks remain in [0.6.2 release validation](release-v0.6.2.md) and [0.6.0 release validation](release-v0.6.0.md). This pass did not repeat unrelated installer/download or stream fixture suites.

## Remaining boundaries

Several simultaneous live streams, extended audio/video reliability, active pop-out playback, fresh cold launch on a second PC and physical Windows DPI transitions remain acceptance work. Renderer DPR emulation does not replace those checks. This unsigned preview remains local and has not been published to GitHub.

[Recipient guide](../release-readme.md) - [Development](../development.md) - [UI validation](../validation.md)
