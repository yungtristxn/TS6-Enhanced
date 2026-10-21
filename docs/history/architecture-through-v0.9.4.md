Historical architecture notes. Current contracts are in [architecture](../architecture.md) and [stream maintenance](../stream-maintenance.md).

# Architecture and evidence

For current stream contracts, debugging lessons and a regression map, start with [stream maintenance knowledge](../stream-maintenance.md). Later sections below retain historical implementations and build evidence.

## beta5 compatibility — 2026-10-13

The current target is **6.0.0-beta5, build 1791901251**; historical beta4.1 evidence below describes that earlier build. Setup pins beta5's UI resource hashes and runtime entry points continue to refuse other builds. The native Appearance getter now closes over module `Q`, whose `Id.sharedInstance()` exposes the audited settings methods.

beta5 replaces `layoutStreams`, `layoutViewers` and `streamRefs` with `flatTiles`, payload kinds, `refForTile()` and `isFocused()`. A read-only adapter normalizes those fields for the helper; no native getters, sessions or component owners are replaced. Call participants, non-video tiles and PIP preserve native geometry. Fullscreen clears stage/tray markers, including beta5's document-root fullscreen.

The native content-mode and Settings transitions can remount beta5's preview portal. Use `tests/layout-live.mjs` for the current sizing checks and the explicit stream checks in [development](../development.md#explicit-live-checks) for media behavior. `redesign-live.mjs` is now an alias of the layout check; older content-preservation flags are not its current contract.

## Current layout contract — 0.9.4

The native sidebar, search/resources, voice toolbar, profile footer, panel splitters and document tab order own the shell. The custom navigator/drawer, relocated voice dock, device-warning disclosure and shell-wide keyboard trap are removed. The workspace helper retains shared density/cache measurements and scoped keyboard support for native controls; it preserves tree width when the native sidebar control is used.

The stream helper recognizes beta5's portal host and display:contents context rather than assuming the old direct-child row. A single stream uses the same frame while available, joining or playing; there is no separate unopened-preview size cap. `data-tsix-stream-layout` identifies single/grid geometry independently of the content state. Chat receives a measurable minimum, and its composer must remain within the visible pane. Regular grids retain native automatic sizing; single/focused/collapsed stages use remaining space while reserving chat. Native divider gestures update the preferred split instead of being overwritten by reconciliation.

Show/Hide previews is a labelled 28 px chevron in the native side rail, aligned with the other preview tiles and clear of the upper action group. Show/Hide chat retains its toolbar. Native view/pop-out controls are grouped beside the upper-right stage edge with 32 px bounded targets; their Vue-owned nodes are not reparented. An owned Watch stream button invokes the existing native `onJoin` action and supports ordinary button keyboard behavior. Native preview artwork covers the frame, while the avatar remains bounded. All playing streams share a stable picture/control box in grid and focus views; tiny tiles show primary actions and reveal the full volume slider after focusing. Owned buttons, region/layout markers and style properties are restored on disposal. Reconciliation is coalesced to animation frames, skips unchanged attributes, and ignores chat typing and volume readout mutations. Metadata events wake pending volume controls without polling.

The exact-build player focus method is wrapped while an active tile can enter or leave focus. It emits the native focus event immediately and commits pane allocation in the same event turn, replacing the native 150 ms click delay. A scoped second-click record preserves the originating player and previous layout when a moving tile changes the hit target. Drag gestures and nested controls do not trigger focus; Enter/Space work from the player group, with Space cancelled on blur. Native method identities and all document listeners are restored on disposal. Tile geometry transitions take 120 ms and respect reduced motion. No synchronous Vue watcher is installed.

Fullscreen mode is recognized before the browser transition completes and watched through the native presented state. beta5 remounts the player; tests follow the same session on return. The earlier ResizeObserver warning also reproduces with the theme and volume helper disabled: native virtual-list row measurements and host resizes synchronously enter geometry transactions. The helper wraps only the current chat list controller's `measure` and `refreshLayout`, coalescing the latest measurements per key into one animation frame. Native epoch/version checks and anchoring remain authoritative. Cleanup cancels queued work, flushes valid pending state, and restores exact original method descriptors. No global observer or error handler is changed.

