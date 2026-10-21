# Release readiness

Current candidate: **TS6 Enhanced 0.10.0-preview.4**, Windows x64, TeamSpeak **6.0.0-beta5 / build 1791901251**. It remains a preview. The local repository has no public remote or update repository configured.

## Evidence

The existing suites cover update selection and integrity, settings restoration, shortcut ownership/recovery, bootstrap behavior, browser interactions and compiled installer orchestration. Native component and live-client results are recorded separately in [validation](validation.md). The historical 18-cycle fullscreen run belongs to the documented 0.9.x build; it is not a claim that the entire 0.10 installer has completed release acceptance.

This preparation pass adds reproducible entry points and CI over those suites, not a new test framework.

Local results on 2026-10-21:

| Check | Result |
| --- | --- |
| `npm test` | Passed: syntax, 13 existing units, maintenance, launcher and bootstrap fixtures |
| `npm run test:browser` | Passed: seven existing suites using pinned Playwright 1.60.0 and its Chromium |
| `npm run test:native` | Passed: supported local schema/artwork and exact native-component regressions |
| `npm run test:installer` | Passed: compiled harmless installer and isolated deployment/shortcut recovery |
| Package validation | Passed: exact inventory, private-file exclusion, installer format, matching metadata and file/archive/installer hashes |
| Publication guards | Passed: missing repository refusal, consistent staged repository metadata and existing-artifact refusal |
| Local release upload | Passed offline: draft/prerelease arguments, five-file upload, preview without GitHub calls, and altered installer/metadata refusal |
| Documentation and workflow files | Local links resolve; GitHub YAML parses |

These runs did not control the live TeamSpeak client. Releases are built locally on Windows and uploaded as drafts; GitHub Actions runs development checks only. GitHub-hosted checks and an actual draft upload cannot be certified until the repository exists.

## Before publishing

- Create/select the real GitHub repository and run its checks. Require the Checks job for changes to the default branch.
- Complete a clean supported-client install, a real update between two release builds, uninstall restoration and reinstall. Verify the normal launch path and a failed-update recovery case on an idle or disposable Windows environment.
- Recheck the intended supported build, installer signing decision and user-facing limitations. Unsigned previews must remain identified as such.
- Build locally from the clean, committed checkout with `-Installer -ForPublication -Repository owner/repository`. Package contents, installer format, metadata and checksums are checked automatically.
- Smoke-test the finished installer on Windows. Tag that same source commit as `v` plus the version in `release.json`, then push the tag.
- Run `scripts/Upload-Release.ps1 -WhatIf` to validate and preview, then run it without `-WhatIf` to upload a draft. Review the files and notes on GitHub before publishing. See the [release commands](development.md#upload-a-draft-release).

Keep preview status until the acceptance evidence supports a stable release. Multi-source/extended playback, active pop-outs and physical DPI behavior retain the limitations listed in `release.json` unless separately verified.

## Local commands

```powershell
npm test
npm run test:browser
npm run test:native       # reads the supported installed client
npm run test:installer    # requires the supported client and Inno Setup 6
pwsh -NoProfile -File scripts/Build-Release.ps1 -Installer
```

The default output is `dist/<version>/`. Existing artifacts are never overwritten. Local builds keep update requests disabled. A publication build additionally requires a real repository; the required extension-schema placeholder is replaced only in the staged package.

The [0.7.0 release record](history/release-v0.7.0.md) and other files under `history/` are historical evidence, not the package to distribute today.
