# Validation

Target: **TeamSpeak 6.0.0-beta5, build 1791901251**, Windows x64. This project remains a preview. Synthetic browser tests and historical native-client checks are different evidence.

## Bottom stream controls — 0.9.4-dev.2, 2026-10-15

- Inspected the actual incoming player and unopened state before editing. Both already measured 1976×1187 at 2562×1394; the defect was the missing preview footer, duplicated pop-out and clipped/detached right-edge actions. See [research, root causes and visual review](stream-controls-review-2026-10-15.md).
- Fourteen isolated preview/chat groups pass, including ten unopened/playing frame comparisons, visible bottom actions, a single pop-out, preserved drafts, grid continuity, divider preference, 50 idle reconciliations with zero DOM writes and full cleanup. Captured and inspected unopened/opened screenshots at 1322 and 360 px; the fixture resumes a real canvas video frame after joining.
- Fifteen beta5 tray groups and nine polish groups pass. These cover keyboard/pointer input, focus and preview transitions, native source ownership, bounded control/icon geometry, volume drag, lifecycle, no idle churn and reduced motion. They remain synthetic evidence.
- `stream-controls-live.mjs --fullscreen` passes eight viewport/chat combinations on the user's outgoing self-stream (2562×1394, 1322×847, 900×650, 640×480), plus native fullscreen return, advancing frames, preserved capture/audio state and zero runtime/ResizeObserver warnings. Enter opens an actual native menu within 640×480; Escape closes it. Screenshots were inspected. The incoming source ended before the final incoming preview/opened comparison, so that final native transition remains unverified; no outbound pause/stop/leave was used as a substitute.
- Browser plugin not available. The guarded existing CDP transport inspected the actual TeamSpeak CEF renderer; bundled Playwright with installed headless Edge ran isolated fixtures. Edge required execution outside the sandbox because its temporary-profile launch failed there.
- Installed 0.9.4-dev.2 with the owner-checked updater and backups; refreshed only the official stylesheet and stream helper, without restarting. Temporary preview CSS was removed. Installed CSS/helper hashes match source; pane sizes and media were preserved. Repeated the live control/menu/fullscreen check against those installed files. Workspace helper and sidebar rules are unchanged. Static schema/assets/56 native selector checks and JavaScript syntax/diff checks pass. No new distributable archive or publication was requested or produced.

## Unified unopened and playing stage — 0.9.4, 2026-10-15

- The user rejected the separate centered preview card in 0.9.3: it still differed from the playing stream's scale and left global actions far away. The acceptance contract is now the same single-stream frame before and after joining, with visible controls attached to the stage.
- Removed preview-only height limits/centering. `data-tsix-stream-layout` selects single/grid geometry independently of available/playing content. Both states use the same chat reservation. Native preview artwork fills the frame without stretching; avatar/loading artwork remains bounded, and a visible HTML Watch stream button delegates to native `onJoin` with pointer/keyboard support.
- Native view settings and pop-out now form an upper-right group of 32 px bounded buttons, separated by 6 px. The native nodes retain their owners; the preview-tray handle stays clear of the group.
- Eight live comparisons passed at 2562×1394, 1322×847, 900×650 and 640×480 with chat shown/hidden. Before/after x, y, width and height match within one CSS pixel. Tests verify action grouping/proximity, real Watch button activation, full preview content bounds, composer access, draft preservation and stable playing media during resizing. Only one temporary join is needed; original viewing/audio/layout state is restored. Accepted screenshots show both states at the same viewport. No runtime or resize errors occurred.
- Browser checks pass for ten single-stream combinations at five sizes, multiple-card grid continuity, pointer/Enter/Space joining, manual split preservation and owned DOM/marker cleanup. Both tray models, focus/preview stress and volume regressions pass. Static schema/55 native selectors, syntax and whitespace checks pass.
- Installed and activated 0.9.4-dev.1 without restarting; official CSS/helpers report 0.9.4 and the temporary stylesheet is removed. Media, audio and pane widths were preserved. The installed-client focus/fullscreen check passed with advancing frames, preserved gain/mute and zero resize warnings. Saved runtime/theme hashes match source, and the local package passes inventory, checksum and extracted installer preflight checks.