Native boost is handed off across an active incoming session's player destruction/remount. A per-session weak map retains the chosen gain; the outgoing component temporarily normalizes it before the new native functional ref runs, then the new control restores it. This avoids the native HTML-volume exception and hidden slider clamp. Explicit helper removal still restores native gain to at most 100%. Media replacement and same-media ref updates reconcile the current mute state. See [validation](../validation.md) for the strict live matrix.

## Previous shell contract — 0.8.0 (superseded)

The workspace is owned by a real server-tree component, excluding `.preview` and Appearance components. Four explicit destinations share a column; a drawer replaces it when a scaled sidebar and useful content width cannot fit. Native tree, resource, profile, voice and player components keep their owners. Stream volume has the exact-build callback adapter described below; other callbacks retain native behavior. The helper supplies a scoped keyboard sequence rather than moving Vue-owned nodes between components. Screen-reader acceptance remains outstanding.

Root size tokens define Small/Medium/Large rows (28/30/34px) and detailed rows (40/44/48px). The workspace helper resolves the same CSS metrics into the native cache and refreshes trees when display size changes. Navigation mode is applied before width is measured. Reconciliation is coalesced, DOM text updates are idempotent, and disposal cancels queued work. The native sidebar stays expanded when entering Settings; original geometry is restored when the helper is removed.

Device recovery uses a compact status disclosure with the full warning in its accessible label. Expanded native selectors occupy a bounded scroll area with the collapse control at the top. This supersedes the older always-visible-heading presentation below.

Chat remains available during streams. Hide/Show chat stores only `tsix.layout.chatVisible`; focus mode uses the full stage and shared mode reserves space for the existing chat component. Tray and chat choices survive reattachment, including in-memory fallback when storage is unavailable. Native media objects are retained. Space is armed on keydown and cancelled on blur across workspace, stream and broadcast controls.

Current evidence and limits are in [validation](../validation.md). The following sections retain build provenance and implementation history; superseded geometry/navigation descriptions are not the 0.8.0 contract.

Incoming volume uses an accessible 0–300% range beside the native mute button. In beta5, `navigator.createMediaStreamRequest()` provides a video-only track; audio is handled by the native session backend. The control writes gain through the existing `session.volume` setter, while keeping `internalVolume` and HTML video volume at or below 100%. An exact-build, per-player `onConnectionRef` adapter preserves native media assignment while clamping the HTML volume assignment above 100%; it performs no session writes during rendering. The hidden native slider's model listener is detached from the outer slider component (above its drag-helper wrapper), because its clamped value would otherwise reset native gain on unmute. Original callback and listener identities are restored on disposal. Removing the helper or disabling the theme resets gain above 100% to 100%. Boost is not stored by the helper.

Never synchronously watch `videoRef` or mutate native session state from a functional-ref callback. beta5 clears and reassigns the ref during rendering. A synchronous watcher callback reads reactive values while the render watcher is active, making rendering depend on its own ref assignments and creating an endless render loop. `tests/stream-volume-vue.mjs` reproduces this failure with a bounded loop using the exact installed Vue 2.7.16 module; the fixed helper passes repeated refs, native model feedback, media replacement and disposal.

For standard MediaStreams containing audio tracks, levels up to 100% retain native playback; higher levels use a temporary Web Audio source and gain, with the original video's audio suppressed. Mute, pause, media replacement, output-device compatibility, failed startup and disposal are handled without replacing or stopping tracks. The [Web Audio stream-source API](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamSource) provides this path. Synthetic signal tests measure that amplification. Native TS6 gain 3 is verified by backend session readback, successful live player refresh and user-confirmed louder audio with responsive controls; no acoustic amplitude measurement was made.

Discovery and live verification: 2026-10-08; workspace update 2026-10-09, Windows.

## Installed client

