# Contributing

Small, focused improvements are welcome. Start with the [development guide](docs/development.md) and [stream maintenance knowledge](docs/stream-maintenance.md), and keep changes scoped to the supported TeamSpeak build.

Use Node 22+ and PowerShell 7. Run `npm ci --ignore-scripts`, then `npm test`. For rendered changes, install Chromium with `npx playwright install chromium` and run `npm run test:browser`. Client-dependent and live checks are separate opt-in steps in the development guide.

- Preserve the official theme loader, native players, and reversible setup. Do not add TS6AddonInstaller or patch installed client files.
- Re-audit selectors and native layout methods before supporting another client build; keep the build and resource checks strict.
- For UI changes, verify pointer and keyboard behavior, narrow windows, fullscreen, and cleanup. Distinguish synthetic tests from live playback.
- Run the checks relevant to your change and include the results in your pull request. Changes to deployment also need backup/restore and collision tests.
- Extend an existing focused regression when a defect needs coverage. Avoid tests that merely restate implementation details, broad reformatting and unrelated refactors.
- Do not include profiles, identities, account data, logs, or unredacted client screenshots. Use the synthetic fixture for public visual examples.

Bug reports should include the TS6 version/build, layout version, appearance settings, launch method, reproduction steps, and expected behavior. A sanitized screenshot is useful. Please avoid posting personal stream content.
