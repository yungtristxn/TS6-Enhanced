# Layout review — v0.4, 2026-10-09

A fresh review of the installed beta4.1 client, not a reuse of the previous implementation's conclusions. Scope: navigation rail, channel tree, server/channel headings, chat, one outgoing stream preview, fullscreen and a native stream pop-out. User goal: a compact TS3-like workspace with the stream as the main focus and chat collapsed while viewing it.

## Captured review steps

1. **Normal launch / Home** — `v04-01-before.png`. The official theme loaded, but both JavaScript helpers were absent. The sidebar arrow remained visually present without its keyboard enhancement. Home's community discovery cards are outside the channel/stream scope and were not redesigned.
2. **Server and channel/chat** — `v04-02-workspace-before.png` and `v04-03-channel-before.png`. Oversized content heading, 365px tree, device recovery consuming 220px, and wrapped device names with overlapping 13px line boxes around 15px text. Tree cache refresh was required to settle the initial list; accepted screenshots show the populated view rather than the earlier loading capture.
3. **In-client stream** — `v04-04-stream-before.png`. Chat was already collapsed, yet native JavaScript retained a 480.48px video budget inside a 728px viewer. Settings/pop-out lived on side rails, and hover controls covered the picture. The stream did not use the remaining lower workspace.
4. **Revised workspace and stream** — `v04-06-stream-after.png`. 320px tree, 940px right workspace, 45px content heading, 758px stage budget, 36px dedicated control strip. The video box is 924×706; its 1394×894 source fits at about 924×593 without cropping. Device warning headings remain visible with keyboard-accessible disclosure of the original selectors.
5. **Chat with native pop-out** — `v04-08-chat-with-popout.png`. Main-window chat returns while the grid is in the separate window; the composer remains present. The pop-out loads the official theme and has no chat/helper. Its player waited for a new source frame, so the blank `v04-07-popout.png` is diagnostic evidence, not an accepted completed-playback screenshot. Closing only the pop-out returned the tile to the main window without ending the sharing session.

All referenced images are actual current-run CEF screenshots under ignored `.local/screenshots/`. Intermediate paint/loading captures were rejected as visual evidence. None was retouched or replaced by a mockup.

## Findings and changes

| Priority | Finding | Evidence | Change |
|---|---|---|---|
| High | Normal restart silently loses the full-size stream behavior | Step 1, no helpers; step 3, native 66% cap | `Start-Layout.ps1` starts or attaches to the verified inspection session, synchronizes row cache and attaches both helpers. It refuses to restart a normal running client. |
| High | Video gets only part of the main pane even with chat hidden | Step 3 | Restore full-height native budget; keep the native player and source proportions. |
| High | Warnings and overlapping labels obscure the tree | Step 2 | Retain warning headings; disclose recovery controls on demand; repair wrapping/line height. No audio settings changed. |
| Medium | Multiple large headers, gradients and rounded surfaces weaken hierarchy | Steps 2–3 | Flatten workspace surfaces using existing palette variables; reduce content heading and server banner. |
| Medium | Stream controls are scattered and can cover content | Step 3 | One stable strip below a single stream, existing controls grouped by purpose; labels and keyboard handling retained. |
| Medium | Sidebar toggles can transfer width into the channel tree | Code review and native interaction tests | Keep the existing width-preservation helper; use a 320px preset and preserve manual sizes on launch/attach. |

## Strengths retained

Native channel hierarchy, speaking/status colors, user badges, pane resizing, chat composer/history, stream/player implementation, source aspect ratio, native fullscreen and separate pop-out routing remain intact. No new media/session implementation was introduced. Multiple-stream geometry remains under TS6's arranger.

## Accessibility and validation

Sidebar pointer/Enter/Space, native splitter drag, visible stream-control hit tests across five renderer sizes/DPRs, disclosure Space activation, virtualized list top/end scrolling and native fullscreen entry with Enter were exercised. The disclosure preserves warning headings and removes only collapsed selectors from keyboard navigation. Focus outlines and reduced-motion transitions are included.

This is not an accessibility compliance claim. Screen readers, all native menu actions, actual Windows display scaling and every client appearance scale were not tested. Server names still truncate in a narrow tree; the native splitter allows users to widen it.

## Playback limitation

The source stopped delivering frames during this review. Frame counter 812 remained unchanged with the custom layout and with stock CSS/helper removed, while the track reported live/unmuted. The strict continuity test correctly failed. Geometry-only tests were then run explicitly with `--allow-still-source` and reported continuity **unverified**.

Native pop-out transfer created a new video element with readyState 0 waiting for fresh source frames; the main element was likewise waiting after return. No source/capture restart, pause, stop, device selection or stream quality change was performed. The user chose to finish with playback unverified. Retest with a moving source before claiming successful pop-out playback or decoder continuity.

## Remaining acceptance work

Incoming video/audio, multiple simultaneous streams/participant interactions, a source changing aspect ratio, fresh-launch attachment end to end, physical Windows DPI transitions, other TS6 versions and other appearance scales. See `validation.md` for measured evidence and historical tests. The earlier v0.3 advancing-frame result is historical and does not certify this run.