- Executable: `%LOCALAPPDATA%\Programs\TeamSpeak\TeamSpeak.exe`
- UI: `%LOCALAPPDATA%\Programs\TeamSpeak\html\client_ui\{index.html,main.css,main.js}`
- Official documentation/schema: `%LOCALAPPDATA%\Programs\TeamSpeak\docs\{Extensions.md,extensions.json}`
- Active profile: `%APPDATA%\TeamSpeak\Default`
- Official extensions: `%APPDATA%\TeamSpeak\Default\extensions` (initially empty)
- Chromium cache/user data: `%LOCALAPPDATA%\TeamSpeak`; not the theme install location.
- Runtime `getClientLibVersion`: **6.0.0-beta4.1 [Build: 1779880475]**. The Windows uninstall registry's 5.0.0 value and coarse PE 6.0.0.0 product version are not the exact build.

Applicable instructions: the user's home/ancestor directories had no AGENTS.md; `VibeCoding/AGENTS.md` directs ordinary scripts, readable inspection, and no Defender weakening. No existing TS6 project was found in the inspected workspace; this project was created separately.

SHA-256 fingerprints (installed resources were read, not patched):

| Resource | SHA-256 |
|---|---|
| TeamSpeak.exe | `5938641D3D05596C8F842652B554EC253A55CC34DC62B522D99E91AEE95F06EC` |
| main.css | `E782B8A952FB38A61C6A35D0B55DAC496BCA8773ABCB42F5F75C0A5D8552DDB4` |
| main.js | `A4CAF17C4B6C10E9A5277DFE738DBBCEA01032F92A6B191B4F80ECA6EE26962D` |
| extensions.json | `FCA0AE733909066246F98E2B04A3A9A0CFC07D72FB6BE6C737CAD8F9B5358633` |

## Three contexts

1. **Main window:** `tsui://default/index.html`, without a `popup` query parameter. Live `.tsv-window` contains `.sidebar-pane-layout` and `.tsv-activity`, whose main and detail panes retain native resize handles.
2. **In-client viewer:** `.tsv-screenshare` inside the detail pane. Its `fullArea` ref is `.tsv-body > .tsv-scroll-area-v`. The stream region and `.ts-chat-container` are children of that measured element. No stream is needed to inspect the chat branch; the stream branch was verified in the installed render function.
3. **Native stream pop-out:** same document with a `popup` query and `#/popup`. A separate CEF target. The actual empty pop-out loaded `#userStyle` from `tsui://extension/local.tsix.layout/layout.css`. Its `.popup__content` hosts `.tsv-screenshare`, but the render function omits chat when `isPopout` is true. Never copy its URL parameters into reports.

The loader scans the extension manifest and rewrites local asset paths to `tsui://extension/<identifier>/...`. Selection inserts a `link#userStyle`. Manifest acceptance and stylesheet loading were verified in the official UI, not just simulated with a pasted style element.

## Selector and variable provenance

The theme deliberately contains no Vue `data-v-*` hashes. Those are only in the version-specific synthetic fixture to load the client's scoped base CSS.

