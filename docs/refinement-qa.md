# Top voice controls — 0.7.8-dev.1

2026-10-12. Moved the actual native Mic and Audio buttons into a dedicated row immediately above the server selector. They are 44px high with 24px icons and 14px labels; their width is 182.5px in the user's 397px navigation pane and stays at least 140px at the supported minimum pane width. Status sits in the title bar alongside the existing logo and notification area. Removing the previous bottom voice row reduces the profile footer from 96px to 48px.

Native action handlers, mute icons and colors, context menus and keyboard behavior are unchanged. Below the unified navigator's 820px breakpoint, the original native navigation still applies.

- All 12 installed native navigator checks pass, including Friends, Servers, small windows, DPR 1.5 and native fallback. The test now requires large Mic/Audio targets above the server selector.
- Six installed hover/focus cases cover Mic, Audio and Status at 1322×847 and 820×600. Labels and icons stay visible; focus outlines remain visible; all four inset corners and each target's center pass hit testing. Notifications remain accessible. The existing muted microphone state and native control identities are preserved.
- Seven isolated keyboard cases and nine synthetic broadcast/layout cases pass. No live voice or sharing action was invoked; active outgoing sharing was absent during the final check, so current sharing placement is fixture-verified rather than live-stream-verified.
- Static validation passes for the official manifest and 96 native selector classes. JavaScript syntax and whitespace checks pass. Source and installed CSS SHA-256 hashes match.

Installed and activated theme 0.7.8 through the managed updater without restarting TeamSpeak. Workspace helper remains 0.7.7; stream helper remains 0.7.2. Inspected private captures: `.local/independent-review/top-1322-installed.png`, `top-820-installed.png` and `top-focus-Mic.png`; detailed hover evidence is in `top-hover-results.json`. Temporary styles and viewport overrides are removed by the checks.

---

# Main-surface simplification — 0.7.7-dev.1

2026-10-12. Reviewed the actual Channels/chat, Friends, Servers/bookmarks, Info, Files, profile/voice dock and current sharing surface. The priority is joining and navigating voice channels, communicating and sharing. This is a task-based design judgment, not a claim about measured usage frequency.

The reviewed idle-chat state at 1322×847 went from 39 to 23 visible, hit-testable command targets. The count covers native buttons, split menus, view selectors and the project navigator; it excludes tree/contact rows, window chrome and non-button profile containers. The reduction depends on context: deferred actions return when needed.

| Step | Surface and health | Decision |
| --- | --- | --- |
| 1 | Channels/chat — simplified, checked | Create Channel, recent server events and bookmark management are available in the existing Servers view. The current-channel chat shortcut disappears only while that chat is already open; it returns in Info/Files and when needed to return to the current voice channel. Search, channel navigation and connection status remain direct. |
| 2 | Friends — focused, checked | Keep contacts, Add Contact, offline disclosure and search: each has a distinct function. Server-management actions no longer compete with these tasks. |
| 3 | Servers/bookmarks — complete, checked | Retain Create, Log, bookmark management, bookmark search/add/folders and the current-server close action. All are meaningful in this context. The native close action was inspected but not activated. |
| 4 | Info and Files — retained, checked | Keep the three content views. Info provides channel details; Files has separate upload/folder tools. The initial Files capture was still loading and was rejected; a settled capture verified the native empty-state file browser. No file operation was invoked. |
| 5 | Composer, profile and sharing — contextual, checked | Setup selects native Dynamic formatting: the toolbar appears on editor focus or for a nonempty draft. Profile editing reveals on hover or keyboard focus; Settings and locate-self remain direct. Empty viewers retain stream settings but hide pop-out. Real stream layouts retain their pop-out/fullscreen/mute controls. LIVE, viewer disclosure, pause/menu, Share, Mic, Audio and Status remain available. |

