# TeamSpeak stream maintenance knowledge

This is the maintainer handoff for the volume, layout, focus and fullscreen work completed on 14–15 October 2026. It explains the native behavior that the helpers depend on, why previous approaches failed, and which tests protect each fix. Start here before changing stream behavior; use [development](development.md) for routine commands and [validation](validation.md) for the dated acceptance record.

The baseline is **0.9.4-dev.2**, with theme/helpers **0.9.4**, on **TeamSpeak 6.0.0-beta5, build 1791901251**, Windows x64. The user explicitly requires unopened and playing streams to use the same stage scale; the separate centered-card design in 0.9.3 was rejected and is superseded. The installed client uses **Vue 2.7.16**. These are audited internals, not a public TeamSpeak extension API. [release.json](../release.json) is authoritative for supported resource hashes and current compatibility. Re-audit after a client update rather than merely replacing the hashes. See the [bottom-control review](stream-controls-review-2026-10-15.md) for current placement and validation.

The shipped helpers need Node 22+ and PowerShell 7+. The Windows PowerShell 5.1 bootstrap handles runtime setup; those are separate compatibility surfaces. The helpers have no runtime npm dependencies.

## Principles that prevent regressions

- Keep the official theme loader, native navigation, panel splitters, session owners and media lifecycle. Do not patch installed client files or introduce TS6AddonInstaller.
- Scope adapters to the current component/controller. Save original functions, descriptors, attributes and listeners; restore them only while the helper still owns the replacement.
- Separate an unopened stream preview, a connected player, a paused player and a fullscreen presentation. Tile count alone does not identify these states.
- Treat chat as part of the layout budget in both unopened and playing states. With Show chat enabled, filling the stream frame must not push the composer away.
- Keep ordinary focus/tray changes from replacing videos, MediaStreams or tracks. Native fullscreen itself remounts the player, so test continuity by session, decoded frames and audio state there.
- Never synchronously watch a functional video ref. Never write native session state from a render-time ref callback. The original stream-entry freeze came from that combination of timing and reactive dependencies.
- Perform layout-writing resize transactions outside ResizeObserver delivery. Keep native stale-measurement validation and scroll anchoring intact.
- Require zero resize warnings in current fullscreen tests. Do not filter warnings, replace ResizeObserver globally in production, or weaken a test to allow a known regression.
- A synthetic pass does not establish native playback. Record browser simulation, exact native-module tests, native client tests and acoustic/user confirmation separately.

## Code ownership and native contracts

| Area | Source and entry points | Responsibility |
| --- | --- | --- |
| Presentation | [layout.css](../theme/local.tsix.layout/layout.css) | Density, bounded previews, stable player/control box, preview chevron, responsive targets and reduced motion |
| Stream integration | [streams-runtime.js](../tools/streams-runtime.js) | `layoutState`, `update`, `updateTray`, `syncPreviewJoins`, `syncFocusActions`, `installFocusGestures`, `syncChatLayout`, `deferChatLayout`, `syncVolumes`, `createVolume` |
| Native shell | [workspace-runtime.js](../tools/workspace-runtime.js) | Native control keyboard access, measured tree density, sidebar width preservation |
| Verified transport | [cdp.mjs](../tools/cdp.mjs) | Loopback/process/origin/context checks before renderer access |
| Attachment | [session.mjs](../tools/session.mjs), [streams.mjs](../tools/streams.mjs), [workspace.mjs](../tools/workspace.mjs) | Supported-build checks and helper attachment/removal |
| Official theme setup | [appearance.mjs](../tools/appearance.mjs), [Theme.ps1](../scripts/Theme.ps1) | Native Appearance selection and reversible theme deployment |
| Managed launch | [Install-Persistence.ps1](../scripts/Install-Persistence.ps1), [Start-Layout.ps1](../scripts/Start-Layout.ps1) | Immutable helper copies, shortcut ownership and recovery |

Find functions by name instead of relying on line numbers from an old investigation:

```powershell
rg -n 'function (layoutState|updateTray|syncFocusActions|installFocusGestures|deferChatLayout|syncChatLayout|createVolume)' tools/streams-runtime.js
rg -n 'fullscreen|stream-stage|tray-toggle|volume-control|reduced-motion' theme/local.tsix.layout/layout.css
```

### Discover the owning viewer correctly

