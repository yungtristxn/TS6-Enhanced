# Validation record and remaining checks

Client: **6.0.0-beta4.1, build 1779880475**. Node 24.13.1 and PowerShell 7 were used. The v0.3 historical state is Dark, Medium, **Compact** tree, 1322×847 renderer, actual DPR 1.

## v0.4 current review — 2026-10-09

- Installed official theme **0.4.0**, main helpers **0.4.0**; exact supported build unchanged. Current preset: collapsed 62px rail, 320px tree, 940px detail at 1322×847/DPR 1. Dark/Medium/Compact appearance. Earlier records below are historical.
- The user explicitly approved one restart for inspection. The previous normal session had no helpers. The new session verified `127.0.0.1:9988`, owned by the installed TS6 process. No active stream was stopped during subsequent layout validation.
- Current-run audit and accepted screenshots: [layout review](../layout-review.md). The 36px control strip is below the picture; seven native controls are labeled, focusable and hit-testable. All tree rows use matched 28px cache/DOM heights.
- **8 stream checks**: five viewport/DPR combinations (1322×847/1, 1100×720/1.25, 900×650/1.5, 1920×1080/1, 960×540/2), helper removal/restoration and repeat attach; same video/media objects retained. The playback-continuity result is explicitly false/unverified, not a passing playback test.
- **13 workspace checks**: four pointer toggles, Enter/Space toggles, native splitter drag and six size/DPR configurations including 640×600. Tree width stayed stable while toggling; chat stayed hidden with the stream.
- **8 focused review checks**: recovery disclosure expanded/collapsed with Space while warning headings stayed visible; virtualized scrolling at 847/540px heights produced 28px rows and zero gaps; native fullscreen entry with Enter and exit retained the same video/media objects. A repeat run after the pop-out transfer also checked that the control strip returned inside the viewport; the new waiting player retained its initial paused state. Neither run certifies decoder continuity.
- Native pop-out transfer showed one session, no main tiles and visible main chat; the pop-out had one tile, no chat, official theme loaded, and no attached helper. The stalled source supplied no frames to its new player. Closing that exact test pop-out returned one main tile and collapsed chat, with one sharing session still active. **Pop-out media playback did not pass**.
- `Start-Layout.ps1` attached repeatedly to the existing inspection session without a restart. Deployment suite passed dry-run, install/update backup, restore, uninstall, repeat uninstall, collision/junction refusal and preservation of another theme. Static manifest/asset audit passed **40 native class tokens**. PowerShell/JavaScript syntax checks also pass.
- Playback diagnostic: frame counter **812** in custom, stock-start and stock-end samples; paused false, media active, track live/unmuted. The strict stream test failed correctly before the explicit geometry-only run. User requested finishing with playback unverified. No capture/session restart or device changes were used to force a passing result.
- Local reports: `.local/v04-stream-stage-validation.json`, `v04-workspace-validation.json`, `v04-review-validation.json`, `v04-playback-diagnostic.json`, `v04-popout-validation.json`.
- Backups include the pre-review installed v0.3 theme at `%LOCALAPPDATA%\TS6-Layout\backups\20261009-163504-727-5bf475a8\local.tsix.layout`. Intermediate v0.4 updates also have separate backups. Original pane recovery JSON was not replaced.

Remaining: advancing incoming/outgoing video and audio, multi-stream/participant interactions, source-ratio changes, full fresh-launch integration, physical Windows monitor/DPI transitions and other appearance scales. Renderer emulation is not Windows scaling acceptance.
## v0.3 live stream stage — 2026-10-09

