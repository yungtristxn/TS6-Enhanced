# Release validation — 2026-10-11

**0.5.1-preview.1** · Windows x64 · TS6 **6.0.0-beta4.1 / build 1779880475**. Theme and stream helper: 0.5.1; unchanged workspace helper: 0.4.0.

## Shareable artifact

`dist/TS6-Compact-Layout-0.5.1-preview.1-windows-x64.zip` — **35,993 bytes**, 20 files. Contains only the required setup/runtime files, theme assets, recipient README, MIT license, and integrity manifest. Optional development CLIs, tests, client files, profiles, logs, screenshots, and recovery state are excluded.

SHA-256: `dc9e89ab658c5ce763d43b69774f42a76631b2a0251fbc03974e8bad7fc4e945`.

## Completed checks

- Official manifest schema, SVG/assets, **41** observed selector classes, and supported UI resource hashes pass.
- Browser regression suite passes at 1322×847, 900×650 and 640×480, plus a resize to 1100×720. Saved collapsed/expanded choices survive grid/refocus, helper reattachment and renderer reload. Unrelated storage stays unchanged; restricted storage falls back to memory. Focus, keyboard, fullscreen, drag, pop-out state, ended streams, navigation and disposal checks also pass with no console warnings/errors.
- Isolated shortcut tests pass install/update, runtime-copy verification, original-byte restoration, and retained recovery history. Explicit metadata repair preserves the observed shortcut; dry runs write nothing. Changed user-visible fields and execution flags are still refused.
- Exact minimal archive inventory and all **19 content hashes** plus the ZIP checksum pass. The extracted installer passes real-client `-WhatIf`; a deliberately mismatched client fingerprint is refused without changing the real shortcut.
- PowerShell/Node syntax, local Markdown links, and whitespace checks pass. Existing theme deployment/backup tests passed for the unchanged theme deployment implementation in the preceding preview.

## Installed and attached locally

The exact recipient package was used to update the existing installation with `-Update -RepairShortcut`. Installed theme/runtime hashes match the package. The observed shortcut was preserved in history, the original shortcut recovery copy was retained, and the same TS6 inspection process stayed running.

The installed **0.5.1** stream helper was attached through the verified main-window connection. One existing video and its media object remained identical, its paused state was unchanged, and its frame count advanced during the observation. No stream controls, restart, connection changes or account data were involved. This proves a successful single-stream attachment; it is not a several-stream playback acceptance test.

## Remaining boundaries

Several simultaneous live streams, extended incoming audio/video continuity, cold launch and installation on a second PC, and physical Windows DPI transitions remain acceptance work. The ZIP is an unsigned preview. It is ready to share directly for testing; it has not been published to a remote repository.

The theme metadata still contains a reserved repository URL pending selection of a public repository. [Recipient setup guide](../release-readme.md) · [Development](../development.md) · [Detailed UI validation](../validation.md)

Historical evidence: [0.5.0](release-v0.5.0.md), [0.4.1](release-v0.4.1.md).