The real main viewer is a `.tsv-screenshare` element whose `__vue__` has `$refs.fullArea` and `doUpdateGrid`. beta5 also renders `.tsv-screenshare-portal-ctx.tsv-screenshare`; that second class match is not another owning viewer. Filtering only by the CSS class previously produced crashes and misleading counts.

The relevant structure is schematically:

```text
owning .tsv-screenshare
  .tsv-body
    $refs.fullArea / .tsv-scroll-area-v
      native portal host
        .tsv-screenshare-portal-ctx
          row with native left/right action rails
            .screen-grid-wrapper
              .screen-grid
                .screen-tile-wrapper--video
                  .video-stream
      native divider
      .ts-chat-container
```

Portal hosts and `display: contents` nodes make direct-child assumptions unreliable. `update` locates the actual region containing the grid and marks it with `data-tsix-stream-region` and `data-tsix-stream-row`. Those markers and their original values are restored during cleanup.

| Native model | Fields used |
| --- | --- |
| Earlier layout model retained in fixtures | `layoutStreams`, `layoutViewers`, `streamRefs`, `allSessions`, `inDragStream` |
| Current beta5 layout model | `flatTiles`, `tile.payload.kind`, `tile.payload.session`, `sortableStreamsContainer.sortedStreams`, `refForTile`, `isFocused`, `isStreamVisible`, `inDragTile` |

The adapter reads both forms without installing aliases into native objects. This does **not** mean the current launcher supports older builds: runtime and resource guards still restrict attachment to beta5. Call participants, non-video tiles and PIP must retain native layout; do not treat every `flatTiles` entry as a video preview.

### Native state values used by the helper

`playerActive` recognizes a mounted video, an incoming session that is joining, an inbound session with `status === 4` (connected), or an outbound session with `captureStatus` 3/4 (paused/running). A connected paused player can temporarily have no `<video>` and must not become an unopened preview.

The native audio slider is rendered only when the incoming session has both `audioSupported` and `config.audio`. A playing stream without audio sharing cannot exercise the custom volume control. This mattered during live testing: the first prepared feed played correctly but exposed no slider until the user enabled audio sharing.

## Layout sizing and product decisions

The custom sidebar navigator, drawer, relocated voice toolbar, warning disclosure and shell-wide Tab routing introduced too much change. Version 0.9 restored native sidebar/resources, voice controls, profile/Settings placement, splitters and tab order. The remaining customization concentrates on density, stream space and usable controls. Future stream fixes should not grow into another shell redesign without a separate product decision.

The viewer's native layout inputs are `maximumWidth`, `maximumHeight`, `maximumVideoHeight`, `overrideSplitPercentage`, `maxVideoAreaHeightPct` and `doUpdateGrid`. A split of `-1` means native automatic sizing; preserving it where it already works avoids an unnecessary empty block above chat.

Current allocation, with `unit` from `--tsix-unit` and `height = max(1, maximumHeight)`:

```text
chat minimum = min(unit * 14, max(80, height * 0.4))
chat limit   = max(0, height - chat minimum - 8)
stage budget = the same available video budget before and after joining
```

Single streams and collapsed focused players can use the remaining video budget while reserving chat. Single-stream geometry is identified by `data-tsix-stream-layout="single"`, independently of `data-tsix-stream-stage` content state. Available, joining and playing content fills that same frame. Native divider gestures are recognized through `resizeVideoHeightOrigin`; the resulting split becomes the saved preference instead of being immediately overwritten by reconciliation.

The original 260 px emergency cap and the subsequent centered 480 px preview budget both treated the unopened state as a separate card. They did not meet the user's desired continuity with playback. They also left native view actions far from the card. Version 0.9.4 removes preview-specific sizing entirely. Acceptance now compares the unopened and playing frame's x/y/width/height directly and checks that the action group remains adjacent to the frame. Size limits and centering tests alone were insufficient product validation.

`syncPreviewJoins` adds an owned HTML Watch stream button to the native preview user card while the incoming session is joinable. It invokes the existing native `onJoin`, stops tile-event propagation, and is removed on state change, theme disable or disposal. The native hover-only join artwork is hidden only while that button is present. Native preview artwork covers the frame without stretching, while avatar/loading artwork is capped at 160 px. Native media/session objects are not replaced by the UI action.