- One actual **outgoing screen-share preview**, source 1394×894, remained running during final validation. This is native playback evidence, not a synthetic fixture or proof of incoming audio/video behavior.
- Before: 980×728 viewer, 480.48 px maximum video height, 820×461.25 video element with a forced 16:9 box. After: 980×749 viewer, 749 px video budget, 964×733 video element with `object-fit:contain`. The fitted source picture grows from approximately **719×461 to 964×618 px** (about 80% more area, calculated from element bounds and intrinsic source size). Remaining letterboxing preserves the source aspect ratio.
- `tests/stream-stage.mjs`: **7 live checks passed**. Five renderer sizes/DPRs: 1322×847/1, 1100×720/1.25, 900×650/1.5, 1920×1080/1, 960×540/2. The stage fills available height and width, chat stays hidden, and all seven observed controls are visible on focus and hit-testable. The same video DOM node and `srcObject` remain connected, readyState stays 4, paused stays false, and decoded frames advance across the test.
- The same test removes the helper and confirms the original -1 split returns, then attaches twice and confirms the stage/control inventory stays stable. Media identity and playback are retained throughout. It restores the original renderer dimensions and focus, then clears all emulation.
- Native fullscreen was entered using the stream component's verified `toggleFullscreen()` and exited through the DOM fullscreen API. The same video and media objects persisted, frames advanced, and the full-height in-client stage returned. The check did not pause/stop the stream or open/close its pop-out.
- Official schema and **27 native selector class tokens** pass. v0.3 was installed with an owned-theme backup. The original v0.2.1 theme is in `%LOCALAPPDATA%\TS6-Layout\backups\20261009-122237-095-3e4fd176\local.tsix.layout`.
- Evidence: `.local/stream-stage-before.json`, `stream-stage-after.json`, `stream-stage-validation.json`, `stream-fullscreen-validation.json`, and actual client screenshots `stream-overhaul-before.png` / `stream-overhaul-after.png`. Screenshots contain live personal desktop/server content and remain ignored by Git.

Not yet tested: several simultaneous incoming streams, participant pagination/dragging, source aspect-ratio changes mid-stream, incoming volume/mute/audio, active native pop-out transfer and physical Windows per-monitor DPI changes. The helper preserves native arrangement for multiple items and does not attach to pop-outs; those paths still need live validation. Pause/stop/join/leave were deliberately not invoked during the active session.

## v0.2.1 chat collapse — 2026-10-09

- Replaced side-by-side docking with official CSS that fully hides the mounted chat and divider whenever the same viewer contains a rendered stream tile. The row metrics, pane preset and workspace helper are unchanged.
- Manifest/schema and all **24** observed selector class tokens pass. Installed v0.2.1 with a backup of v0.2.0 and reloaded the official stylesheet without restarting. The actual client currently has zero stream tiles: chat and its editor remain visible, and the viewer measures its full 980 px width.
- Synthetic fixture at 1280×800, 700×650 and 480×600: chat and divider have zero layout size with a tile; the measured stream area keeps the full width; the hidden composer cannot receive focus. Removing one of two tiles keeps chat hidden; removing the last restores it even with an empty grid wrapper remaining. Reappearance collapses it again. The same chat/input nodes and a synthetic draft survive the cycle, and input focus works after restoration. No horizontal overflow.
- Evidence: `.local/v021-live-chat.json` and `.local/v021-chat-collapse.json`. These are layout/state tests, not real stream playback. Active-stream start/stop, fullscreen and moving an active stream to/from a native pop-out remain unverified. The 66% native video-height cap is unchanged even when chat is hidden.

The earlier v0.2/v0.1 docking results below are historical; automatic collapse supersedes that design.

## v0.2 workspace validation — 2026-10-09

- Official schema and **21** observed class tokens pass; v0.2.0 installed, official stylesheet reloaded. Prior owned theme versions were backed up by the deployment script. Deployment lifecycle tests pass again.
- Native pane preset changes **270 / 500 / 552 px** to **62 / 280 / 980 px** for navigation / tree / right workspace. The small server heading retains its icon, title, bookmark and chat actions. Existing native device warnings and notifications remain.
- `tests/workspace.mjs`: **13 checks passed**. Four pointer toggles retain 280 px tree width; Enter expands and Space collapses; accessible state matches. The native tree/content splitter was actually dragged with CEF pointer input from 280 to 320 px and restored afterward. Its hit-testable edge is inside the detail pane; the geometric midpoint is clipped by native paint containment.
- Six CEF renderer size/DPR combinations: 1322×847/1, 1100×720/1.25, 900×650/1.5, 1920×1080/1, 960×540/2, 640×600/1. Chat remains in the viewport. The expand button is visible and hit-testable when TS6 permits expansion. At 640 px it is natively absent (`canExpandSidebar=false`), while the icon rail and chat remain accessible.
- `tests/live-layout.mjs --skip-theme-comparison`: six existing size/scale cases pass again in Compact mode; both user and channel rows are 28 px, visible adjacent row gaps are zero, and chat focus works without typing. Emulation is cleared after testing. This remains a small live tree, not a large-tree stress test.
- Helper restore, removal, repeated apply and reattachment were exercised. Restore returns the original pane widths; remove clears the helper; attach retains widths. The original recovery file remains unchanged. The helper followed native control replacement when navigating to Appearance and back.
- A new **empty native pop-out** loaded the v0.2 official theme, had one viewer and no chat, and had no workspace helper attached. It was closed afterward. This does not test active playback or stream ownership.
- Synthetic stream lab rechecked at 980×730: 672 px measured video area, 300 px side chat, 8 px gap, no overlap/overflow; focused controls visible. At 700×650 it switches to stacked chat with the input in bounds. Browser fullscreen entry/exit passed. Native stream arrangement, playback, fullscreen and pagination are still unverified.

