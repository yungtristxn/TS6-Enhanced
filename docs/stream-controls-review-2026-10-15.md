# Stream frame and bottom controls review

Scope: TS6 beta5 build 1791901251, Windows, 0.9.4-dev.2. Requested changes concern the stream frame and its controls. Sidebar, navigation, pane defaults, voice controls and the audio implementation are unchanged.

## What the actual screen showed

1. **Playing incoming stream — failed control grouping.** At 2562×1394, the player was 1976×1187 CSS pixels. Pop-out appeared in the player strip and again at the far right. The right-side view button occupied x=2530 through x=2562, leaving no right inset for its badge. Its 32 px target was wider than the native rail's icon-sized allocation.
2. **Unopened incoming stream — matching frame, incomplete structure.** A temporary leave/rejoin of only the incoming stream confirmed the same x/y/width/height. The unopened state used the whole frame for blue artwork while playback reserved a bottom strip. Its view/pop-out controls still floated at the far right. Reintroducing a preview size cap would have broken already-correct outer geometry.
3. **Self-stream after changes — passed visual control checks.** The incoming source ended; the user then opened an outgoing self-preview. Screenshots at 2562×1394, 1322×847, 900×650 and 640×480 show the actions inside the bottom strip. At narrow sizes all targets and their icons remain inside the player. Chat shown/hidden, real native view-menu opening and Escape dismissal, fullscreen entry/return, and advancing frames passed without runtime or resize warnings. Broadcasting stayed active.

Private screenshots stay outside version control: `.local/product-repair/01-current-layout.png`, `02-current-unopened.png`, and the task visualization directory's `bottom-controls/` captures. They contain account, chat or captured-screen content and must not enter a public package.

## Design and implementation findings

- **Keep the frame independent of content state.** Preserve the existing stage/chat allocation; reserve the same control-strip height for preview and playing content. Native preview artwork and video retain their own fitting rules inside that frame.
- **Place related actions in the same strip.** Use the player's native pop-out when present. Viewer-level replacements live in the single/focused player's strip, or in a reserved grid footer. The empty/hidden-stream state retains access to view settings. Side rails serve pagination and preview collapse only.
- **Keep native ownership intact.** Moving Vue-owned elements into another component risks reconciliation problems. `syncActionDock` creates owned HTML buttons, reuses native icon assets and forwards to the original native handlers. Source wrappers remain mounted but hidden while replacements exist; cleanup restores them.
- **A native menu needs a visible owner.** TS6's `onOpenViewSettings` uses both `event.target` and `clientX/clientY`. Dispatching on a hidden source is insufficient. The native button's `clicked` method receives the visible replacement as owner and its center coordinates. Escape must bubble out of the group. These contracts are exact-build internals.
- **Duplicate detection must exclude replacements.** Checking any `expand` SVG inside the strip made the replacement detect itself and repeatedly disappear/reappear. Restricting detection to native `.tsv-button` controls fixes this. Fifty idle reconciliations now produce zero DOM mutations in the unopened fixture.
- **Shrink flexible space, preserve action targets.** Rails and buttons have explicit bases. Volume space can shrink; buttons use 32 px targets, reducing to 24 px only in very narrow tiles. Icon bounds and corner hit areas are checked, not merely the button center.
- **Keep evidence levels separate.** A measured fixture and handler-count test cannot prove native menu presentation. Likewise, an outgoing self-preview cannot certify incoming leave/rejoin or incoming audio playback.

## Research used

- [MDN: flex sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/flex) and [minimum width](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/min-width): flexible items have intrinsic minimum-size constraints. Use explicit nonshrinking action bases and `min-width: 0` for flexible content instead of letting controls spill out of an icon-sized rail.
- [W3C: target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum): the minimum target criterion is 24×24 CSS pixels, with documented exceptions. This layout uses 32 px normally and 24 px for narrow tiles. This is a scoped target-size check, not a full accessibility-conformance claim.
- [W3C: toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/): a toolbar role brings arrow-key and focus-management expectations. The added actions use a named `group` and ordinary HTML button/Tab behavior, preserving the volume slider's arrow keys rather than introducing an incomplete toolbar pattern.

## Verification and limits

| Check | Evidence |
| --- | --- |
| Unopened/opened frame and bottom controls | 10 isolated viewport/chat combinations, 2562, 1322, 900, 640 and 360 px widths; frame equality, one pop-out, contained targets, keyboard join and draft preservation |
| Grid, focus, previews and lifecycle | Beta5 tray and polish suites; focus switching, collapse, drag, reduced motion, theme disable, disposal and reattachment |
| Native controls | Eight self-stream viewport/chat combinations; corners/centers and icon bounds; exactly one view menu and pop-out; no audio or capture-state change |
| Native menu | Enter opens a visible `.ts-context-menu` within the 640×480 viewport; Escape removes it |
| Native fullscreen | Same broadcast remains running; decoded frames advance; normal controls return without duplicates or resize warnings |

The final incoming unopened-to-playing transition could not be rerun natively after the incoming source ended. It is covered by the isolated fixture; the initial native capture established that its outer frame already matched playback. Multi-source live playback, pop-out playback and physical Windows DPI changes remain unverified. This patch does not justify a blanket production-readiness claim.

Run `tests/stream-preview-live.mjs --exercise-preview` with a visible incoming source for the remaining native transition check. Use `tests/stream-controls-live.mjs --fullscreen` for either an incoming or self stream; it never clicks stop-sharing, pause or leave. Save screenshots with `TSIX_SCREENSHOT_DIR` outside the tracked source tree.

## Installation

Installed and activated 0.9.4-dev.2 using the existing owner-checked updater and its backups. Installed CSS and stream helper match source hashes; the workspace helper was unchanged. The temporary stylesheet was removed and the native control/menu/fullscreen checks passed again against the installed files. Pane sizes and active media were preserved. No client restart, profile database change, sidebar edit or publication occurred.