Players share a consistent box model across available/playing content and grid/focus views. Playback controls sit in a stable strip below the picture, with `object-fit: contain` preserving source aspect ratio. Since dev.2, the unopened preview reserves that same strip. `syncActionDock` adds owned HTML action buttons to the single/focused player's strip, or a footer below an unfocused grid. Grid allocation subtracts the footer height from the video budget. The side rails remain for pagination and the preview toggle, with a fixed 32 px basis.

The old native view/pop-out action wrappers are hidden only while replacements exist; Vue-owned nodes are never reparented. The native player's pop-out takes precedence, so no second pop-out is shown. Detection must match native `.tsv-button` nodes, not the helper's own copied icon: otherwise a fallback pop-out sees itself and oscillates between creation/removal. Cloned native icons sit inside 32 px buttons (24 px in very narrow tiles). Cleanup restores all source markers and removes owned footers/groups.

Native menu opening requires both the visible target and valid coordinates. `onOpenViewSettings` passes `event.target` to its overlay manager as the owner. Dispatching a click on the hidden source can immediately dismiss the menu. Forward through the native button's `clicked` method with the visible owned button as target and its center coordinates. Isolate Enter/Space from tile actions, but let Escape bubble to the native menu manager. Test an actual open menu and its dismissal, not just handler counts. CDP Enter needs the complete key event, including carriage-return text, for a native HTML button's default click.

The preview toggle is a native HTML button with an empty text node, a CSS chevron, `aria-label`, `title` and `aria-expanded`. It occupies 28×28 CSS pixels in the right action rail beside the preview area. Position comes from native tile bounds; direction follows whether previews are beside or below the focus. Collapsing uses visibility plus `inert` on the other tiles, retaining mounted players and excluding hidden controls from keyboard navigation. Never implement collapse by leaving streams or replacing the native session list.

Only chat/tray preferences are stored under `tsix.layout.chatVisible` and `tsix.layout.streamTrayCollapsed`. Storage failures fall back to in-memory preferences. Boost state is not persisted to a profile or localStorage.

Hidden chat must retain a measurable viewport. `display:none` reduced the native virtual list to zero width/height and deferred message layout until reopening. `syncChatVisibility` retains the last shown panel height; CSS takes the panel out of flow and hides it with visibility/opacity while `inert` and `aria-hidden` exclude interaction. The native list can continue rendering incoming rows and following the bottom; an older reading position stays anchored. Restore owned height/attributes on show, theme disable and disposal. `tests/stream-chat-refresh.mjs` exercises the exact installed Vue/list with local synthetic messages, including already-rendered rows on reveal, drafts, scroll preservation and cleanup.

### Tree density and broadcast integration

Tree rows are virtualized. Changing CSS row height without refreshing TeamSpeak's cached measurements can leave gaps, clipping or incorrect scrolling. The current Small/Medium/Large compact row heights are 28/30/34 px; detailed rows use 40/44/48 px. The workspace helper and `client.mjs refresh-tree` resolve the same CSS metrics into the native variable cache and tree fields, preserving scroll and pane widths. Do not revive a separate set of JavaScript-only density constants.

Use observed native class names and tokens rather than Vue `data-v-*` hashes in the theme. `Test-Theme.ps1` checks the official manifest/schema, local assets and observed selector classes, but cannot prove runtime ownership, virtual-list correctness or playback.

Broadcast status must use the native outbound session collection, not the presence of a preview tile. `createBroadcast` reads the native sharing menu component's `allSessions` getter; hiding an own-stream preview does not mean sharing has stopped. Paused sharing remains visible. Viewer records are deduplicated by native server/client or chat-user identity, and unavailable names have a fallback. Keep identity values out of published diagnostics.

The broadcast badge lives inside the middle `.main-pane-layout` column above the `.ts-server-status-bar` Start Stream action, without reserving height or resizing native panes. Its owned ResizeObserver schedules measurement of the root, column and footer; native layout and input state remain untouched. Viewer details open upward within the column; fullscreen places the badge top-right with details below it. Disconnect the observer on stop, theme disable and disposal. `tests/broadcast.mjs` checks identical shell geometry before/during/after sharing, column resizing, workspace clearance, narrow sizes and fullscreen. The earlier bottom-right workspace position was rejected during actual sharing because it covered stream controls.