| Theme target | Evidence in installed resources / live DOM | Reason |
|---|---|---|
| `--channel-height`, `--channel-spacing` | Bundled dark theme in main.js; computed live as 30px and `2*(8px-1px)` | Base channel density |
| `--ts-tree-*-height-*` | main.css row height declarations; tree `mounted()` reads all four using `variableCache.get` | Shared CSS and virtual-list geometry |
| `.ts-server-tree-wrapper`, `.scroller`, `.ts-server-tree-scroller` | Live main window and main.css | Scope density, inspect scroll offsets, preserve native keyboard entry |
| `.ts-server-tree-channel-info`, `.ts-server-tree-client-info` | Live rows and main.css | Reduce local vertical margins |
| `.tsv-screenshare > .tsv-body > .tsv-scroll-area-v` | Installed `ts-screenshare` render function; live empty viewer | Measured stream area and direct chat parent |
| `.screen-grid-wrapper`, `.screen-video-wrapper`, `.screen-small-bar__client` | Installed stream render function and scoped main.css | Existing grid/participant targets, without overriding tile positions |
| `.ts-chat-container`, `.screen-grid`, `.tsv-mar-t-small` | Live channel chat and stream render function | Hide mounted chat and adjacent divider when a tile is rendered |
| `.screen-overlay__bottom`, `.screen-overlay`, `.screen-overlay__hero-actions__action-volume-slider` | Installed TSScreenshareStream CSS and render function | Reveal existing controls on focus |
| `.tsv-button`, `.video-stream` | Installed CSS/render functions | Focus/fullscreen boundaries |
| `.main-pane-layout > .tsv-body > .tsv-resize-handle > .tsv-resize-handle-info` | Actual main tree pane DOM, ResizeHandle render function and main.css | Native collapse arrow, moved into the toolbar's empty leading slot |
| `.ts-server-header`, `--tsv-icon-size-xlarge`, `--tsv-padding-v/h` | Actual server heading DOM and `.tsv-view-banner` CSS | Reduce the heading's icon and padding without hiding actions |

## CSS versus JavaScript/native behavior

**Official CSS:** row variables, spacing, focus presentation, participant padding, and conditional chat collapse. The theme preserves document order and does not add/remove event handlers or change native pane sizing.

**Chat collapse (v0.2.1):** `fullArea` contains a `.tsv-flex > .screen-grid-wrapper > .screen-grid > .screen-video-wrapper` only when TS6 renders a stream tile there. A `:has()` rule applies `display:none` to its direct `.ts-chat-container`; another hides only the adjacent `.tsv-mar-t-small` divider. Checking a tile rather than the wrapper preserves chat for the native empty invitation state. Multiple tiles keep chat collapsed until the last disappears. The chat remains mounted, and hidden controls leave layout and keyboard navigation. No new JavaScript, state polling or persisted setting is required.

This replaces the v0.1/v0.2 wide-pane docking rules entirely: the measured area now keeps its full native width, overflow behavior and positioning. When `isGridOpenedInPopup` suppresses the main grid, the selector stops matching and main chat returns; the pop-out itself has no chat component. v0.3 adds the optional stage behavior below.

**Tree cache helper:** beta4.1 retains stale cached dimensions after stylesheet changes. `tools/client.mjs refresh-tree` reads the same four variables in the cache element's parent context, resolves CSS expressions with a temporary invisible measurement node, validates all dimensions, refreshes the cache Map, updates visible tree component fields, and invokes the existing `flattenServer()`. It preserves scroll position and removes its probe. The first approach using native `updateSingle` waited for animation frames and stalled when minimized; the final helper measures synchronously and was tested hidden. There is no persistent injected script.

**Workspace helper (v0.2):** `tools/workspace.mjs` uses the same guarded CDP transport, only in the main renderer and only on build 1779880475. `windowLayout` has three slots: sidebar (Medium minimum 62, collapse threshold 200, maximum 420), main/tree (minimum 220), detail (minimum 280). `setSlotCollapsed`, `resizeSlotStarted`, `resizeSlot`, and `resizeSlotEnded` are the exact methods used by native ResizeHandle. They update the native CSS width variables and persist the window layout through the client's own configuration interface. No settings database is edited directly.

The first `apply` saves only numeric geometry and the tree-mode boolean to `.local/workspace-before.json`, then collapses slot 0 and sizes slot 1 to 280 px. `restore` validates and restores those sizes without replacing any other configuration. Compact tree mode was separately selected through the Appearance component's native `onTreeCompactChanged('true')` path; recovery to Detailed uses that UI. `attach` only installs the interaction enhancement, preserving current widths.

