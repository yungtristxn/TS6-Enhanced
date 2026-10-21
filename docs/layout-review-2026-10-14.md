# Product repair review — 2026-10-14

Target: TeamSpeak 6.0.0-beta5, build 1791901251. Goal: restore a dependable native shell, prioritize sizing and stream focus, and keep chat usable when an unopened stream is the only tile.

## Current-run inspection

The first renderer capture timed out while the window was minimized; a second capture was blank and was rejected. Native-window automation was unavailable for TeamSpeak. After the user restored the window, the project's verified CEF connection produced actual native screenshots. Accepted images and numeric reports are under ignored `.local/product-repair/`; they were inspected directly. No historical screenshot or reconstruction was used as native audit evidence.

| Step | Surface and health | Finding and result | Current-run evidence |
| --- | --- | --- | --- |
| 1 | Existing navigation — overcomplicated; simplified | The sidebar overlaid the tree, voice controls were fixed near the footer, and custom tabs/Tab routing replaced familiar navigation. Removed that layer. Native search, bookmarks, contacts, group chats, voice toolbar and splitters are retained. | `01-current.png`, `03-native-baseline.png`, `05-native-layout-preview.png` |
| 2 | Single unopened preview — reported broken; repaired | The generic single-tile rule promoted a joinable preview into a full-size player. The beta5 portal hierarchy was also absent from the old fixture. Unopened previews now have a bounded region, never receive full-player sizing, and leave chat/input usable. Live checks passed at 1322×847, 900×650 and 640×480. | `single-unopened-live-1322.png`, `single-unopened-live-640.png`, `layout-live.json` |
| 3 | Playing stream and focus — repaired | Native centering/insets shifted the control strip across the picture. The strip now sits below a focused/single player. Show/Hide previews is beside Show/Hide chat instead of overlapping the native resize divider. Folding previews enlarges the focused player while retaining chat space; manual divider changes are respected. | `focus-with-chat.png`, `focus-previews-expanded.png`, `focus-without-chat.png`, `focus-live.json` |
| 4 | Narrow sizing and keyboard — working in tested cases | Native compact navigation handles narrow widths. Changed targets remain reachable; tiny preview tiles keep primary actions and expose the full slider when focused. System messages wrap instead of colliding with timestamps. The helper no longer intercepts the shell-wide Tab sequence. | `native-layout-640.png`, shell/keyboard/stream fixtures |
| 5 | Fullscreen and return — working, diagnostic remains | beta5 remounts its native player. The same session resumes, audio state is retained in the live test, and chat/controls work on return. One transient `ResizeObserver loop completed with undelivered notifications.` diagnostic remains with the volume enhancement; it settles rather than repeating. Native baseline and the helper without volume did not emit it. | `focus-fullscreen.png`, `focus-live.json` |

Final installed state: `09-final-focus.png` and `installed.json`. The temporary preview is removed, official CSS and helpers report 0.9.0, installed hashes match source, and the playing stream is focused with chat usable. Deployment and shortcut recovery fixtures passed.

## Principles applied

- Preserve familiar product behavior and avoid an unnecessary parallel navigation system: [NN/g consistency and standards](https://www.nngroup.com/articles/consistency-and-standards/).
- Keep changed pointer targets at least 24 CSS pixels, using larger 30–32px targets where space permits: [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Tiny tiles disclose the full volume control when focused instead of cramming it between destructive actions.
- Keep focusable controls and the chat composer unobscured, and preserve normal reading/tab order: [W3C focus-not-obscured guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
- Make controls describe their result: separate Show/Hide previews from Show/Hide chat. Do not reuse the divider chevron as an unrelated preview affordance.

## Validation and limits

The native sizing matrix covers three display scales at three viewport sizes, plus three single-unopened-preview cases. The live focus sequence covers focus/chat, expanded previews, chat hidden, fullscreen and return. Browser regressions cover native shell preservation, keyboard actions, stream lifetime, beta5 portal nesting, manual divider choices, volume gain and the previous Vue render-loop failure. Native screenshots confirm the resulting placement; DOM tests check bounds and hit targets.

This is not a full accessibility certification. Screen-reader behavior, contrast across all appearance themes, physical DPI transitions, a second PC, multiple simultaneous live incoming sources, active pop-out behavior and long-duration playback remain outside this run. The transient fullscreen/volume ResizeObserver diagnostic remains a known limitation. No channel switching, messages, microphone changes or client restart were required for this product-repair pass.