## Unopened preview sizing repair — 0.9.3, 2026-10-15

- Reproduced the reported small top-aligned blue card: a fixed 260 px preview budget remained active with chat hidden, leaving approximately 430×242 px of blue content near the top of a 2042×1239 pane. The earlier overflow fix protected chat but did not check useful minimum preview size or positioning.
- Preview-only grids now use native content sizing with a responsive budget of `min(available budget, 32 density units, half the pane height)`. Their portal region centers vertically when chat is hidden. With chat shown, the preview remains bounded above chat. The native large-window blue content measured approximately 821×462 px after the change; before/after screenshots were visually inspected.
- Eight native cases passed: 2562×1394, 1322×847, 900×650 and 640×480, with chat shown/hidden. Assertions cover proportional size, pointer hit testing, a useful large-window minimum, centering, draft preservation and composer access. The test temporarily left/rejoined the incoming stream and restored the original playback, gain, mute, pane widths and chat choice. No runtime or resize errors occurred.
- Browser preview tests pass at five sizes including 360×540, with three unopened cards checked separately for centering/non-overlap. Both tray models and focus/keyboard/cleanup stress regressions pass. The fixture now models native content-sized preview grids; its former fixed-height grid missed the centering behavior. Static schema/selector, JavaScript syntax and whitespace checks pass.
- Installed and activated 0.9.3-dev.1 without restarting. The temporary CSS override was removed; official CSS and helpers report 0.9.3, and installed hashes match source. The installed-client focus/fullscreen check passed with advancing frames, preserved audio and zero resize warnings. The local release package passes inventory, hashes, extracted installer preflight and unsupported-client refusal.

## Fullscreen resize repair — 0.9.2, 2026-10-15

- The user provided a live incoming test stream and enabled audio. The warning reproduced at smaller sizes with the custom slider disabled and with the project theme disabled. This supersedes the earlier attribution to the volume enhancement alone.
- Complete native observer tracing identified the virtual chat list's row/host observers synchronously entering geometry transactions. The final fix coalesces only that chat controller's `measure` and `refreshLayout` work into animation frames. Native validation of stale row epochs/versions, scroll anchoring, all native observers and error reporting remain intact. The earlier experimental observer/CSS changes were discarded.
- **18 strict live fullscreen cycles passed:** 1322×847, 900×650 and 640×480; chat shown/hidden; 100%, 300%, and muted 300%. Every entry/return retained the expected gain/mute, decoded frames advanced, native backend readback confirmed the requested gain, and the draft was unchanged. There were **zero ResizeObserver warnings and zero runtime errors**. Renderer size, chat, gain, mute and prior mode were restored.
- Fixed a second live failure: after rapid mute/unmute and media refresh, native gain remained 3 but HTML volume could retain a stale zero. The adapter now reconciles mute/volume for same-media refs as well as new media. Native gain readback, 100 forced renders, mute/unmute, media replacement and advancing playback pass.
- Active incoming boost now transfers through native fullscreen player remounts. The exact installed Vue 2.7.16 test passes ten remount cycles at 300%, checks legal initial HTML volume, and verifies original ref/model listener restoration and watcher cleanup. The old bounded render-loop reproduction still detects the original freeze.
- `stream-resize.mjs` loads the hash-verified installed virtual-list module and Vue into isolated Edge. Its native baseline performs 39 geometry transactions during ResizeObserver delivery; the patch performs zero. Thirty-two size changes preserve measured rows and bottom anchoring; stale measurements are rejected and ten cleanup cycles restore exact method identities. This compact fixture did not itself emit the browser warning; the real-client baseline and fixed live matrix establish that part of the result.
- Fullscreen tests now reject every resize warning. Browser plugin not available; offline checks use Playwright/Edge and exact local native modules, with no accounts or network media. Multi-source live focus switching, physical DPI, second-PC/cold-launch and extended pop-out acceptance remain outside this result.
- Final deployment: all ten offline browser runs, schema/51 selectors, syntax, isolated deployment/recovery and shortcut persistence checks passed. Installed and activated 0.9.2-dev.1 without a restart; media/audio and pane widths were preserved, the official CSS/helpers report 0.9.2, and installed hashes match source. The installed-client focus/fullscreen check passed again with zero warnings. The local package passes inventory, private-data exclusion, checksums, extracted installer preflight and unsupported-client refusal; no release was published.

