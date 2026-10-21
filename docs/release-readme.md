# TS6 Enhanced — 0.10 preview

## Install

Run the **Setup.exe** and click **Install**. No ZIP extraction, terminal, administrator access or separate Node/PowerShell install is needed. Finish calls and sharing first: setup may need to restart a normally launched TeamSpeak client.

Setup verifies **TeamSpeak 6.0.0-beta5 / build 1791901251**, installs the official theme, saves the original appearance settings and Start Menu shortcut, and activates the layout. Missing runtimes come from checksum-pinned official downloads and stay private to this installation. The client must use the standard per-user Windows x64 installation and default profile.

Afterward, open **TeamSpeak from Start Menu**. Direct EXE launches, protocol links and existing taskbar pins bypass the local helper; the theme itself still uses TeamSpeak's official loader.

## Update

The **TS6 Enhanced** settings icon in TeamSpeak's toolbar shows the installed version and update status. Configured release builds check their public GitHub repository at launch and every six hours. A notice appears for a new published release; drafts and unfinished releases are not installed.

Choose **Update and restart** when ready. The download is staged and checked against GitHub's SHA-256 digest, its version, supported TeamSpeak resource hashes and installer format before TeamSpeak is closed. Calls and streams end when you confirm the restart. There is no unattended restart, service or scheduled task.

This local preview has **no GitHub repository configured**, so update requests are disabled. Release builds can configure one without editing source; see the development guide. Publishing a release is a separate maintainer action.

## Uninstall

Use any of these:

- **TS6 Enhanced → Uninstall…** inside TeamSpeak.
- **Windows Settings → Apps → Installed apps → TS6 Enhanced → Uninstall**.
- **Uninstall TS6 Enhanced** in Start Menu.

Removal closes TeamSpeak normally, restores its original shortcut and the appearance fields changed by setup, removes the owned theme, and opens the ordinary client. Identities, bookmarks, server data, messages, other themes and unrelated preferences are kept. You do not need the installer ZIP or an open terminal.

If restoration fails, the uninstaller stops before deleting the maintenance tools. Exit fullscreen or resolve the reported problem and retry. It never force-kills TeamSpeak. Recovery backups, historical helpers and private runtimes are retained under `%LOCALAPPDATA%\TS6-Layout`.

If TeamSpeak is configured to ignore exit requests or remains in its tray, exit it from the tray and retry. Maintenance does not override that preference or kill background renderer processes.

**Older development installations:** their original appearance was not recorded. Uninstall disables this theme, restores the original shortcut and keeps current appearance preferences. It cannot reconstruct settings that were never backed up. Fresh installs save their baseline before the first activation and preserve it through updates.

## Recovery and limits

Setup and maintenance errors are in `%LOCALAPPDATA%\TS6-Layout\setup-logs`. The original appearance receipt is `before-install.json`; original shortcuts and helper versions are under `persistence`. Review logs before sharing them because they can contain local file paths.

To run the ordinary client directly, use `%LOCALAPPDATA%\Programs\TeamSpeak\TeamSpeak.exe`. If a supported-build check fails, use a release audited for that TeamSpeak build. The helpers depend on exact native internals; an unknown build is not safe to modify blindly.

The distribution is an **unsigned local preview**, not an official TeamSpeak product. The theme uses the official extension loader; the in-client controls and updates use a local helper through **127.0.0.1:9988**. No native client binary is patched, no profile database is rewritten, and no TS6AddonInstaller is required.

Local checks cover compiled installer/uninstaller orchestration with a harmless payload, restoration and ownership failures, update integrity and release selection, and the rendered management UI. Public GitHub delivery and a full installation/removal cycle on a second PC still need release acceptance. MIT licensed.