`workspace-runtime.js` enhances the existing div control with button role, a descriptive label, `aria-expanded`, tab focus, Enter/Space and a no-drag press. Its click calls native `collapseSidebar()` and the native resize methods to retain the tree width. This is necessary: unmodified native expansion followed by collapse changed a 280 px tree to 428 px in the live test. A scoped MutationObserver and Vue watcher follow control replacement and collapsed state; `dispose()` removes every listener, restores prior attributes and disconnects both observers. There are no polling timers, new DOM buttons, automatic connections or stream commands. The renderer enhancement is temporary; native pane sizes persist. CSS alone cannot supply accessible keyboard event handling or this change to width allocation.

**Stream stage (v0.3):** live inspection found `maximumHeight=728` but `maximumVideoHeight=480.48`. Native `onFullAreaResizeObserver` calculates height using `overrideSplitPercentage` when it is not -1, otherwise `maxVideoAreaHeightPct` (0.66 in-client; 1 in a pop-out). The native grid and focus arrangers hard-code `16/9`; `.video-stream` also has `aspect-ratio:16/9`. The actual capture was 1394×894. CSS chat hiding alone therefore left both a height reservation and letterboxing inside the assumed 16:9 tile.

`tools/streams.mjs` verifies the same loopback listener, executable, TS6 main context and build before attaching `streams-runtime.js`. The runtime saves the original split, sets `overrideSplitPercentage=1`, updates `maximumVideoHeight` and calls native `doUpdateGrid()`. Vue watchers and a scoped mutation observer follow viewer/state changes; they do not replace native methods or player components. The runtime restores the original split when inactive/removed, and re-runs native layout after fullscreen exit. Removal/reattachment during fullscreen is refused until fullscreen exits so recovery does not leave stale geometry. The `--tsix-stream-stage-api:1` CSS sentinel prevents applying the stage without its matching theme.

The helper owns `data-tsix-stream-stage`, rather than guessing a native class. It marks `single` only when there is exactly one eligible session, one rendered stream, no participant tiles and no active drag. In that state the official CSS expands the lone wrapper to its full grid, uses `aspect-ratio:auto` and `object-fit:contain`, and moves the existing 22px side rails into a corner toolbar. The compact channel header uses the observed `--tsv-header-content-header-height` variable. With multiple items the native tile coordinates, side pagination rails, focus selection and drag geometry remain intact; the larger height budget still applies. Fullscreen styling is excluded from the tile override.

Known native `.tsv-button` controls were divs without keyboard semantics. The runtime adds role/label/tab focus and Enter/Space activation for observed stream icons, delegating to the existing click handlers. Focus reveals the original overlay; the theme enlarges its targets. Native `Play`/`StreamMinimize` icon names were verified in main.js for state changes. Disposal restores prior attributes and removes listeners/watchers. No stream join/leave/pause, capture/quality, account or network APIs are called by this helper. Since 0.5.1, the helper stores only its own boolean tray preference.

Selector additions are all observed native classes: `.screen-grid`, `.screen-grid-wrapper`, `.screen-video-wrapper`, `video.video`, `.screenshare__global-hover-actions-wrapper`, `.screenshare__global-hover-actions`, `.tsv-activity-detail`. No generated Vue scope hashes are used. The owned marker is explicitly supplied by the helper, and the existing CSS selector audit now finds 27 native class tokens.

**Pop-out chat:** absent from that document's render branch. It cannot be made visible by CSS. A future helper would need a real independently synchronized chat component or a main-window side-by-side arrangement; embedding another native chat view without verifying its lifecycle is out of scope for this first version. Native binaries have not been modified, and REA/Ghidra are not needed for these findings.

## Native multi-stream selection and automatic attachment

On build 1779880475, the stream picture render binding calls `switchFocusTo(n.item.item)`. That method selects the native focus layout (module 42738) when several sessions exist, or selects the native grid layout (module 1649) when the same already-focused item is clicked. Clicking another picture changes the focus item. The focus arranger retains smaller previews where space permits and includes pagination; fullscreen is separate. A session count of one or fewer clears `item.streamLayout`. This is source evidence, not a several-live-stream acceptance result, and does not establish persistence of a selected stream after a session ends.

### Collapsible focus tray (0.5.0)

