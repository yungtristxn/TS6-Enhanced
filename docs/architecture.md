# Architecture

The current release targets TeamSpeak 6.0.0-beta5, build 1791901251. `release.json` owns release version, supported client hashes and update channel. The theme/helper version can differ from the installer version; `themeVersion` records that relationship.

## Components

| Component | Responsibility |
| --- | --- |
| `theme/local.tsix.layout/` | Official extension manifest, CSS and project-owned illustration |
| `tools/workspace-runtime.js` | Shared row measurements and scoped keyboard support for native controls |
| `tools/streams-runtime.js` | Stream layout, focus, preview tray, hidden-chat rendering, volume and sharing status |
| `tools/manager-runtime.js` | TS6 Enhanced panel, release notice and explicit maintenance confirmations |
| `tools/manager.mjs` | Update checks and a narrow command bridge in the verified main renderer |
| `tools/updates.mjs` | Release selection, repository-bound downloads, compatibility and integrity checks |
| `tools/appearance.mjs`, `tools/install-state.mjs` | Capture and restore the appearance fields and owned preferences changed by setup |
| `scripts/` and `installer/Setup.iss` | Per-user setup, managed launch, graceful maintenance, backups and distribution |

## Native ownership

TeamSpeak owns navigation, identities, bookmarks, sessions, players, media tracks and the profile database. The project retains those owners and uses the official theme loader. It does not rewrite the profile database or patch installed native binaries.

The stream helper adds owned controls and scoped adapters. Ordinary focus, preview and chat toggles retain media objects. TeamSpeak's native fullscreen can remount its player, so fullscreen acceptance follows sessions, frames and audio state instead of assuming DOM identity. Cleanup restores owned attributes, descriptors, listeners and layout inputs.

Hidden chat keeps a measurable viewport and continues rendering messages while remaining invisible and inert. The sharing badge stays inside the middle column, aligned to its left padding, above the native bottom toolbar. Detailed constraints, prior defects and exact native-module regression coverage are in [stream maintenance](stream-maintenance.md).

## Launch and transport

The original Start Menu shortcut is saved byte-for-byte. The managed shortcut points at an immutable helper release under `%LOCALAPPDATA%\TS6-Layout\persistence\releases`. A normal managed launch respects later appearance choices; setup activation selects the theme and its initial preferences.

CDP is restricted to loopback port 9988. Before renderer access, the helper verifies the owning executable, origin, main-window context and supported build. Pop-outs are separate contexts. Direct EXE/protocol/taskbar launches bypass helper attachment. No Windows service or scheduled task is installed.

## Updates and removal

The manager runs only while the managed client runs. It checks a configured public GitHub repository at launch and every six hours. Only newer published releases in the selected channel qualify. Metadata, asset URL, size, SHA-256 digest, Windows installer format and supported client hashes are checked before restart. Local builds leave the repository unset.

The UI invokes only check, update and uninstall operations through a nonce-bound binding in the main execution context. No local HTTP control server is exposed. Update and removal require explicit confirmation. Maintenance requests graceful closure of the main window; renderer subprocesses are not closed individually or force-killed.

`before-install.json` saves only setup-owned appearance fields and the two layout preferences before first activation. Updates retain that original baseline. Native APIs restore it during uninstall, along with the original shortcut. Legacy installs are marked explicitly because unrecorded original settings cannot be reconstructed. Recovery history is retained.

The Inno uninstaller stops before deleting maintenance tools when restoration fails. Theme deployment has a recovery checkpoint for a later shortcut-installation failure. These safeguards do not replace a full install/update/uninstall acceptance run on a clean supported client.

## Distribution and evidence

The builder uses an explicit allowlist. Client binaries, profiles, development dependencies, test screenshots, logs and recovery files are excluded. Publication builds set the updater and theme repository together, require an installer, and refuse existing output artifacts. Local Windows builds validate the package; the separate upload command creates a GitHub draft for manual review. GitHub Actions runs development checks only.

TS6 Enhanced keeps the original Inno AppId, `local.tsix.layout` extension ID, `%LOCALAPPDATA%\TS6-Layout` data directory, ownership markers and helper preference keys. These are compatibility identifiers: changing them would separate existing installs from their original settings and shortcut backups. The visible theme name is TS6 Enhanced; baseline capture recognizes both the old and new names.

[Release readiness](release-validation.md) separates portable checks, native-component checks and live acceptance. [Historical architecture notes](history/architecture-through-v0.9.4.md) preserve earlier implementations; superseded navigation and layout descriptions are not the current contract.
