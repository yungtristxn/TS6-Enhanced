# Changelog

## 0.10.0-preview.4 — TS6 Enhanced

- Rename the product, theme, management panel and release files to TS6 Enhanced. Retain installation identifiers and saved recovery state for existing development installs.
- Build release installers locally on Windows and upload validated files as a GitHub draft. Keep pull-request checks separate from release packaging.

## 0.10.0-preview.3 — release preparation

- Pin the tested development dependency and provide short commands for the existing core, browser, native-component and installer checks.
- Add ordinary CI and separate read-only build jobs from draft-release publication. Pin official GitHub Actions to verified commits.
- Configure the updater and theme repository together in publication builds. Require a repository and installer for publication, and refuse overwriting release metadata or artifacts.
- Remove machine-specific test paths, refresh the public documentation, preserve historical evidence, and add concise contribution templates.

## 0.10.0-preview.2 — management UI polish

- Replace the text toolbar entry with TeamSpeak's native settings icon, an accessible label and a stable update indicator.
- Reduce the main panel to version, update status and relevant actions. Move restoration details to the uninstall confirmation and technical errors into an optional disclosure.
- Use action-specific confirmation titles, focus Cancel by default, restore focus on cancellation, and keep restart consequences explicit. Escape returns from a confirmation before closing the panel.

## 0.10.0-preview.1 — local installer preview

- Add a per-user single-file setup EXE, retained uninstaller, Windows Installed apps entry and Start Menu removal shortcut.
- Add a Layout panel inside TeamSpeak with release status, automatic checks, a once-per-release notice, explicit update-and-restart confirmation and uninstall.
- Stage and verify published GitHub assets before restarting; reject drafts, incomplete releases, checksum failures, foreign asset URLs and incompatible TeamSpeak builds. The local build has no repository configured.
- Save the pre-install appearance and owned layout preferences before activation. Restore them through native settings on removal while preserving personal data; explicitly identify older installs without a baseline.
- Keep maintenance tools when restoration fails, use graceful shutdown of the main window only, and retain recovery copies. Add an isolated compiled installer/uninstaller smoke test and focused update, restore, UI and process-identity checks.

## Unreleased — 0.9.4-dev.2

- Align the sharing badge with the middle column's left padding. Keep hidden chat measured and updating so new messages are ready on reopening, while excluding its invisible controls from keyboard navigation.
- Replace the full-width sharing strip with a compact badge in the middle column, above Start Stream. Keep native panes at full height and the video/chat workspace clear; viewer details open above the badge within its column. Fullscreen uses the same compact badge in the top-right corner.
- Put stream view actions in the bottom control strip. Keep a single pop-out action, using the player's native button when available; remove the detached right-edge copies.
- Give unopened previews the same picture/control-strip division as playing streams, within their existing shared frame. Reserve a footer in grid mode so it cannot cover chat.
- Preserve native Vue ownership while forwarding visible button ownership and coordinates to native menus. Keep Escape available to dismiss menus.
- Verify control edges, icon bounds, keyboard menu opening/dismissal, viewport containment, idle reconciliation and cleanup. Native self-stream resizing/fullscreen and isolated unopened/playing comparisons are recorded separately in the [review](docs/stream-controls-review-2026-10-15.md).

## 0.9.4-dev.1

- Give unopened and playing streams the same stage geometry. Remove the separate preview card budget and centered-card layout; keep the existing chat reservation in both states.
- Group native view settings and pop-out beside the upper-right stage edge in bounded buttons. Keep the preview-tray handle clear of that group.
- Add a visible native-action Watch stream button with pointer/keyboard support, restrained avatar sizing and automatic cleanup when joining or disabling the helper.
- Replace preview-cap assertions with direct unopened/playing frame comparisons and control-proximity checks. Eight native comparisons and ten single-stream browser combinations pass, including chat access, joining and draft preservation.

## 0.9.3-dev.1