The stream helper reads the native `layoutStreams[].focused` flag and resolves each wrapper through `streamRefs[session.uniqueIdentifier]`, the same keys used by `onStreamRef`. It appends one HTML button to the grid wrapper. The button exposes `aria-expanded`, a changing accessible label/title, and native Enter/Space behavior. No session identifiers are rendered or stored outside the native interface.

When collapsed, owned attributes mark the focused and preview tiles. CSS expands the focused tile, reserves its control strip and a 28px reveal strip, and hides the other tiles. Hidden previews remain mounted and become `inert`. Their prior attributes are restored during reconciliation/disposal. The native arranger, session collection, player nodes, and media objects are never replaced. Expanded views keep native tile geometry; the chevron sits at the boundary below the focused tile, clamped inside the stage for small layouts.

From 0.5.1, one boolean is saved under the helper-owned localStorage key `tsix.layout.streamTrayCollapsed`. It survives grid/refocus, theme toggles, pop-outs, renderer reloads and client restarts; only an explicit chevron toggle changes it. No native preference keys or account data are accessed. If storage is unavailable, the preference remains in memory for this renderer and helper reattachments. Drag and fullscreen temporarily remove the tray presentation; fullscreen exit restores it. Vue watchers include focused identities and measured tile geometry, so switching between an unchanged number of streams still updates the tray. Theme removal, navigation, and disposal remove the owned control and restore attributes.

The synthetic browser suite covers this lifecycle. Native multi-stream playback, pagination and source transitions remain acceptance work; see [validation](../validation.md).

`Install-Persistence.ps1` backs up the standard per-user Start Menu shortcut byte-for-byte and replaces it with a hidden PowerShell launcher. An allowlist of launcher/helper source is copied into an immutable LocalAppData release directory. Ownership state records original and installed shortcut hashes. Updates retain previous runtimes and refuse changed shortcuts by default; uninstall restores the exact original. The explicit `-RepairShortcut` option verifies the recorded managed copy, WScript launch properties and header/flags, then preserves the observed shortcut in history before replacing it. Dry-run repair writes nothing; changed target/arguments/user fields or execution flags remain a refusal. It does not register a service, scheduled task, startup entry or protocol handler.

`Start-Layout.ps1` starts a stopped TS6 with loopback-only inspection, or attaches to an already inspected client without restarting it. `session.mjs` waits for the main Vue component and theme sentinels, verifies the exact build, refreshes tree caches and attaches both helpers. It then disconnects and exits. Setup fingerprints the supported resources before deployment. This is automatic reapplication on the managed shortcut path; direct EXE/protocol/pinned-shortcut launches and renderer reloads are not intercepted. The [release validation record](../release-validation.md) distinguishes the tested running-client launch from the still-unverified cold-start path.

From 0.6.0, `Install.cmd` invokes a Windows PowerShell 5.1 bootstrap: validate package/client, resolve or fetch checksum-pinned portable dependencies, install, then activate. Runtime code copies remain immutable; `runtime.json` pins the local Node executable and `.theme-ready` records successful first activation. The first launch calls the exact-build native Appearance adapter, selects this extension and the Compact tree, refreshes the stylesheet, and verifies its release sentinel. This uses native settings persistence without profile-file access. The bootstrap reuses verified download caches, keeps the original shortcut backup, and handles identical launch-setting metadata repairs. It waits for a normally running client to be closed voluntarily; it never terminates the client. See [development](../development.md) for the adapter and runtime lock.

## Sidebar cleanup (0.6.3)

The community promotion has a native `.ts-join-community` container. Hiding it lets the native activity area shrink without reserving an empty gap. The workspace helper identifies standalone Group Chats from `ResourcesGroup.__vue__.stack.sections`: exactly one section with key `matrix-rooms`. It owns `data-tsix-sidebar-section="group-chats"`; CSS hides only that marked group. This works when collapsed headers use combined-tab rendering, without relying on localized labels. Mixed stacks remain visible. The scoped observer follows component replacement and stack rendering; theme disable, mixed-stack changes and disposal restore the prior attribute. No resource collection or account preference is changed.