## Stream interaction polish — 0.9.1, 2026-10-14

- Removed the native 150 ms focus delay and standardized player/control geometry across grid and focused views. Tile transitions take 120 ms, with reduced-motion support. A realistic 90 ms double-click test exposed clicks landing on moved tiles; the fix retains the original stream and return layout.
- The preview toggle is now an empty, labelled 28×28 px chevron beside the previews, in the native action rail. It passes bounds and pointer-hit tests at 1322×847, 900×650, 640×480 and 360×540. Its dimensions follow [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); animation obeys [reduced-motion preferences](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion). This is not a complete accessibility certification.
- `stream-polish.mjs` passed nine groups: 40 immediate focus/unfocus actions (maximum 0.8 ms handler time in the final fixture run), keyboard/blur cancellation, drag suppression, four double-click targets/timings, 16 preview toggles at four sizes, 50 idle reconciliations with zero DOM mutations, paused-session state, reduced motion and ten detach/reattach cycles. Browser transport/render latency is not included in the handler measurement.
- Both legacy and beta5 tray suites, preview/chat sizing, Web Audio signal checks, native-gain simulation, exact installed Vue 2.7.16 render-loop regression, broadcast, workspace controls and native-shell fixture suites pass without relevant runtime errors. The exact Vue test includes 100 render cycles at gain 3. Browser plugin not available; the suites used Playwright and installed Edge with isolated profiles on loopback fixture pages.
- Installed and activated 0.9.1-dev.1 without restarting TeamSpeak. The official CSS and both helpers report 0.9.1; native navigation, usable chat, unchanged draft and a clean console were verified at 2562×1394. Nine native idle sizing cases pass across Small/Medium/Large at 1322×847, 900×650 and 640×480, then the original size/scale were restored. The idle native screenshot was visually inspected.
- Theme schema/51 native selectors, JavaScript syntax, isolated install/update/restore/uninstall, shortcut recovery and whitespace checks pass. Installed theme and changed helper hashes match source. The local 0.9.1-dev.1 archive passes exact inventory, private-data exclusion, file/archive hashes, extracted installer preflight and unsupported-client refusal; it has not been published.
- **Release blockers:** the user confirmed the only available stream ended before final live tests. The new focus/fullscreen transitions and actual incoming audio through remounts remain unverified; no two-stream live acceptance was possible. The prior native fullscreen ResizeObserver diagnostic remains unresolved. Second-PC/cold-launch, physical DPI and extended pop-out/playback acceptance are still outstanding. These results do not certify production readiness.

## Native layout and stream repair — 0.9.0, 2026-10-14

- Removed the custom navigator overlay/drawer, relocated voice dock, warning disclosure and custom shell Tab routing. Native sidebar/resources, voice controls and splitters remain in place; row density and native keyboard enhancements remain.
- Corrected the single-unopened-stream case with explicit preview/player distinction, beta5 portal ownership and a bounded preview height. The live matrix passed 12 cases: three scales at 1322×847, 900×650 and 640×480, plus a single unopened preview at each viewport. The chat composer remained visible and hit-testable. Actual native screenshots were captured after the user restored the minimized window; the earlier blank capture was rejected.
- Live focus/chat checks passed five cases: focused player with chat, expanded previews, focused player without chat, native fullscreen, and return. Focus/chat changes retained the media object and advancing frames; native fullscreen remounted the player but resumed the same session and retained the tested audio state. The new toolbar avoids the native divider and the control strip stays below the focused picture.
- Fullscreen still emits one transient ResizeObserver diagnostic with the volume enhancement. It settles; the native baseline and helper without volume did not emit it. This remains a known limitation, not a clean-console claim. Main layout checks had no runtime errors.
- Browser regressions cover real beta5 portal nesting, single preview/chat bounds, manual divider preservation, native sidebar/tab order, compact preview controls, volume behavior and the original Vue render-loop reproduction. Evidence and best-practice sources are in [the current review](layout-review-2026-10-14.md).
- Installed 0.9.0-dev.1 through the reversible updater. Theme, stream runtime and workspace runtime hashes match source. The temporary preview stylesheet was removed; the official installed CSS and both helpers report 0.9.0. Final attachment retained the current media and audio state and left the playing stream focused with usable chat. Isolated theme deployment/recovery and shortcut persistence tests passed.