- Replace the fixed 260 px unopened-preview cap with a responsive budget based on pane height and display density. Preserve native content-sized, proportional cards.
- Center unopened previews in the available pane when chat is hidden. With chat shown, keep cards bounded above the composer.
- Add native preview checks at four sizes with both chat states, plus browser checks for minimum useful size, aspect ratio, centering and multiple unopened cards. Preserve the current playback/audio state after testing.

## 0.9.2-dev.1

- Fix fullscreen ResizeObserver warnings by coalescing the native chat virtual list's geometry transactions to animation frames. Preserve native measurement validation and scroll anchoring; restore original methods on removal. No global observer replacement or warning filter is installed.
- Reconcile stale HTML mute levels after rapid mute/unmute and media refresh. Transfer native boost across fullscreen player remounts while keeping the new player's initial HTML volume legal.
- Pass 18 live fullscreen cycles across three sizes, both chat states, 100%/300% and mute, with native gain readback, advancing frames and zero runtime/resize errors. Add exact-native-module offline resize and remount regressions; fullscreen checks now require zero resize warnings.

## 0.9.1-dev.1

- Make stream focus respond in the click turn and shorten tile transitions to 120 ms. Keep the same player/control box in grid and focus views. Preserve the originating stream and prior layout when a double-click lands after the tile has moved.
- Replace the preview text button with a labelled 28 px chevron beside the preview area. Keep chat controls separate and retain preview preferences, keyboard access and reduced-motion support.
- Avoid repeated attribute writes and layout reconciliation for chat typing or volume readouts. Treat connected, paused and joining sessions separately from unopened previews.
- Add stress tests for immediate focus, realistic double-click timing, dragging, keyboard cancellation, four viewport sizes, idle DOM churn and repeated cleanup. Recheck 300% amplification and the exact Vue runtime freeze regression.
- Keep development status: the live source ended before final playback/fullscreen checks, and two simultaneous live sources are unavailable. The previous native fullscreen ResizeObserver diagnostic remains unresolved.

## 0.9.0-dev.1

- Restore native sidebar, bookmarks, contacts, voice controls, panel splitters and tab order. Remove the custom navigation overlay, drawer, relocated voice dock and device-warning disclosure.
- Keep unopened stream previews bounded and preserve usable chat space. Handle beta5's portal hierarchy and actual player state instead of treating any single video tile as a full-height player.
- Put Show/Hide previews beside Show/Hide chat; reclaim more room for a focused player and keep its controls below the picture. Use compact actions on tiny tiles and retain manual native divider sizing.
- Add native sizing, exact single-unopened-preview, focus/chat, and fullscreen-return checks. Fullscreen remounts the native player and still emits one transient ResizeObserver diagnostic with the volume enhancement; it settles and playback resumes.

## 0.8.0-dev.3

- Fix the stream-entry freeze introduced by the initial volume boost: remove synchronous video-ref watchers and adapt the exact-build HTML-volume boundary instead. Detach/restore the hidden native slider's model callback so unmute preserves 300%.
- Add a bounded reproduction using the installed Vue runtime plus live native-backend readback, repeated-render, mute/unmute and player-refresh checks. User confirmed louder audio and responsive controls.

## 0.8.0-dev.2

- Initial 300% volume implementation was unsafe on live beta5 functional refs; superseded by dev.3. Its synthetic-only validation did not detect the stream-entry freeze.
- Support TeamSpeak 6.0.0-beta5, build 1791901251, with updated exact UI resource hashes and the audited Appearance module binding.
- Adapt stream focus, preview collapse, chat and keyboard controls to beta5's payload tiles and native tile refs. Keep native call/PIP layouts and fullscreen geometry intact.
- Add a beta5 variant of the stream regression fixture, including call/PIP preservation. Live media checks can preserve the content view because beta5's native Info/Files/Settings transitions remount the preview portal.

## 0.8.0-dev.1