Current local evidence: `.local/workspace-validation.json`, `.local/v02-live-layout-results.json`, `.local/v02-popout.json`, `.local/v02-fixture-results.json`; screenshots `v02-before-panes.png`, `v02-after.png`, `v02-popout-empty.png`. The pane comparison keeps the same chat, theme and Compact mode. `v02-before.png` is the initial discovery view with Detailed rows and a different right-hand detail view.

The following v0.1 record describes the earlier baseline and keeps its original test scope. The v0.2 update intentionally changes tree mode and pane widths; other preferences and connection state were preserved. No client restart or active-stream interruption occurred.

## v0.1 baseline — 2026-10-08

Live appearance then: Dark, Medium, Detailed tree, renderer DPR 1.

## Completed on the installed client

- Official schema validation passes. The client's extension scanner returns this manifest and local `tsui://extension/...` asset URLs. The actual Appearance picker accepts and selects the theme; `link#userStyle` loads its stylesheet.
- Six channel rows shrink from 44 to 28 CSS px. Detailed user rows remain 40px and Compact row metrics remain 28px. Row positions and the virtualizer's cache match after the helper runs.
- **A real cache defect was found and addressed:** theme selection and view reopening alone left 44px cached channel offsets against 28px visible rows. The independent helper synchronizes the existing cache and flattened tree without reconnecting. Stock→theme→stock→theme measurement refresh was exercised while capturing the comparison.
- Live tree scroll-to-top/end and chat placement at the sizes below. All measured adjacent **visible** row gaps were zero; pooled virtual rows parked at -9999px are excluded from visible-row assertions. This was the existing small server (six channels and five visible users during final capture), not a thousand-row stress test.
- Tab moved from the native tree scroller to the next native audio-device selector. The actual chat editor remained focusable. No chat text was typed or sent. This does not certify every keyboard shortcut.
- An **actual native empty screenshare pop-out** was opened through the client's own action, identified as a separate TS6 target, inspected and closed. It loaded the official theme and contained `.popup__content` / `.tsv-screenshare`; there was no chat node and no active video. The helper requires an explicit target ID for pop-outs.
- Client renderer size/DPR and focus emulation were cleared afterward. Final native renderer returned to 1322×915, DPR 1, one main target, zero pop-outs, and no outstanding CSS measurement promises.

Renderer emulation results (not Windows monitor-setting changes):

| CSS viewport | Emulated DPR | Tree end scroll (px) | Visible row gaps | Chat editor in viewport |
|---|---:|---:|---|---|
| 1322×915 | 1 | 0, all fit | 0 | Yes |
| 1100×720 | 1.25 | 83 | 0 | Yes |
| 900×650 | 1.5 | 179 | 0 | Yes |
| 1920×1080 | 1 | 0, all fit | 0 | Yes |
| 1280×720 | 1.5 | 83 | 0 | Yes |
| 960×540 | 2 | 263 | 0 | Yes |

The last two model the available CSS space of a 1920×1080 screen at 150% and 200%. They do not prove per-monitor Windows DPI transitions, native window bounds, or physical text readability.

## Completed independently