Earlier entries below describe earlier implementations and do not override the 0.9 contract.

## Stream volume through 300% — 2026-10-14

- The initial dev.2 implementation froze the actual client when entering a stream; its earlier synthetic-only pass was insufficient. User approved one restart after in-place renderer recovery timed out. The previous working helper restored responsiveness before the revised boost was attached. No profile database was edited.
- Dev.3 removes synchronous video-ref watchers. `tests/stream-volume-vue.mjs` uses the exact installed Vue 2.7.16 runtime and reproduces the old render loop with a bound of 32 renders. The revised implementation passes 100 renders, media replacement at gain 3, mute/unmute with native slider model feedback, and restoration of the original ref callback/model listener on removal.
- `tests/stream-volume.mjs` passes eight scenario groups in headless Edge: native playback through 100%, real Web Audio sample amplification, keyboard input, mute/unmute, 1322×847 and 640×480 geometry, source replacement, rapid changes, unavailable audio, native-session gain, theme disable and complete disposal. No browser warnings/errors. The existing beta5 stream suite still passes all 15 groups; static theme/schema and syntax checks pass.
- Installed through the reversible updater, preserving theme and shortcut history after verifying identical shortcut launch settings. Installed runtime/CSS hashes match source. Attaching the revised helper displayed the accessible 0–300% range at the original 100%, with native slider hidden and media identity, playback state, session volume and mute unchanged. This attachment required no further restart or connection change.
- `tests/stream-volume-live.mjs --exercise-boost` passed against a real incoming stream: native `requestAllSessions` readback reports gain 3; HTML video stays at 1; 100 native renders, mute/unmute and native player media refresh succeed. The refreshed player reaches readyState 4 and advances from 3 to 12 decoded frames during the final 300 ms observation. Test volume/mute are restored afterward. The native update command is fire-and-forget; its nonexistent callback is not used as evidence.
- User confirmed: "Yes, boost and controls work." Actual native acoustic amplitude was not measured. Pop-out amplification and multiple live incoming audio streams remain unverified.

## beta5 update repair — 2026-10-13

- The update caused the installed launcher to refuse build 1791901251. The official stylesheet still loaded. Re-audited native pane/cache, Appearance, stream tiles and outbound status interfaces; updated build guards and exact installed JS/CSS hashes.
- The beta5 tile adapter passes 15 synthetic stream groups, including preview collapse, chat, keyboard/volume controls, lifecycle, fullscreen cleanup and native call/PIP preservation. The legacy fixture still passes 14 groups; the shell passes 9.
- Official extension schema/assets and 96 native selector classes pass. Isolated deployment/backups and shortcut preservation/recovery tests pass; real installer dry-run accepts the updated client and verifies identical managed shortcut launch settings.
- Initial attachment preserved media element/source identity, pause/mute/volume, outbound session hidden/paused state, audio controls and draft. The full native UI test then stopped at Info because beta5 remounts its preview portal during native content changes. Chat was restored and outbound session state remained unchanged. Content-mode continuity is not certified.
- `tests/redesign-live.mjs --geometry-only --preserve-content` passed 21 checks for scale/size, navigation, keyboard and idle stability while retaining media identity. The repaired theme and immutable launcher were installed with recovery backups. The installed launcher completed native Appearance setup and reported `ready`; deployed helper/theme hashes match source, and attachment preserved media, outbound session state, draft and audio controls.
- Multiple real incoming streams, continuous playback, native fullscreen/PIP transitions, physical DPI and second-PC acceptance remain unverified. Earlier beta4.1 results below are historical.

