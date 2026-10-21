# Unified navigator design QA

Selected reference: concept 2, "Unified navigator", approved in this conversation. The generated reference is 1672x941. Private source and rendered captures are retained locally, excluded from Git and the recipient package.

## Comparison

The full reference and implementation were inspected at the same 1672x941 viewport. Focused inspection covered the server header, tabs/search, tree rows, and bottom control rows. A separate 820x600 render checks the minimum supported unified-window width.

| Area | Reference intent | Implemented result |
| --- | --- | --- |
| Overall layout | One left navigation column | One 320px column at the current native tree setting; 200px released to the stream |
| Header | Server selector, Channels/Friends, search | Functional selector and keyboard tabs; native Search / Connect |
| Content | Channels and people together | Native virtualized hierarchy; contacts and recent chats in Friends; existing chat activities also available below the tree |
| Footer | Profile, microphone, speaker, settings | Native controls, distinct targets and full current username; server utilities and away control in a separate row above |
| Stream | Large uninterrupted stage | Existing full-height stage, aspect ratio and incoming-volume controls retained |

Native adaptations are intentional: keep TeamSpeak's palette, fonts, icons, avatars and actual presence/unread state; retain universal Search / Connect rather than inventing channel-only search; show recent chats only when they exist. Native connection utilities remain available rather than replacing them with decorative status text. The live video differs from the concept's black placeholder. Below 820px, and outside full server views, native navigation takes over.

## Findings and fixes

- Initial header growth caused native scroll anchoring to hide the first rows. Preserve the prior virtualizer scroll position after its measurements.
- The away control was covered by the native utility row. Correct the stacking order and reserve horizontal space.
- Keep the bookmark/chat header controls separate from the server selector; suppress focus only on hidden tree rows.
- Protect the profile/footer at a 300px column minimum and retain native scrolling at short heights.

The 12-case navigator run passed pointer/keyboard switching, search focus, control hit tests and overlap checks, six viewport/DPR combinations, minimum column width, theme-contract disable, disposal and repeated attachment. Eight existing stream-stage checks also completed with advancing frames. Video and media identities, playback state, audio values and tray preference survived. Emulated DPR is not physical Windows scaling validation.

Result: **passed for the supported Dark / Medium / Compact server view**, with the native adaptations above. No observed clipping or overlapping targets remain in the checked states. Second-PC installation, multiple connected-server switching and extended live media remain acceptance boundaries.

Local evidence: `unified-desktop.png`, `unified-small.png`, focused Friends/Servers captures, `.local/navigator-validation.json`, and `.local/v04-stream-stage-validation.json`. Release installation evidence is recorded separately in [release validation](history/release-v0.7.0.md).
