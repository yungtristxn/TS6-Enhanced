# Setup

Requires Windows x64 and TeamSpeak 6.0.0-beta5 (build 1791901251) installed at `%LOCALAPPDATA%\Programs\TeamSpeak`.

Install TeamSpeak first, then run the TS6 Enhanced installer and click **Install**. Finish calls or streams first, as setup restarts TeamSpeak. All required runtimes are included or already part of Windows.

Open TeamSpeak normally. Enhanced loads through the original application and its existing shortcuts.

## Update or uninstall

Open **TS6 Enhanced** in the toolbar. Updates are checked at startup and every six hours. **Restart and update** verifies the newest compatible release, saves the current session, restarts TeamSpeak, and restores your server/channel, mute state and matching shared streams. Audio returns before stream recovery waits. Unavailable sources remain stopped; private/group calls and other unsupported states block the automatic restart. Interrupted installations retain their queue for the next launch.

Watched streams are best-effort and may need to be rejoined manually. New mute/call choices made during recovery are preserved.

The first upgrade from 2.1.x follows that version's existing update flow. Session restoration is available for subsequent updates from 2.2 onward; finish calls and streams before the initial installer run.

If an update stays queued on versions 2.0–2.1.1, download and run the current installer once to repair automatic updates.

Choose **Uninstall…**, or remove TS6 Enhanced through Windows Installed apps. TeamSpeak restarts, Enhanced is removed, and your accounts, bookmarks and chats are kept.

## Help

Logs and recovery files are stored in `%LOCALAPPDATA%\TS6-Layout`.

If Enhanced prevents startup, close TeamSpeak and create an empty `TS6-Enhanced.disabled` file beside `TeamSpeak.exe`. TeamSpeak will then open without Enhanced. Remove that file and restart TeamSpeak to enable it again.