## 0.8.0 redesign — 2026-10-13

- `tests/shell.mjs`: 9 passing synthetic groups cover idle stability, four destinations, preview-tree exclusion, 820/819 continuity, narrow-window drawer, warning disclosure/updates, keyboard order, display-size rows, long-message wrapping and cleanup.
- `tests/workspace-controls.mjs`: 7 passing keyboard/lifecycle groups.
- `tests/stream-tray.mjs`: 14 passing groups, including default-visible chat, explicit focus mode, saved chat/tray preferences, draft/media retention, and cancellation of Space after a focus transfer.
- `tests/broadcast.mjs`: 9 passing synthetic state/geometry/lifecycle groups.
- Official schema, assets and 95 native selector classes pass static validation. Isolated deployment and shortcut-preservation/recovery tests pass.
- The initial temporary preview encountered a reconciliation loop. The repeated DOM write was corrected and an idle-stability regression added. TeamSpeak was restarted with user approval; microphone and playback remained muted throughout subsequent checks.
- `tests/redesign-live.mjs --geometry-only` passed 26 native DOM/interaction checks: Small/Medium/Large at 1322×847, 820×600, 819×600, 640×480 and 1322×420; four navigation destinations; device options; Info, Files and Chat; Appearance isolation; Tab order; and zero observed idle DOM mutations. The matrix passed again after installation. At 820/819 the 320px sidebar leaves 500/499px for content; the closed drawer at 640px leaves the full width.
- Native-window screenshot capture became unavailable while the window was hidden; the native activation tool was blocked by product policy. Geometry-only testing explicitly refreshes the helper because hidden CEF defers ResizeObserver delivery. Automatic resize behavior is covered separately by the browser fixture. Current native markup/styles were also rendered in isolated Edge; those images are **not native-window screenshots** and do not certify native painting. Remote avatar/embed assets are not fetched by that renderer.
- Automatic approval review rejected selecting a different channel because it could change presence or join. That action was not executed. Long-message behavior was tested with synthetic text; the current channel's native Info/Files/Chat surfaces were checked without sending messages or joining another channel.
- Official theme 0.8.0 and matching helpers were installed through `Setup.ps1 -Action Update -RepairShortcut`, preserving theme and shortcut backups. Installed stylesheet/helper hashes matched tested source. The immutable installed helper copy attached successfully; no temporary preview stylesheet remains.
- `tests/redesign-live.mjs` is also the entry point for `tests/navigator.mjs` and `tests/workspace.mjs`. It preserves media/audio and restores test geometry. Native streaming playback, native fullscreen/pop-out transitions, physical DPI, screen readers and second-PC acceptance remain unverified for this redesign.

Earlier entries below describe earlier versions; they do not certify the redesigned shell.

## 0.6.2 control placement and sidebar — 2026-10-11

- Live inspection found the stream-view badge anchored over pop-out, keyboard menus opening at (10,10), and overlapping sidebar Add/collapse icons. These are corrected; Leave/Stop also sits separately at the far right of the stream strip.
- Six live renderer sizes from 640×600 to 2562×1394 passed native menu placement, badge anchoring, control containment/hit areas and separation. Sidebar section actions are at least 24×28 with distinct targets, and the Bookmarks collapse cycle restores its original state. The narrow native rail remains unchanged.
- Synthetic tests now include a native-shaped overlay and badge, coordinate-aware keyboard activation and separation between view and Leave controls, alongside volume and remembered-tray regressions. No browser warnings/errors.
- Sidebar width is preserved. Longer headings may still ellipsize at 200px; their native labels and navigation remain available. No folder, contact, stream-stop or audio action was activated during live verification.

## 0.6.1 incoming volume — 2026-10-11

The live incoming stream exposed overlapping volume, view/pop-out controls and idle name text. Volume now has a stable native track, the stage reserves right-side space for view/pop-out, and the name sits above the strip. Native fullscreen remains unchanged.