Profile CSS is limited to the expanded sidebar footer. It removes redundant row padding, reduces the name gap, and reserves a 28x32 edit target plus a 32px-wide settings target. The native avatar, profile handlers and collapsed footer are retained. Long names may still ellipsize; the current live profile fits fully at the native 200px sidebar width.

## Unified navigator (v0.7)

`workspace-runtime.js` 0.6.0 requires both the workspace and navigator CSS contracts. In a full server view at least 820px wide, CSS layers the native sidebar over the tree column and frees the old sidebar's width for the activity. The tree retains its native width and splitter, with a CSS minimum of 320px to fit both native profile accessories and the audio controls. No Vue panel, tree row or media player is reparented or cloned.

With no `.screen-video-wrapper` inside the main window, an adaptive CSS minimum of `clamp(320px, 27vw, 380px)` widens the navigator. The verified native render function unmounts that grid for hidden streams, disabled stream display and pop-out transfer. A returning tile removes the extra minimum. Native slot sizes are never changed by adaptation, so manually wider panes stay wider and the usual stream width returns automatically. The existing ResizeObserver aligns the resource overlay and controls to the rendered width. Wide-mode native action titles are hidden where an owned short label already exists.

The 0.7.4 workspace helper gives audited native clickable DIVs button roles, accessible labels and keyboard activation. Split-menu events stay on their own target, use the target's actual coordinates and respect disabled state. A cancelled Space press cannot activate a newly focused control. Content view buttons expose their current selection with `aria-pressed`; class changes trigger reconciliation. Original attributes and listeners are restored on detach, native node removal or theme disable. The native sharing control remains exclusively owned by the stream helper. No native callback is invoked during reconciliation.

The helper owns only the server selector and Channels/Friends tab buttons. Resource groups are classified by native section keys and activity icons; mixed custom stacks remain accessible. The server selector overlays the native title's measured bounds, leaving bookmark and chat actions separate. Native Search / Connect retains its original behavior. Recent chats use a bounded area beneath the tree only when a native chat activity group exists; Friends shows the native contacts and chat sections. Narrow windows, non-full layouts and views without a server tree fall back to native navigation.

Microphone, speaker and away controls are the original controls positioned with CSS. The profile and settings share a dedicated 48px identity row above a 48px row for labelled Mic, Audio and Status controls. A 48px server utility row sits above that 96px footer. These dimensions share CSS variables with the resource panels and live strip. Native button titles supply tooltips; owned short labels and tooltips are restored on disposal. The helper never changes audio, connects to a server, opens a chat or edits contacts. User activation of native controls still invokes their native handlers.

Owned attributes are recorded and restored on removal or theme disable; hidden tree rows become inert while the resource browser is open. Keyboard tabs support arrows, Home and End; Escape closes the server browser. Resize and mutation observers update geometry without polling. Initial header growth preserves the virtualizer's scroll position after measurement. If native resources need the collapsed sidebar expanded, its original size and pre-collapse value are recorded and restored when this presentation ends; the tree width is retained. Reattachment removes the prior controls and listeners first.

Live navigator checks cover mode switching, keyboard behavior, search focus, bounds/overlaps, small-window fallback, removal and reattachment, and media/audio continuity. See [design QA](../design-qa.md) and [release validation](../release-validation.md). Physical DPI changes and navigation across multiple connected servers remain separate acceptance work.

## Persistent sharing status (local v0.7.2)

The stream helper reads the native stream manager's pure `allSessions` computed getter with an empty data context. That returns the global outbound collection, independent of the current channel, `showOwnStreams`, tile visibility or pop-out layout. A Vue watcher tracks stream count, pause state and viewer metadata; no polling or capture/session commands are used.

Server viewers resolve through the same in-memory `FindClient` lookup used by TeamSpeak's viewer modal. Native avatar URLs are reused, with initials when no image is available. Viewer identities are deduplicated by server/client or chat-user identity across outgoing streams. Unresolved identities, including chat viewers without a server-client object, are explicitly labelled "Viewer (name unavailable)". No names or viewer lists are persisted.

