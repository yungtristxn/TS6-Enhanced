# Release validation — 2026-10-11

**0.5.0-preview.1** · Windows x64 · TS6 **6.0.0-beta4.1 / build 1779880475**. Theme and stream helper: 0.5.0; unchanged workspace helper: 0.4.0.

## Verified locally

- Installed `main.js` and `main.css` hashes still match the supported resource fingerprints.
- Official manifest schema, local assets, SVG structure, and **41** observed native selector classes pass. Both theme validation paths resolve the draft-07 dialect locally.
- Deployment tests pass dry-run, install, update with backups, restore including hidden files, uninstall, repeated uninstall, unowned collision/junction refusal, and preservation of an unrelated theme. All writes were to isolated project scratch directories.
- Shortcut tests pass dry-run, copied runtime hashes, hidden launcher configuration, repeat update/reinstall, retained releases, exact original restoration, and independently edited shortcut/collision refusal. Test shortcuts were not launched.
- Stream tray browser tests pass at three viewports, with inspected screenshots and no console warnings/errors. [Scope and remaining live checks](../validation.md).
- The ZIP contains **22 files**, including 21 content hashes and its integrity manifest. Inventory, private-path exclusions, every file checksum, and the archive checksum pass.
- PowerShell/Node syntax, Markdown links, and Git whitespace checks pass.

Artifact: `dist/TS6-Compact-Layout-0.5.0-preview.1-windows-x64.zip`. SHA-256:

`a7a281e90ea416d2d65857dae76f78e93df26f28468cad6888d9aac31f2fe5d7`

The ZIP is unsigned and has not been published. The builder packages only an explicit source allowlist and excludes client files, profiles, logs, screenshots, shortcuts, and recovery state.

## Existing local installation conflict

The extracted package's real `Install.ps1 -WhatIf` preflight passed client/schema checks, then correctly refused because the installed TeamSpeak Start Menu shortcut differs from its recorded hash. The shortcut was left untouched. This run therefore does **not** establish a successful install/update against that existing installation.

Archive integrity can be checked independently with `tests/release.ps1 -PackageOnly -ArchivePath <zip>`. The normal full test still requires a compatible client and a shortcut whose ownership state is valid; no ownership checks were relaxed.

## Release boundaries

Multiple live TS6 streams, incoming audio/video continuity, full cold launch, second-PC installation, and physical Windows DPI transitions remain acceptance work. The helper and theme were prepared locally, not deployed to the user's running client.

The theme manifest retains a reserved repository URL until the public owner/repository is selected. Replace it and rebuild before publication. [Development and publication steps](../development.md) · [Installation and recovery](../release-readme.md)

The [previous release record](release-v0.4.1.md) preserves historical running-client attachment and packaging evidence. It does not validate the new tray.