The stream helper owns the native sharing split-button's keyboard behavior. The workspace helper explicitly excludes it, including the interval between detach and reattach, to avoid double activation. Only the helper's own broadcast indicator moves into fullscreen; native players remain under native ownership. Keep this ownership split when changing toolbar accessibility.

## Focus latency and input handling

Native beta5 `enterFocusModeAfterDelay` waits 150 ms to distinguish a click from a double-click. Native grid/tile transitions add roughly 200 ms. Changing the player box at the same time made focus/unfocus feel delayed and unstable.

The helper emits the native `enter-focus-mode` event immediately and calls `update(record, true)` in the same event turn, so pane allocation is committed before Vue paints the destination layout. Tile transitions are 120 ms; reduced-motion mode disables geometry animation. Existing methods are restored when the player stops qualifying, enters native fullscreen, or the helper is removed.

Removing the delay exposed a separate failure: the first click moves the preview, so the second click can land on another tile or empty space. A zero-delay Playwright `dblclick` missed this. Testing a 90 ms interval reproduced it.

`installFocusGestures` remembers the first trusted click's original player, position and prior layout. A nearby second click within the current 400 ms / 5 px thresholds targets that original player and restores the prior mode before native fullscreen. The matching subsequent `dblclick` is consumed to prevent a second activation. These thresholds are helper policy, not a claimed Windows system double-click setting.

Other input contracts:

- Ignore drag gestures and pointer movement beyond the threshold; retain wrappers while native drag state is active so cleanup cannot accidentally re-enable delayed focus.
- Handle Enter/Space only when the player group itself is the event target. Nested controls keep their own behavior. Space activates on keyup and is cancelled on blur; repeated keydown does not activate again.
- Stop range-control events from bubbling into tile focus/drag handlers while preserving range keyboard input.
- Native clickable DIV controls need explicit keyboard semantics. Dispatch menu clicks at the control's center: `HTMLElement.click()` supplies `(0, 0)`, which put coordinate-based menus in the wrong corner.
- Avoid repeated attribute restoration/reapplication during unchanged reconciliation. The stress test observed zero DOM mutations across 50 unchanged synchronizations.
- Exclude chat typing, custom volume readouts and owned toolbar/broadcast mutations from whole-stream reconciliation. Keep changes idempotent and coalesce scheduled work with requestAnimationFrame.

## Volume boost and the renderer freeze

### Two different audio paths

| Path | How volume works | Validation boundary |
| --- | --- | --- |
| Native beta5 stream | The custom transport can expose video-only tracks while native code plays audio. Write `session.volume = percent / 100`; keep HTML volume in 0–1 and `internalVolume` at most 100. | Native backend readback and user-confirmed louder audio; no acoustic amplitude measurement |
| Standard MediaStream with audio tracks | Up to 100% uses normal media playback. Above 100%, a MediaStreamAudioSourceNode and GainNode provide amplification; suppress the video's own audio to prevent duplication. | Actual synthetic audio samples were measured in the browser |

The current native-path detection combines absence of audio tracks with the presence of `navigator.createMediaStreamRequest`. Absence of audio tracks alone is not a general capability test. Do not route every video-only stream into Web Audio and expect native TS6 audio to appear there.

Never assign 3 to `HTMLMediaElement.volume` or send 300 through the unadapted native `vm.volume` setter. Native session gain and HTML media volume are different boundaries. The UI range is 0–300, but the native player's HTML assignment remains legal.

The original slider stays mounted, measurable, hidden and out of normal flow. Its clamped 0–100 model can emit `input` on mute/unmute and silently overwrite native gain. `createVolume` walks from the slider DOM element through `$parent` while `$parent.$el === slider`, finding the outer slider component above its drag helper. It detaches that component's input/model listeners while the custom range owns volume, then restores exact listener identities on disposal.

### Why the original implementation froze TeamSpeak

Vue 2.7 replaces the functional video ref with null and then the element during rendering. A synchronous `$watch(() => vm.videoRef, callback, {sync:true})` ran inside the active render watcher. Reactive reads in the callback added dependencies to that render watcher; writes/ref reassignment caused the render to schedule itself repeatedly. Simple fake-watcher fixtures did not model this behavior and passed while the real renderer locked up.