- Replace the two-tab overlay with explicit Channels, Friends, Chats and Servers navigation, plus a narrow-window drawer.
- Move voice controls into the personal dock and share display-size tokens with the native tree virtualizer.
- Exclude Appearance preview trees from workspace ownership and make reconciliation idempotent.
- Cancel pending Space activation when focus moves; provide a visual shell keyboard sequence.
- Keep chat available during streams and remember the explicit Hide/Show chat choice without replacing media or draft components.
- Pass 39 synthetic scenario groups and 26 native DOM/interaction checks, plus schema and reversible-deployment tests. Install the matching source locally. Native paint, playback and physical-DPI acceptance remain incomplete; this is not a published release.

## 0.7.8-dev.1

- Move native Mic and Audio controls to a dedicated row above the server selector. Increase their targets to 44px high, icons to 24px and labels to 14px.
- Keep Status in the title bar and remove the old bottom voice row, leaving a compact profile footer. Retain native mute states, handlers, context menus and keyboard focus.

## 0.7.7-dev.1

- Keep Create Channel, recent server events and bookmark management in the existing Servers view. Hide the current-channel chat shortcut only while that chat is already open.
- Remove pop-out from empty stream viewers; keep stream settings available to restore hidden previews.
- Select TeamSpeak's native Dynamic formatting mode during setup and reveal profile editing on hover/keyboard focus. Keep voice, sharing, connection status and navigation directly available.

### 0.7.6 local refinement

- Audit workspace hover and keyboard-focus states. Reserve the sharing control's full width in the LIVE strip, and inset sharing/viewer/tray focus outlines so native clipping cannot cut them off.

### 0.7.5 local refinement

- Keep the server/bookmark toggle transparent on hover so its background cannot obscure the native server name. Use an inset border for hover feedback.

### 0.7.4 local refinement

- Independently review the running workspace against W3C target, focus and contrast guidance and Microsoft's command-bar guidance.
- Bound automatic sidebar expansion to 320–380px at 27% of window width, retaining manually wider native panes. Reduce excess navigation spacing.
- Label Info/Chat/Files on wide windows; keep compact icons, tooltips and active-state cues on small windows.
- Keep chat event timestamps beside their text and improve secondary text contrast. Quiet secondary server actions and the sharing-strip border.
- Enlarge split-menu targets to 24px; add reversible button semantics, focus indicators and Enter/Space support to native workspace actions without replacing their handlers.
- Verify live navigator and sharing geometry, plus isolated keyboard, stream tray and broadcasting interactions. Native audio/sharing state is retained.

### 0.7.3 local refinement

- Expand the channel pane when no stream tiles are visible, including hidden own streams and grids moved to a pop-out. Use 36% of the window, bounded to 320–520px; restore the native splitter width when a tile returns.
- Preserve saved pane widths and the live/viewer strip. Suppress duplicate native button titles in the wider pane.

### 0.7.2 local refinement

- Refine the whole workspace: aligned server/channel headings, consistent control targets, quieter chat events, and a horizontal hidden-preview toolbar.
- Give profile and voice/status controls separate rows; label Mic, Audio, Status, Channel, Share and Log. Keep native controls and menus.
- Enlarge the live strip, separate viewer icons, and clarify pause/resume with its own symbol, tooltip and keyboard handling.
- Fix the server banner offset, native separators obscuring action labels, and chat previews peeking beneath the composer.

- Keep a red "YOU'RE LIVE" strip visible while sharing, including when the own-stream preview is hidden. Paused sharing remains marked in amber.
- Show compact viewer avatars or initials, names on hover, and a keyboard-accessible viewer list. Merge people watching multiple own streams into one viewer count.
- Move the existing native sharing control beside the status strip, freeing space beside the profile and audio controls.
- Keep a 320px sidebar minimum so the current username fits with both native profile accessories. Reserve the compact status row without changing the window root's measured size.
- Retain status in compact navigation and container fullscreen; remove it when sharing ends or the helper is disabled. No share archive created for this local build.

