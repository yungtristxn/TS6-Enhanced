Historical 0.7.0 evidence; this does not describe the current release.

# Release validation - 2026-10-12

**0.7.0-preview.1** - Windows x64 - TS6 **6.0.0-beta4.1 / build 1779880475**. Theme: 0.7.0. Workspace helper: 0.5.0. Stream helper remains 0.6.2.

## Share this package

`dist/TS6-Compact-Layout-0.7.0-preview.1-windows-x64.zip` - **50,195 bytes**, 27 files, 26 content checksums plus the archive checksum. This supersedes 0.6.3-preview.1.

SHA-256: `0761e08c49465d0972cac5ee606693b42a35f7d36d0b50ef97456ebe0832b6dd`.

Recipient flow: **Extract All > double-click Install.cmd**. Missing runtimes are handled automatically. The package excludes account/profile data, client binaries, downloaded runtimes, development dependencies, tests, screenshots and recovery copies.

## Unified navigation

Channels and Friends share the native tree column. The server-name selector opens connected servers and bookmarks; native Search / Connect remains available. Profile, microphone, speakers and settings share the bottom row, with native server utilities and away controls above. The current 320px tree width is retained, releasing the old 200px sidebar width to the activity. A 300px minimum protects footer targets. Native navigation resumes below 820px and outside full server views.

The native panels, tree rows and media components remain mounted. Only the tabs and server selector are new controls. Recent chat activities are shown when present; mixed custom resource stacks remain accessible. See [architecture](../architecture.md) and [design QA](../design-qa.md) for lifecycle behavior and deliberate differences from the selected concept.

## Verification

- **12 live navigator checks passed**, first with preview CSS and again after installation with the installed stylesheet: mouse/keyboard tab switching, Escape dismissal, native search focus, hit tests and non-overlapping control bounds, six viewport/DPR combinations, 300px minimum, theme-contract disable, disposal and repeated attachment. Original viewport, pane sizes and tree scroll position were restored.
- Viewports: 1672x941/1, 1322x847/1, 900x650/1.5, 820x600/1, 800x600/1 and 640x600/1, plus the original 2562x1394 desktop. The last two use native compact navigation. Friends and Servers were visually inspected at 820x600; hover-only profile actions were also visible, in bounds and hit-testable.
- **Eight existing live stream-stage checks passed** with advancing frames across their five size/DPR cases and helper removal/reattachment. During the navigator and stream test runs, native video/media identity, playback state, audio values and saved tray choice were retained. No connection, channel, message, contact or audio action was activated by these tests.
- The stream from the initial design baseline was already a different native object before installation. At the final read-only observation, no video element remained in the viewer. Therefore the test-run continuity evidence does not establish uninterrupted playback over the entire editing session; the final observation verifies layout state, not active playback.
- Official manifest schema, local assets and **77 observed selector classes** passed. Modified JavaScript syntax and Git whitespace checks passed.
- The exact final ZIP passed allowlisted inventory, all content/archive hashes, extracted installer preflight and unsupported-client refusal. Its own `Install.cmd` installed it successfully from an extracted path containing spaces, without a client restart.
- Installed state: theme 0.7.0, workspace 0.5.0, stream helper 0.6.2, exactly one navigator, no preview stylesheet, original 2562x1394 viewport and native slot sizes `[200,320,0]`. All eight installed launcher/runtime files and three theme files match source. First activation is recorded; the original shortcut recovery copy matches its saved hash.

Installer and stream implementations are unchanged. Earlier installer/download and stream-fixture evidence remains in [0.6.3](release-v0.6.3.md), [0.6.2](release-v0.6.2.md) and [0.6.0](release-v0.6.0.md). Unrelated installer/download suites were not repeated.

## Remaining boundaries

Multiple connected-server switching, several simultaneous live streams, extended audio/video reliability, active pop-out playback, fresh cold launch on a second PC and physical Windows DPI transitions remain acceptance work. Renderer DPR emulation does not replace physical scaling tests. This unsigned preview remains local and has not been published to GitHub.

[Recipient guide](../release-readme.md) - [Development](../development.md) - [UI validation](../validation.md)