The repair adapts the exact-build `onConnectionRef` boundary. It preserves native track enablement, media assignment and ref lifecycle, clamps the HTML assignment, and performs no session writes from that callback. Ordinary asynchronous watchers reconcile volume/mute. The ref adapter also reapplies the current clamped level when the media object is unchanged.

That last step fixes another observed failure: rapid mute/unmute followed by media refresh left native gain at 3 but HTML volume at zero. The initial test message described this too broadly as lost gain. The trace distinguished the stale HTML mute level from the unchanged native gain. Always log session gain, session mute, HTML volume, readiness and control ownership separately when diagnosing audio.

### Fullscreen remount handoff

The new native player's first ref executes before the helper can attach its custom control. Leaving native session gain at 3 during that initial ref risks an illegal HTML-volume assignment or a native slider clamp.

For an active connected incoming session, `hook:beforeDestroy` saves gain above 1 in `volumeHandoffs`, a WeakMap keyed by the session object, and temporarily normalizes native gain to 1. The replacement control restores the saved gain only while the session is still connected and its gain remains at that normalized value. `handedOff` prevents a late disposal of the old control from resetting the new control's restored gain. Mute is preserved.

Implications for later patches:

- The handoff depends on session-object continuity, not DOM identity or a persisted identifier. Revalidate if a new TS6 build recreates session objects during presentation changes.
- The handoff temporarily normalizes gain during native player replacement. Tests establish restored gain and playback after remount, not sample-perfect uninterrupted audio.
- Explicit helper removal returns boosted native gain to at most 100%; it must remove the lifecycle hook, watchers, model adapter and custom DOM.
- Media readiness matters. `syncVolumes` waits for metadata/readiness and a frame before adding a new control; it uses metadata events rather than a polling loop.

For standard Web Audio tracks, keep asynchronous graph startup guarded by an epoch/request token. Rapid slider changes must not revive an obsolete graph. Mute/pause must silence it; source replacement, unsupported output-device routing, startup failure and disposal must release it and restore native playback. Do not stop or replace the underlying tracks as cleanup for a gain node.

## Fullscreen presentation and resize warnings

### Fullscreen is a native state transition

`fullscreenRootEl()` returns `document.documentElement`. A check against `video:fullscreen` alone misses beta5 fullscreen. Native `item.layoutMode.kind === 'fullscreen'`, `fullscreenTileId`, `didInitiateFullscreen` and `presented` can change before `document.fullscreenElement` becomes non-null.

The same distinction matters in CSS: a selector excluding only `.video-stream:fullscreen` can still match a native fullscreen player. Inspect the player's `.is-fullscreen` class and portal context when changing fullscreen-specific styles.

Native entry saves `priorLayoutMode`, changes the mode, and requests fullscreen. The stream portal moves to its fullscreen target and remounts the player. `onFullscreenChanged` restores the previous mode on exit and updates the grid. The helper stops its normal pane allocation during both pending and active presentation; it also reruns native grid layout on exit.

Do not rely on a fixed 500 ms sleep to prove entry. A hidden CEF window can leave fullscreen pending. Tests must wait for the actual fullscreen state, loaded player/control, expected gain/mute and advancing frames. After exit, allow native mode reconciliation before saving a new baseline; otherwise a test can accidentally save a stale fullscreen mode and later restore it without browser fullscreen.

### The final root cause

The warning also reproduced with the custom slider disabled and with the project theme disabled. The earlier claim that the volume enhancement alone caused it is superseded.

The native virtual chat list creates two observers through an aliased constructor:

```text
const Observer = host.ResizeObserver
resize     -> validate row registration -> controller.measure(batch)
hostResize -> controller.refreshLayout()
```

Those methods synchronously enter `transaction`, update canvas height/row geometry, and can resize another observed element during the same delivery cycle. Chromium then reports `ResizeObserver loop completed with undelivered notifications.` Searching only for the literal `new ResizeObserver` missed these `new Observer` calls.

The owning controller is available through:

```javascript
chatElement.__vue__.getVirtualList().getController()
```

Relevant native state includes `resize`, `hostResize`, `byElement`, `registrations`, `engine.geometry`, `layoutDirty`, `rootElement` and `disposed`. Native measurement checks bind a row to its key, version and geometry epoch; preserve those checks when deferring work.

### The production adapter