- PowerShell deployment tests: dry run, install, update with backup of a local edit, restore including hidden assets, uninstall, repeated uninstall, refusal to replace an unowned collision or follow a junction, preservation of an unrelated theme.
- Helper rejects the unrelated Node HTTP listener on port 9989 and invalid ports. The live 9988 listener was verified as loopback-only and owned by the installed TS6 executable. No wildcard origin override or firewall change was used.
- Static selector audit: every one of the theme's 17 class tokens is present in installed main.css/main.js. Composed selectors are mapped in architecture.md; finding a token alone is not sufficient DOM validation.
- Synthetic CSS fixture uses the observed viewer hierarchy, scoped base CSS and locally exported stock style rules, with inert stream content and a simplified measurement loop. At widths 1280, 960, 959, 800, 640 and 480 (heights 800, 720, 720, 600, 480, 400), the chat/input fit without horizontal overflow. Docking occurs at 960 and above, with 300px chat plus 8px separation. The narrower viewer widths retained stacked chat.
- In that fixture, focusing a stream control exposed its overlay (opacity 1). Browser fullscreen entry/exit worked and the focused controls remained visible. Fullscreen viewport sizing in the embedded test browser is not a native TS6 fullscreen test.
- Removing chat or the stream region in the fixture restored full measured width (1280px) and removed docking. An initial asynchronous no-chat probe timed out because its reporter assumed chat still existed; after reopening the test tab, corrected synchronous probes passed. This was fixture tooling, not TS6 playback.

## Local evidence

- `.local/screenshots/client-before.png` and `client-after.png`: actual CEF screenshots of the same channel/chat view, theme disabled/enabled with correct matching cache metrics. The comparison changes only the theme, not chat history or server data.
- `.local/screenshots/popout-empty.png`: actual separate empty pop-out.
- `.local/live-layout-results.json`: reproducible metric records from `node tests/live-layout.mjs`.
- `.local/fixture-results.json`: synthetic geometry reports, explicitly distinct from native-client results.

Native desktop activation/capture tooling returned `GetCursorPos failed: Access is denied. (0x80070005)`. CEF developer-tools screenshots and renderer emulation remained usable. Therefore direct mouse dragging of the Windows frame and physical monitor scaling were **not** tested. The theme was installed and selected; the previous selection was stock. This initial version retained Detailed tree mode. No client restart, stream start/stop, server edit, message send, credential/identity/account mutation, native file patch or firewall change was performed.

## Still required before claiming full stream support

Use a consenting normal streaming session, not a live call that must not be disturbed:

1. **Incoming active stream:** repeat the completed outgoing-preview stage checks with a remote source. Confirm aspect ratio, readable text and decoder continuity. Chat and its divider should disappear at every width, leaving no reserved chat column. With the v0.3 helper the video budget should equal the full measured viewer height.
2. **Chat lifecycle:** prepare an unsent draft, display a stream, then close the last stream. Verify chat disappears, hidden controls are skipped by Tab, and the draft, editor and chat scrolling return afterward. Check that an empty invitation without a stream tile leaves chat visible. Sending a test message is a separate user action.
3. **Multiple streams/participants:** active-stream selection, speaking outlines, names, volume slider, mute, join/leave, pagination and drag/reorder. Include a portrait stream and several participants. No synthetic fixture certifies these native actions.
4. **Fullscreen and pop-out with playback:** enter/exit fullscreen using keyboard and pointer; open/resize/close the real pop-out; verify stream ownership and controls restore. Pop-out chat is absent by design; this theme does not create it.
5. **Real Windows scaling:** move the window between 100/125/150/200% displays or test the user's existing configurations; check native frame bounds, text, focus rings, overlays, resize handles and fullscreen exit. Do not change Windows display settings during an active session.
6. **Tree stress and appearance:** many nested channels, collapsed/expanded branches, long names, avatars/badges, compact mode, keyboard arrow selection, and small/large or light appearance. Re-run the cache helper after a theme change. Cold-start theme timing also remains unverified.

If a problem occurs, turn **User Theme off**, open the server tree, run `node tools/client.mjs refresh-tree` while its debugger is available, and compare stock behavior. Uninstall/restore commands are in README. Do not patch native resources as a shortcut around an unverified state.