## 0.7.0-preview.1 — 2026-10-11

- Combine navigation into one column with Channels/Friends tabs and a server-name selector for connected servers and bookmarks.
- Keep native search, contacts, recent chats and server-tree components, with keyboard tab switching and Escape dismissal.
- Place profile, microphone, speaker and settings controls together; keep server utilities and away controls in the row above.
- Preserve stream objects and audio state, retain the tree width with a 300px minimum, and use native navigation below 820px or outside server views.
- Restore native attributes, visibility and helper-expanded sidebar geometry when the navigator is removed.

## 0.6.3-preview.1 — 2026-10-11

- Hide the sidebar community promotion and standalone Group Chats section in expanded and collapsed layouts. Keep mixed custom sections, contacts and server navigation available.
- Reclaim profile-row padding so the username has more room, with separate edit and settings targets.
- Restore native section visibility when the theme or workspace helper is removed.

## 0.6.2-preview.1 — 2026-10-11

- Anchor the stream-view badge to its own button and open keyboard-triggered menus beside their controls.
- Group stream view controls together and separate Leave/Stop at the far right of the stage.
- Add a label and keyboard handling to the native incoming Leave button.
- Prevent sidebar search/folder/add buttons from overlapping section-collapse arrows; retain the existing sidebar width, scrolling and collapsed rail.

## 0.6.1-preview.1 — 2026-10-11

- Keep incoming-stream volume sliders visible and usable, including smaller preview tiles.
- Move stage view/pop-out buttons to the right with reserved space, and lift the idle name label above the control strip.
- Add keyboard activation and accessible labels to native stream mute/unmute buttons.
- Retain one-click setup and remembered collapse state; verify incoming control geometry without changing live audio.

## 0.6.0-preview.3 — 2026-10-11

- Add one-click install/update: verify the client, download missing portable runtimes with pinned official checksums, activate the theme and Compact tree, then launch with helpers attached.
- Keep runtime paths independent of PATH and the extracted folder. Finish setup automatically after an already-running client is closed by its user.
- Add a double-click removal entry point and readable setup logs.
- Give bottom stream controls centered 32px targets and reserve the full width of the connection-status icon.
- Retain remembered tray state, active media objects, original shortcut recovery, and rejection of unrelated shortcut edits.

## 0.5.1-preview.1 — 2026-10-11

- Remember the collapsed or expanded stream tray across grid/refocus, helper reattachment, renderer reloads and client restarts.
- Keep toggling functional with an in-memory fallback if browser storage is unavailable.
- Trim the recipient ZIP to installation/runtime files and shorten the included setup guide.
- Remove an outdated theme version from the launcher message and consolidate tray cleanup.
- Add explicit shortcut repair that preserves binary changes while refusing changed launch settings/flags.

## 0.5.0-preview.1 — 2026-10-11

- Add a collapsible preview tray when a stream is focused. Hide previews with the down chevron and restore them with the up chevron, Enter, or Space.
- Give the focused stream the full stage while the tray is collapsed, keeping hidden players mounted and their controls out of keyboard navigation.
- Restore the native presentation for grid mode, fullscreen, pop-outs, theme disable, and helper removal.
- Add a synthetic browser regression suite for tray geometry and lifecycle.
- Refresh the public README and illustration; separate user setup, development, and historical validation notes.
- Resolve the bundled schema's draft identifier locally so the theme audit works offline.

This preview has not been published. Native multi-stream playback remains an acceptance item.

## 0.4.1-preview.1 — 2026-10-09

- Add guarded installation, Start Menu attachment, update/uninstall recovery, and checksummed release packaging.

## 0.4.0 — 2026-10-09

- Refine workspace spacing, keyboard controls, device recovery disclosure, and the single-stream control strip.
- Retain compact tree measurements, full-height stream sizing, and automatic chat collapse from earlier iterations.