`syncChatLayout` tracks only the current viewer's chat controller while the project theme is enabled. `deferChatLayout` wraps its `measure` and `refreshLayout` methods:

1. Collect the latest measurement per row key in a Map.
2. Mark layout dirty when a refresh is requested, without writing geometry immediately.
3. Schedule one animation frame.
4. Call the original refresh, then the original measurement method. Native epoch/version validation rejects stale entries.
5. Skip work for a disposed controller or disconnected root.

Disposal cancels the queued frame, flushes valid pending work outside observer delivery, and restores original property descriptors. If a method originally came from the prototype, delete the owned override rather than leaving a new own property. Do not overwrite another owner's replacement.

No global ResizeObserver, native observer instance, error handler, virtual-list engine or installed client file is replaced in the final fix. The adapter also applies to the viewer's idle chat, since resizing that list can trigger the same transaction pattern without active playback.

### Approaches that did not resolve the warning

| Investigation | Result and implication |
| --- | --- |
| Delaying volume-control creation or hiding the native slider differently | Did not establish the resize root cause. Keep readiness handling for its lifecycle purpose, not as a warning fix. |
| Deferring the viewer full-area observer or individual chat input/scroll observers | Warning remained. These were not the virtual list's own geometry transactions. |
| Deferring all inspected ordinary chat observers and resize directives | Still missed the virtual-list observers created through an aliased constructor. Trace every relevant observer before broadening a production patch. |
| Outer-pane overflow changes or chat size/layout containment | Did not eliminate warnings consistently. These experiments were discarded. |
| Hiding background chat during native presentation | Improved entry but left resize/return warnings. It moved the problem and changed layout behavior. |
| Assuming the slider caused the warning because removing it once appeared to help | Broader native baseline comparisons disproved the attribution. Repeat at several sizes and chat states. |
| Allowing one or two warnings in fullscreen tests | Was temporary diagnostic tolerance. Current acceptance requires zero. |

A diagnostic-only wrapper around the ResizeObserver constructor, combined with a reversible Info → Chat remount, exposed the missing native virtual-list callbacks. Existing observers are not instrumented merely by replacing the constructor after they were created. Restore the constructor, remount the diagnostic components back through normal navigation, and remove every listener/temporary override afterward. This diagnostic technique is not part of the shipped helper.

## Tests and the claims they support

| Test | What it protects | Important boundary |
| --- | --- | --- |
| [stream-tray.mjs](../tests/stream-tray.mjs), default and `TSIX_STREAM_MODEL=beta5` | Tray state, portal nesting, focus/grid transitions, pointer/keyboard, inert previews, PIP/call geometry, disposal and media identity | Simulated layout/session model |
| [stream-chat.mjs](../tests/stream-chat.mjs) | Ten unopened/playing comparisons at five sizes, grouped control proximity, pointer/Enter/Space joining, native grid continuity, composer/draft and cleanup | Simulated native structure |
| [stream-polish.mjs](../tests/stream-polish.mjs) | 40 immediate focus actions, realistic double-click intervals, drag/Space cancellation, four sizes, 50 idle syncs, ten reattachments | Handler timing excludes transport/render latency |
| [stream-volume.mjs](../tests/stream-volume.mjs) | Real Web Audio samples, mute, keyboard endpoints, graph failure/cancellation/cleanup and native-gain simulation | Measured synthetic audio is not a native acoustic measurement |
| [stream-volume-vue.mjs](../tests/stream-volume-vue.mjs) | Exact Vue functional refs, bounded reproduction of the old freeze, 100 renders, ten 300% remounts, stale mute and exact cleanup | Exact Vue; simulated player/session backend |
| [stream-resize.mjs](../tests/stream-resize.mjs) | Exact installed virtual-list module, 32 size changes, native anchoring, stale-measurement rejection and ten cleanup cycles | Baseline had 39 in-observer transactions but no browser warning in this compact fixture; patched count was zero |
| [layout-live.mjs](../tests/layout-live.mjs) | Native sizes/scales, chat hit testing and optional unopened-preview case | Renderer emulation is not physical monitor/DPI testing |
| [stream-preview-live.mjs](../tests/stream-preview-live.mjs) | Eight exact unopened/playing frame comparisons across four sizes and both chat states, real Watch button click, grouped native controls, draft and composer | Opens one incoming stream once when invoked with `--exercise-preview`; restores its original viewing/audio/layout state |
| [stream-focus-live.mjs](../tests/stream-focus-live.mjs) | Native focus/chat/fullscreen return, controls and decoded frames | `--allow-still-source` deliberately does not certify advancing playback |
| [stream-volume-live.mjs](../tests/stream-volume-live.mjs) | Backend gain readback, 100 native renders, mute/unmute, media refresh and HTML boundary | Temporarily changes real stream volume/mute |
| [stream-fullscreen-live.mjs](../tests/stream-fullscreen-live.mjs) | 18 native entry/return cycles: three sizes × two chat states × 100%, 300%, muted 300% | One live incoming audio stream; no live multi-source claim |
| Broadcast, workspace-control and shell suites | Viewer status, native control ownership, keyboard behavior, native navigation and cleanup | Browser fixtures; separate live checks where available |