- Synthetic focus, preview, grid and collapsed views passed at 1322×847, 900×650 and 640×480; a single stream also passed at 360×540. Tests cover track/button hit areas, endpoint dragging, value-bubble containment, mute Enter/Space, unchanged focus and retained media objects. No console warnings/errors.
- The real incoming stream passed five renderer size/DPR combinations in `tests/stream-stage.mjs`. The same video and media objects remained connected, decoded frames advanced, controls were hit-testable, and native mute/volume values remained unchanged. Live audio was never adjusted; volume interactions were tested only in the isolated fixture.
- Remembered tray state, cleanup and the existing browser regressions still pass. Physical Windows DPI changes, multiple simultaneous live streams and extended audio remain unverified.

## 0.6.0 stream tray and controls — 2026-10-11

The installed UI fingerprints still match the supported build. The native render function identifies focused tiles with `layoutStreams[].focused` and registers wrapper elements through `streamRefs[session.uniqueIdentifier]`; the helper uses those existing references.

The browser fixture loads the production runtime and CSS. Tests passed in headless Microsoft Edge at **1322×847, 900×650, and 640×480**, plus a resize to 1100×720:

| Check | Result |
| --- | --- |
| Page identity, meaningful content, runtime/console health | Passed; no browser warnings or errors |
| Pointer, Enter, Space; accessible label and expanded state | Passed |
| Bottom toolbar targets, icon containment and corner hit tests | Passed at all three fixture widths; pointer, Enter and Space activate once |
| Preview visibility and reclaimed focus height | Passed |
| Hidden previews cannot receive keyboard focus | Passed via native inert state |
| Same video/media objects and preserved chat draft | Passed in the synthetic fixture |
| Focus switch, return to grid, new focus | Passed; collapsed and expanded choices retained |
| Helper reattachment and renderer reload | Passed; stored choice retained and unrelated storage unchanged |
| Unavailable storage | Passed; in-memory preference and reattachment still work |
| Fullscreen entry/exit | Passed in the browser fixture |
| Theme disable, pop-out state, ended stream | Passed in the simulated layout interface |
| Drag, resize, navigation, repeated attachment, disposal | Passed; no duplicate controls or remaining watchers |

Expanded/collapsed screenshots were visually inspected. They show synthetic canvas sources, not real TS6 streams. Live installation and helper attachment are recorded separately in [release validation](release-validation.md).

Run `node tests/stream-tray.mjs` as described in [development](development.md). The Browser plugin was unavailable; validation used the bundled Playwright installation with a temporary Edge profile.

## Current native attachment

The installed 0.6.0 helper attached to the supported running client without restarting it. Its one existing video and media object remained unchanged, and frames advanced during the observation. Live single-stream controls were checked under renderer resizing. This does not replace the synthetic grid/refocus tests with a live multi-stream acceptance result. One-click setup and dependency checks are recorded in [release validation](release-validation.md).

## Historical native evidence

Version 0.4 verified the official theme loader, compact virtualized rows, sidebar pointer/keyboard behavior, splitters, control placement, and native fullscreen/pop-out layout transitions on the development PC. Its source stopped producing frames during review, so the final geometry tests did **not** certify continuous playback.

The detailed [v0.1–v0.4 record](history/validation-v0.1-v0.4.md) and [v0.4 layout review](layout-review.md) preserve that evidence. These checks have not been rerun as native acceptance of the new tray.

## Remaining acceptance work

- Two or more live streams: collapse/expand, focus switching, grid return, pagination, drag, source ending, portrait sources, and changes of aspect ratio.
- Advancing incoming video and audio through collapse/expand, fullscreen, and native pop-out transitions.
- Fresh installation, full cold launch, update, and uninstall on a second Windows PC.
- Physical Windows DPI transitions, other appearance sizes/themes, and large channel trees.

Use a consenting test session. Renderer emulation does not establish physical monitor behavior. See [release validation](release-validation.md) for deployment and packaging checks.
