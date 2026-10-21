# Setup

Requires the standard per-user Windows x64 installation of **TeamSpeak 6.0.0-beta5, build 1791901251**, using its default profile.

## Install

Finish any calls or streams, run **Setup.exe**, and click **Install**. Setup may restart TeamSpeak and downloads missing runtimes automatically. No administrator access is needed.

After installation, open TeamSpeak from the **Start Menu**. Direct EXE launches, protocol links and existing taskbar pins bypass the helper.

## Update or uninstall

Open **TS6 Enhanced** in the toolbar. It checks GitHub for new previews at startup and every six hours; **Check for updates** checks immediately. Updates preserve your appearance choices and restart TeamSpeak after confirmation.

Choose **Uninstall…**, or remove TS6 Enhanced through Windows Installed apps. Removal restores the saved appearance and original shortcut while keeping accounts and chats. Older development installs without a saved baseline disable the theme and retain current preferences.

## Recovery

If removal fails, the maintenance tools and backups are retained. Open the TeamSpeak window, finish any dialogs or exit from its tray, then retry. Logs and recovery files are under `%LOCALAPPDATA%\TS6-Layout`; they may contain private information.

You can start the ordinary client directly from `%LOCALAPPDATA%\Programs\TeamSpeak\TeamSpeak.exe`. Use a compatible release if setup reports an unsupported client build.

If TeamSpeak updates first, use its native Appearance settings to disable the theme and launch the client directly. Automatic restoration needs a helper compatible with that build; rerunning an older installer will not bypass the compatibility check.

This is an unsigned community preview. Known limitations are listed in `release.json`.