The status strip reserves 72px above the unified sidebar's native utility row. Compact navigation uses a separate bottom row. The existing native sharing button is positioned beside it, retaining its callbacks and menus. Its pause/resume symbol, tooltip and keyboard activation explain the primary action, with a separate labelled menu chevron; the strip leaves that part transparent and passes pointer events through. The viewer disclosure stays above both Channels and Friends. Only the owned strip moves into a container fullscreen element. Direct video-element fullscreen cannot host an HTML overlay.

Theme disable and disposal remove the watcher, disclosure listeners, strip and owned attributes. Sharing ending removes the strip but retains the state watcher for the next session. Synthetic tests cover state changes, viewer joins/leaves, duplicate viewers, hidden previews, geometry, fullscreen and cleanup. Explicit live checks require an existing outgoing stream and never start, pause or stop it.

## References

- Installed `docs/Extensions.md` and `docs/extensions.json` are authoritative for this client.
- [Official-documentation mirror and devtools discussion](https://community.teamspeak.com/t/how-to-create-a-custom-theme-for-teamspeak-6/28018). Its wildcard origin example was not used; a default Node WebSocket connects without it.
- [Channel sizing variables](https://community.teamspeak.com/t/customization-options-for-channel-layout-and-ui-styling/60919/4). Variables were verified locally; global padding reductions from the example were not copied.
- [Right-bounded layout discussion](https://community.teamspeak.com/t/an-option-to-make-ts-right-bounded/62584). The pane reordering snippet was not adopted: it changes visual versus keyboard order and must account for slideovers.
- [Colorful-TeamSpeak source](https://github.com/LeonMarcel-HD/Colorful-TeamSpeak), an example of official theme packaging, not a project dependency.

## v0.4 workspace review additions — 2026-10-09

The v0.4 official theme scopes workspace surface changes and the content-header height to existing `.main-pane-layout`, `.tsv-activity-detail`, `.tsv-content-header-item`, `.tsv-icon-primary` and `.ts-horizontal-separator` elements. Current-run DOM and computed styles verified these targets. The content header moves from 71+4 to 44+1 CSS pixels below the unchanged 44px window toolbar. Tree row variables remain 28/40px; no individual virtual-row size override was added.

The native `.ts-audio-device-recovery` contains two warning groups, each with `h6`, `.ts-audio-device-recovery-description` and `.ts-audio-device-selector`; the latter uses `.multiselect__tags` and `.multiselect__single`. Live inspection showed 15px text on 13px line-height in wrapped device names. CSS repairs that text flow. `workspace-runtime.js` adds one owned native HTML button (`data-tsix-recovery-toggle`) and an owned `data-tsix-recovery` state on the recovery container. Only descriptions/selectors collapse; warning headings remain visible. The original controls are neither cloned nor replaced. Removal/theme disable restores native visibility and removes the owned button/listener. No device-selection API is invoked.

For the guarded single-stream stage, CSS reserves a 36px bottom strip and reduces the video element's available height by that amount. `object-fit:contain` continues to fit the intrinsic source. The global layout/pop-out actions move into the left of this strip; original player actions remain on the right. The native fullscreen element is excluded, and multiple streams retain their native geometry/hover behavior. Helper-owned button metadata now includes labels, titles and disabled semantics, restored on dispose.

`Start-Layout.ps1` never terminates a running process. It uses the existing inspection launcher only if the installed TS6 is stopped; otherwise an existing listener is required. `session.mjs` independently verifies listener ownership and main origin via `cdp.mjs`, then waits up to 15 seconds for Vue and both theme contract variables. It checks exact build and fullscreen state before attaching, updates only the four tree dimension cache values (also when no tree is mounted), then attaches the two in-memory helpers. It exits immediately, preserving pane sizes. No scheduler, startup registration or permanent flag is installed. The main launcher attachment path was exercised repeatedly; complete cold-launch timing remains an acceptance item.