This follows [Microsoft's distinction between primary and secondary commands](https://learn.microsoft.com/en-us/windows/apps/design/controls/command-bar) and [NN/g's progressive-disclosure guidance](https://www.nngroup.com/articles/progressive-disclosure/). Useful actions are retained in their task context; no new overflow menu or replacement control framework was added.

Fresh, inspected captures under ignored `.local/independent-review/`: `simplify-before-channels.png`, `simplify-before-friends.png`, `simplify-before-servers.png`, `simplify-before-Info.png`; installed-state `simplify-after-1322-channels.png`, `simplify-after-1322-friends.png`, `simplify-after-1322-servers.png`, `simplify-after-820-channels.png`, `simplify-after-Info.png`, `simplify-after-composing.png`, `simplify-after-profile-focus.png`; settled file-browser capture `simplify-after-Files.png`. These private captures are not packaged or published.

Validation: the dedicated native surface pass checks contextual visibility at 1322×847 and 820×600, return-to-chat visibility, editor focus, profile keyboard access and unchanged draft/audio/sharing state. All 12 native navigation cases, 6 native sharing cases, 7 isolated keyboard cases and 11 isolated stream-tray cases pass. Static theme validation covers 96 native selector classes. Native navigation includes narrow fallback and DPR 1.5 geometry; real incoming/multiple-stream playback remains outside this pass.

A CSS-only composer-hiding prototype triggered native ResizeObserver warnings. It was removed in favor of TeamSpeak's built-in `chat_input_toolbar_visibility: dynamic` setting, and the installed navigation suite passes without warnings. The navigator test now removes its temporary preview stylesheet in `finally`, including on failure. Normal launches respect later native preference changes.

Theme and workspace helper 0.7.7 are installed and activated using the managed updater and native Appearance API. Existing call/session state was preserved. No release archive or publication was created. Native settings/admin dialogs, every context-menu entry and complete screen-reader behavior are not claimed as audited.

---

# Hover and focus follow-up — 0.7.6-dev.1

2026-10-12. Checked the running client after the reported server-title hover regression. Theme 0.7.6 is installed and activated without restarting TeamSpeak; installed CSS matches source. Helpers remain at workspace 0.7.4 and streams 0.7.2.

- Captured and visually reviewed normal/hover states for 56 native workspace controls across Channels, Friends and Servers, plus keyboard-focus states for the 23 focusable controls in that inventory. This includes profile, voice/status, server actions, view selectors, composer formatting, bookmark tools and stream controls. No additional disappearing text or icons were found.
- The server/bookmark overlay now stays transparent on hover (0.7.5); an inset border gives feedback without painting over the native title.
- Found the LIVE strip's opaque background covering the left edge of the native sharing control. Its transparent reserve now spans 72px, matching the existing content padding and clearing the whole split button.
- Found the stream-settings focus outline clipping at the top of its native scroll area. Sharing, stream-button and tray-toggle focus outlines now draw inside their targets. Fresh installed-state screenshots confirm complete focus indicators for sharing, its menu, stream settings and the server selector at 1322×847 and 820×600.
- Reviewed 72 synthetic normal/hover/focus renders: six incoming-stream/tray controls in expanded and collapsed layouts at 1322×847 and 640×480. Labels/icons remain visible and focus outlines stay inside the targets. These fixtures exercise layout and state, not complete native icon styling or incoming playback.

Validation: all 9 broadcast-fixture cases, 11 stream-tray cases and 6 native sharing cases passed. Theme schema and all 95 observed selector classes passed. Existing outgoing session identity, pause state and preview preference were retained; no audio, sharing, channel or messaging action was activated. Native settings dialogs, menu-item inventories and screen-reader output remain outside this pass.

Private local evidence: `.local/independent-review/hover-states/` (full native audit), `focus-fixed/` (installed desktop/compact checks) and `stream-hover/` (synthetic states). These ignored captures are excluded from release packages. No release archive or publication was created.

---

# Independent workspace review — 0.7.4-dev.1

2026-10-12. Review of the actual installed TeamSpeak 6.0.0-beta4.1 / build 1779880475. Evidence was captured fresh from its verified main CEF renderer. The existing outgoing stream remained active with its preview hidden; no voice, sharing, channel or messaging action was invoked. Native dark appearance and compact tree are the tested configuration.

## Findings and changes

| Finding from the current run | Improvement |
| --- | --- |
| The automatic channel pane consumed 476px of a 1322px window and 520px at full width, leaving substantial unused sidebar space. | Automatic expansion now uses 27% of the window, bounded to 320–380px. At 1322px it is 357px. Manually wider native widths remain respected. |
| Navigation had excess vertical spacing and search was a faint pill. | Tighter header spacing, a defined search field, readable placeholder and a consistent active-tab treatment. |
| Content views were three small unexplained icons. | Info, Chat and Files have visible text at widths of at least 1100px, persistent tooltips, an active-state underline and keyboard button semantics. Narrow windows retain icons. |
| Secondary server actions, the live strip and the voice dock competed for attention. | Quieter secondary actions and strip borders; the colored LIVE edge remains prominent. Voice controls retain consistent bounded targets below the separate profile row. |
| Split-menu chevrons were 16px wide. Native primary actions lacked focusable button semantics. | Menu targets are at least 24×28px. Audited native actions support Enter/Space, visible focus, disabled state and accessible names; menu activation remains separate from its parent action. |
| Event timestamps sat at the far edge of the content pane and were faint. | Timestamps sit immediately after their event. Secondary event text, timestamps, search placeholder and hidden-stream status have measured contrast of 8.54–8.57:1 in the tested dark appearance. |

Native channel hierarchy, existing icons, stream object identity, control callbacks, user pane preferences, composer and draft remain the basis of the layout. No decorative assets or alternate player were introduced.

## Research used

- [Microsoft command-bar guidance](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/command-bar): keep common commands in consistent locations, group related actions, and expose short labels beside icons when there is room.
- [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum): use 24×24 CSS pixels as the minimum target-size baseline; the split-menu targets are 24×28px.
- [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): compare computed colors against the 4.5:1 normal-text baseline, including meaningful placeholder text.
- [W3C focus appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance): use a clearly visible two-pixel focus indicator. This is a design reference, not a claim of complete WCAG conformance.
- [WAI tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): preserve the existing Channels/Friends selected state and arrow-key navigation.

## Reviewed steps and evidence

Fresh local captures are in ignored `.local/independent-review/`. They contain private client content and are excluded from release packages.

| Step | Captured state | Result |
| --- | --- | --- |
| 1 | Channels/chat, `02-before-desktop.png` → `03-after-channels.png`, both 1322×847 | Improved proportions, text hierarchy, view labels and timestamp proximity. |
| 2 | Friends, `04-after-friends.png` | Contacts remain reachable; consistent search, navigation and footer. |
| 3 | Server/bookmark selector, `05-after-servers.png` | Native server/bookmark actions remain separate from the selector; Escape returns to the prior tab. |
| 4 | Viewer disclosure, `06-after-viewers.png` | Viewer list remains above the tree and footer; current sharing state and controls stay distinct. |
| 5 | Keyboard-opened status menu, `07-after-keyboard-menu.png` | Enter opens the native menu next to its control; Escape dismisses it without selecting a status. |
| 6 | Small and wide workspace, `08-after-small.png`, `09-after-wide.png` | 820×600 and 2562×1394 fit; live geometry tests also cover the native navigation fallback below 820px. |
| 7 | Synthetic stream stages, `tray-expanded.png`, `tray-collapsed.png`, `incoming-volume.png` | Native stage/tray design retained; controls and volume targets pass interaction and geometry tests. These are fixture renders, not live incoming playback. |

## Validation

- 12 native navigator cases pass: Channels/Friends/Servers, arrow keys, Escape, search focus, labels, hit areas, overlaps, minimum width, cleanup and repeated attachment. Sizes include 1672×941, 1322×847, 900×650 at DPR 1.5, 820×600, 800×600 and 640×600.
- 6 native sharing cases pass with the existing outgoing stream: viewer count, separate targets, disclosure over Channels/Friends, narrow fallback and cleanup. Session identity, pause/hidden state and preview preference remain unchanged.
- 9 isolated broadcast and 11 isolated stream-tray cases pass. The broadcast fixture now deliberately pins its native column and overlay to the same 320px width, since it does not run the workspace ResizeObserver.
- 7 new isolated keyboard cases pass: exclusive sharing-helper ownership, single Enter/Space activation, split-menu isolation and coordinates, cancelled Space press, disabled actions, selected-view state, detach/reattach/theme cleanup. No browser errors.
- Manifest schema and 95 native selector classes pass; changed JavaScript parses; whitespace check passes.
- Installed theme 0.7.4 and workspace helper 0.7.4 are activated through the native theme loader. Temporary preview CSS is removed. Managed launcher installation retains its original shortcut recovery and previous theme backups. No archive or publication was created.

Native captures and checks use the project's guarded loopback CEF tools. The existing isolated browser tests use bundled Playwright with a temporary headless Edge profile. No new browser dependency was installed.

One final CEF screenshot request timed out. A fresh installed-state capture (`10-installed.png`) and both complete installed-version navigator/sharing suites passed on retry. Final installed helper hashes match source.

## Remaining limits

This is a workspace review, not a certification of every native screen. Native settings dialogs, every menu item, screen-reader output and complete tab-order equivalence need separate testing. Primary audio and sharing keyboard activation was tested in fixtures to avoid changing the active call. Incoming and multiple-stream media continuity, physical Windows DPI transitions and a second PC remain unverified. Contrast measurements cover the specified text in the current dark appearance, not all TeamSpeak or server-assigned colors.

---

# Previous workspace refinement — 0.7.2-dev.1

2026-10-12. Actual installed TeamSpeak 6.0.0-beta4.1 / 1779880475, with an existing outgoing stream and its own preview hidden. No stream, channel, audio or messaging actions were invoked during native validation.

## Reviewed states

| Step | State and evidence | Finding and result |
| --- | --- | --- |
| 1 | Channels and chat: `refinement-before.png`, `refinement-01-channels.png` | Mixed control sizes, a compressed profile, ambiguous sharing action, offset server heading and heavy chat-event pills. Separate identity and labelled audio/status rows, aligned headings, consistent targets, quiet events and a readable hidden-preview toolbar now fit the same workspace. |
| 2 | Friends and viewer disclosure: `refinement-friends-before.png`, `refinement-02-friends-viewers.png` | The live strip squeezed its text and overlapping initials beside the native sharing control. A two-line strip separates status, viewers and pause/menu actions. The viewer list paints above Friends and closes with Escape. |
| 3 | Server/bookmark selector: `refinement-03-servers.png` | Native bookmark tools remain distinct from the selector and expander. Resource headings, search and the persistent footer remain readable. |
| 4 | Compact workspace: `refinement-04-compact.png` | At 820×600 the tree scrolls above the dock, profile text fits, and the hidden-preview message wraps without covering its buttons. Below 820px the native navigation returns; sharing status keeps its own bottom row. |

Screenshots are local QA evidence under ignored `.local/screenshots/`; they contain private live-client content and are excluded from exports. These are CEF screenshots captured and inspected during this pass, not mockups.

## Validation

- Official manifest schema and 93 observed selector classes pass against the installed client; both resource hashes match the supported build.
- Twelve native navigator cases pass, including Channels/Friends/Servers, keyboard tab switching, search focus, label rendering, action hit areas and overlap/bounds checks, minimum width, cleanup and reattachment. Renderer sizes: 1672×941, 1322×847, 900×650 at DPR 1.5, 820×600, 800×600 and 640×600, plus the initial 2562×1394 window.
- Six native sharing cases pass: actual viewer count, hidden preview, separate action targets, compact fallback, viewer disclosure over Channels/Friends, and cleanup/reattachment. Existing outgoing session identity, pause/hidden state and preview preference remain unchanged.
- Nine isolated broadcast cases pass, including join/leave/rename, overflow, zero viewers, paused and multiple sessions, keyboard action routing, fullscreen and restoration of owned attributes.
- Eleven isolated stream-tray cases pass, including incoming volume controls, pointer/keyboard interactions, remembered collapse, media identity, focus/grid, resize and cleanup. No browser console errors.
- All eleven installed theme/runtime files match source, the original shortcut recovery hash remains intact, and temporary preview styles are removed. Installed CSS 0.7.2, workspace helper 0.6.0, stream helper 0.7.2. No share archive created.

Background CEF throttles layout callbacks when the window is hidden. Live tests request a rendered frame before checking settled geometry; elapsed time alone was an unreliable resize check. No production resize workaround was retained.

## Limits

This pass verifies the main workspace and its navigation, chat and sharing controls. Real incoming/multiple-stream playback, physical Windows DPI transitions, screen-reader behavior, and every native dialog/menu remain outside this acceptance claim. Incoming and multi-stream geometry were exercised in fixtures. Native media controls were inspected without activating them in the live call.
