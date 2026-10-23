# Setup

Requires Windows x64 and TeamSpeak 6.0.0-beta5 (build 1791901251) installed at `%LOCALAPPDATA%\Programs\TeamSpeak`.

Install TeamSpeak first, then run the TS6 Enhanced installer and click **Install**. Finish calls or streams first, as setup restarts TeamSpeak. All required runtimes are included or already part of Windows.

Open TeamSpeak normally. Enhanced loads through the original application and its existing shortcuts.

## Update or uninstall

Open **TS6 Enhanced** in the toolbar. Updates are checked at startup and every six hours. **Download update** checks for the newest release and keeps TeamSpeak open. Compatible visual changes apply immediately; other updates install after you close TeamSpeak.

Choose **Uninstall…**, or remove TS6 Enhanced through Windows Installed apps. TeamSpeak restarts, Enhanced is removed, and your accounts, bookmarks and chats are kept.

## Help

Logs and recovery files are stored in `%LOCALAPPDATA%\TS6-Layout`.

If Enhanced prevents startup, close TeamSpeak and create an empty `TS6-Enhanced.disabled` file beside `TeamSpeak.exe`. TeamSpeak will then open without Enhanced. Remove that file and restart TeamSpeak to enable it again.