The final live fullscreen matrix passed with zero resize warnings and zero runtime errors, native gain readback of 1 or 3 as requested, advancing decoded frames and unchanged draft. The installed-client fullscreen check passed again after deployment. All ten offline browser runs and the deployment/package checks passed. Full dated evidence is in [validation](validation.md).

The exact native test module IDs are **62893** for Vue and **8757** for the virtual list. These IDs and extraction boundaries are build-specific. `stream-resize.mjs` verifies the supported main.js hash before extracting them. Never update a test's module IDs or weaken the hash assertion just to make an unreviewed client update pass.

`browser-settle.mjs` waits for stable measured rectangles over several frames and at least 130 ms. Waiting only for an attribute/model change tested intermediate geometry during the 120 ms animation and produced false failures. Conversely, a fixed delay alone is insufficient for native fullscreen/media readiness.

## Efficient investigation workflow

1. Read `release.json`, this handoff and the current validation entry. Check the actual supported client resources before attaching.
2. Use `node tools/client.mjs inspect` and `node tools/streams.mjs status`. Verify main context, active official theme, loaded helper versions, real viewer count and current player state.
3. Confirm `document.hidden === false` for fullscreen/screenshot work. `document.hasFocus()` was true while visibility was hidden in one failed run; it is not a sufficient precondition. Minimized CEF can defer animation frames, observer delivery, screenshots and fullscreen completion.
4. Reproduce with an actual incoming audio-capable stream when testing gain. Check decoded-frame advancement, not just `readyState === 4`. Use synthetic fixtures for unavailable sources and label that evidence accurately.
5. Capture the current layout mode, size/scale, pane widths, chat/tray choice, draft, scroll, focus, session gain/mute and media references before a live test. Restore state in `finally`, including after a failed test.
6. Start with a failing test or measured native baseline. Separate source CSS, helper behavior, native behavior and timing effects. Change one causal mechanism at a time.
7. Inspect all observer construction paths, including aliased constructors and controllers outside Vue component data. Replacing already-bound methods does not replace callbacks captured by an existing observer.
8. Validate functional refs with the exact installed Vue module. Validate virtual-list changes with its exact installed module. Use the real client for portal remounts, native session gain and warnings.
9. Stop widening the test matrix once the relevant checks pass unless new changes/failures justify it. Keep evidence and tests; do not ship diagnostic patches.

The Browser plugin was unavailable during this work, so offline tests used Playwright with installed Edge in isolated profiles. Reuse an available Playwright installation via `TSIX_PLAYWRIGHT_MODULE`; `TSIX_BROWSER_CHANNEL=msedge` selects Edge. These are development dependencies and are not shipped with the helper.

Native inspection uses the repository's verified CEF transport. A sandbox CIM-access error was resolved by running that verified tool with the required host permission, not by deleting the process-owner check. Native OS screenshot/activation access was separately blocked by product policy; do not work around that through another OS helper. CEF inspection/capture was usable when the user restored the window. Reject blank captures as evidence.

A separate TS6 profile/second-client launch was not validated. Running `TeamSpeak.exe --help` forwarded to the existing browser session. Do not assume TS3 `-nosingleinstance` flags or Chromium profile switches isolate TS6's account database. The user supplied the live incoming test stream instead.

## Deployment and recovery knowledge

The usual per-user locations are:

| Item | Location |
| --- | --- |
| Native executable/resources | `%LOCALAPPDATA%\Programs\TeamSpeak\` |
| Official extension schema/docs | Native install `docs\extensions.json` and `docs\Extensions.md` |
| Official project theme | `%APPDATA%\TeamSpeak\Default\extensions\local.tsix.layout` |
| Native profile | `%APPDATA%\TeamSpeak\Default` |
| Helper copies and ownership state | `%LOCALAPPDATA%\TS6-Layout\persistence\` |
| Theme backups | `%LOCALAPPDATA%\TS6-Layout\backups\` |

`cdp.mjs` verifies that the listener is loopback-only, belongs to the installed TeamSpeak executable, and exposes the expected `tsui://default/index.html` main document/bridge. Pop-out access requires explicit target/context selection. Runtime entry points enforce the exact build; setup checks resource hashes. Preserve all of these checks.

The official theme loader inserts `link#userStyle`. After deploying CSS, a cache-busted link reload and its load event can verify the installed version without restarting the client. Helper attachment alone does not prove that the matching stylesheet is loaded. Inspect the computed `--tsix-layout-version`, both helper versions and source-versus-installed hashes.

Setup uses audited native Appearance methods to refresh/select the extension, select Compact tree mode and choose Dynamic chat formatting controls. Normal later launches respect manual appearance choices. Use the native formatting preference rather than hiding the composer toolbar through layout-breaking CSS. The Appearance module binding and variable cache are part of the client-build audit, not generic browser APIs.

When hot-updating an active player, snapshot audio state first. Explicit disposal can normalize boost to 100%; restore the user's selected level through the newly attached control where appropriate. Verify media identity for attachment and pane-width preservation. Replacing a helper during fullscreen is intentionally refused; exit fullscreen first.

Keep these version surfaces aligned:

- `release.json`: package `version` and `themeVersion`;
- theme `package.json` and CSS `--tsix-layout-version`;
- stream/workspace helper `version` fields;
- `session.mjs` setup-ready version check;
- current README, release instructions, changelog and validation entry.

`Install.ps1 -Update -RepairShortcut` uses the reversible updater. Shortcut repair is restricted to recorded launch-equivalent metadata changes, preserves the current file in history, and refuses changed execution flags or user launch edits. Old helper releases and backups remain recoverable. Do not overwrite an unrecognized shortcut to bypass an ownership failure.

Managed persistence covers the per-user **Start Menu shortcut**. Direct executable launches, protocol links and pre-existing taskbar pins bypass attachment. A source edit or live attachment does not update the saved helper copy for next launch; deployment and hash verification are separate steps.

The release builder uses an explicit allowlist and never overwrites an existing archive. Build a fresh version/output path, then run `tests/release.ps1` for inventory, private-data exclusion, checksums, extracted-package preflight and unsupported-client refusal. `-PackageOnly` omits installed-client preflight and should be reported as such. The 0.9.2 archive was validated locally; nothing was published.

Use [development](development.md#recovery) for detach/restore commands. Theme/layout backups are cosmetic recovery, not account/identity backups. Do not modify the profile database to repair a layout or expose credentials, account identifiers, raw media/session data or personal screenshots in repository evidence. Keep temporary traces, local client extracts and private captures outside distributable source.

## Remaining acceptance and useful follow-up coverage

Confirmed acceptance is one live incoming audio stream on the supported local beta5 installation. Still needed for broader release confidence:

- Two or more live sources: switch focus, collapse/expand previews, pagination, drag, end the focused source, portrait/aspect changes and PIP/call combinations.
- Long-running incoming playback and audio; active native pop-out playback and return.
- Physical Windows DPI/monitor transitions, further appearance combinations, and large trees/chat histories.
- Fresh install, full cold launch, update and uninstall on a second Windows PC.
- Native screen-reader behavior beyond the implemented labels, roles, keyboard handling and focus tests.

Useful additional regression targets, not confirmed defects: theme disable/removal while a boost handoff is pending, incoming session-object replacement, user/native gain changes during a handoff, and controller replacement while measurements are queued. Keep epoch/version rejection, exact cleanup and user state restoration in those tests.

For a future client update, re-audit the player ref/volume setter, slider model ownership, session-state values, fullscreen portal lifecycle, virtual-list controller API, Appearance binding and tree cache together. Passing selectors alone cannot establish compatibility with these behavioral contracts.
