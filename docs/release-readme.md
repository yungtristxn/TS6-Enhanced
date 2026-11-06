# Setup

Requires Windows x64 and TeamSpeak 6 installed at `%LOCALAPPDATA%\Programs\TeamSpeak`. This release is verified with TeamSpeak 6.0.0-beta5.1.

Install TeamSpeak first, then run the TS6 Enhanced installer and click **Install**. Finish calls or streams first, as setup restarts TeamSpeak. All required runtimes are included or already part of Windows.

Open TeamSpeak normally. Enhanced loads through the original application and its existing shortcuts.

## Features

Open **TS6 Enhanced** (the sparkle button in the toolbar) to switch individual features off or on. Changes apply immediately and are kept for your Windows account:

- **Click to focus a stream**: a click focuses a stream; clicking it again returns to the grid.
- **Balanced stream grid**: every stream in the grid gets the same size, as large as the stage allows. Streams are stacked instead of placed side by side when that makes each one bigger.
- **Scroll to zoom**: scroll over a focused or fullscreen stream (or the only stream on the stage) to zoom in up to 5× on the spot under the pointer, and drag to look around while zoomed. Scroll back to zoom out, or click the zoom level shown in the corner to reset. Zoom can't add detail, so a stream gets soft beyond its own resolution.
- **Stream volume up to 300%** and **Remember volume per streamer**: your last volume for each person is reapplied when you watch them again. 100% and muting are left to TeamSpeak.
- **Slim system messages**, **Group repeated join and leave messages** and **Limit chat line length** for server and channel chats. Folded join/leave runs show a **+N more** button; TeamSpeak's own option to hide system messages still applies.
- **Poke sound** and **Flash taskbar on any poke**: every poke plays TeamSpeak's poke sound, even with message sounds off, while away or with speakers muted, and flashes the taskbar while TeamSpeak is in the background, from any server tab. TeamSpeak's own poke card is unchanged.

## When TeamSpeak updates itself

TeamSpeak installs its own updates. If it moves to a build this TS6 Enhanced release wasn't verified with, TS6 Enhanced keeps loading in **compatibility mode** instead of switching itself off:

- Everything that still starts keeps working. A feature that can't start on the new build stays off, and the Updates tab of the TS6 Enhanced dialog lists it.
- Updates keep working. As soon as a release for the new TeamSpeak build is published, it is offered as usual.
- A restart for an update keeps your window-close preference and lets TeamSpeak reopen your saved servers as it normally does at startup. Mute state and streams are restored automatically only on a verified build.

Setup also installs on a newer TeamSpeak build in compatibility mode. Only a TeamSpeak build with a different browser engine stops setup before anything changes.

## Update or uninstall

Open **TS6 Enhanced** in the toolbar. Updates are checked at startup and every six hours. **Restart and update** verifies the newest compatible release, saves the current session, restarts TeamSpeak, and restores your server/channel, mute state and matching shared streams. Audio returns before stream recovery waits. Unavailable sources remain stopped; private/group calls and other unsupported states block the automatic restart. Interrupted installations retain their queue for the next launch.

Watched streams are best-effort and may need to be rejoined manually. New mute/call choices made during recovery are preserved.

The first upgrade from 2.1.x follows that version's existing update flow. Session restoration is available for subsequent updates from 2.2 onward; finish calls and streams before the initial installer run.

If an update stays queued on versions 2.0–2.1.1, download and run the current installer once to repair automatic updates.

Choose **Uninstall…**, or remove TS6 Enhanced through Windows Installed apps. TeamSpeak restarts, Enhanced is removed, and your accounts, bookmarks and chats are kept.

## Help

Logs and recovery files are stored in `%LOCALAPPDATA%\TS6-Layout`.

If Enhanced prevents startup, close TeamSpeak and create an empty `TS6-Enhanced.disabled` file beside `TeamSpeak.exe`. TeamSpeak will then open without Enhanced. Remove that file and restart TeamSpeak to enable it again.
