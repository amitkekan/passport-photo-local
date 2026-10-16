# Handoff for another session or agent

Last updated: 2026-10-15.

## Root ignore-rule review

The owner requested a project-specific `.gitignore` review. A local Git repository and staged project files already existed at this point. This review does not initialize, stage, commit, configure remotes or publish anything.

The rules now cover additional photo/raw formats, photo sidecars, videos, archives, case variants of personal work folders/reports, private-key files, caches, coverage, test artifacts and editor backups. Retain narrowly named exceptions for the two public HEIC graphics and the pinned model-provenance manifest. Source, lockfile, dependency inventory and license notices remain eligible for tracking. The setup guide explains the rules and the difference between ignored and already staged files.

Validation: 123 representative paths passed under both case-sensitive and case-insensitive Git matching (246 checks). No already staged files matched the updated ignore rules; the staged `.gitignore` blob remained unchanged. Working-tree edits are limited to `.gitignore`, this handoff and the setup guide, and require deliberate restaging before a commit. No application code or runtime behavior changed.

## Project relocation

The owner requested moving the entire existing project to `D:\private_repos\passport-photo-local` for later connection to a personal GitHub account. The move included hidden configuration, installed dependencies, local models, build output, tests, notices and documentation. All 4,106 files were SHA-256 verified immediately after moving, before subsequent documentation/build updates. The old project folder no longer exists.

This explicitly supersedes the original personal-profile location requirement. No Git repository, remote, commit or push was created. Use the new working directory below; scripts resolve project assets relative to their own location.

## Latest change: version 0.6.4

The owner confirmed weak Highlight reduction and requested a fix after verification. `applyTonePixels` now compresses the exposed peak after contrast, before clipping, with a gradual rational curve. It blends from the bounded highlight-off result so increased exposure does not overpower the slider. Linear RGB ratios, alpha, original pixels, neutral defaults, highlight-off behavior and the optional replacement-background color are preserved. UI guidance recommends starting at 15-25 and keeps the strongest setting at 50.

Final verification: **45 core tests, TypeScript/production build and all 5 focused browser scenarios passed.** Coverage includes every integer highlight setting across grayscale ramps/exposure/contrast/shadow combinations, visible middle/full strength, ordered highlight patches, color ratios, clipped-source limitations and pre-change highlight-off reference values. Browser checks verify all three export types, portal byte limits, report settings, unchanged original/replacement background, reset invalidation, mobile layout and offline/no-storage behavior. See D24 for the formula and scope.

No dependencies/models were added; existing license-review flags remain. No personal photograph was required for this change.

## Previous change: version 0.6.3

The owner supplied a specific HEIC that still failed background correction. Reproduction established that the color guard, not the darkness guard, rejected it. Mean RGB channel spread may now reach 50, with at most 3% of samples above spread 80, supporting light cream and muted pastels while retaining a vivid-color check. Brightness, dark-patch, texture and mask-confidence rules are unchanged. New UI diagnostics expose color, texture, variation and coverage. See D23.

Verification: **41 core tests, TypeScript/production build and all 5 focused browser scenarios passed.** Tests cover exact color boundaries, cream/pastel acceptance, vivid-scene rejection, existing background safeguards, consent, correctly labeled white-background portal exports, offline/no-storage behavior and mobile layout.

The exact newly supplied HEIC now reaches the correction preview in an isolated offline production browser, with zero processing-time HTTP requests/errors and no saved photo outputs. It was cleared from the test context afterward; the original was unchanged. No private path, filename or measurements are retained here. A passing eligibility check does not prove fine-edge quality or passport compliance.

No dependency/model changes. Inventory remains 94 packages / 100 notices with the existing LGPL and missing-license-text review flags. Version 0.6.3 runs on the loopback-only production server.

## Previous change: version 0.6.2

The owner requested more lenient light-wall correction after a light-colored wall was rejected. Background eligibility now allows mean brightness down to 140, moderate shadows below 120 over up to 15% of samples, and luminance standard deviation up to 35. A separate below-65 near-black fraction remains capped at 0.5%; color, texture and mask-confidence guards are unchanged. The intermediate mean-160 / 5% limits still rejected a supplied underexposed-wall original, so validation continued. Accepted dimmer/shadowed cases remind the user that wall whitening does not correct dark facial lighting.

Rejections distinguish overall dimness, moderate shadow coverage and near-black patches that may be missed hair/clothing. The UI displays original-background measurements and warns that these are editing heuristics, not passport rules. Consent, wall confirmation, original-pixel checks, unchanged raw masks, edited outputs and no override are preserved. See D22.

Final verification: **40 core tests, TypeScript/production build and all 4 targeted browser scenarios passed.** Coverage includes newly accepted underexposed light-gray walls, measured brightness/shadow/variation boundaries, foreground protection, offline/no-storage behavior, unsafe-scene rejection, consent gates, edited outputs and mobile layout.

The previously supplied JPEG now reaches the correction preview in an isolated offline production browser. No processing-time HTTP requests, screenshots, saved photographs or exports were created; the original was unchanged. Do not retain its path or private measurements in project notes. The generated browser fixture was adjusted to exercise a genuinely underexposed assessment instead of assuming its input wall color equaled the aggregate mask-based reading.

Dependency inventory remains 94 packages / 100 notices, with the same LGPL and missing-license-text review flags. No dependency or model change was needed. Version 0.6.2 is served by the loopback-only production server.

## Previous change: version 0.6.1

The owner confirmed HEIC works but requested another portal-default correction. Automatic portal framing now refines the visible crown from the existing local matte with bounded, sustained-transition checks. Uncertain masks show a manual-review notice. The refined head is stored separately from the detector head, preserving print defaults, guides and PPI.

Reframe upload now honors corrected print head-top/chin guides in source coordinates. Pupils center horizontally without forcing an arbitrary vertical eye target. The portal preview shows head guides, head-height percentage and top-space percentage; guides never reach exports. Exact pixel/byte requirements, native-resolution checks and manual review remain unchanged. See decision D21.

Verification: **38 core tests, all 20 Edge browser scenarios, TypeScript and the production build passed.** Coverage includes portrait/landscape/square sources, different head widths and eye heights, confident versus ambiguous crown masks, source-anchored guide corrections, inverted-guide errors, unchanged prints, offline processing and existing HEIC/export/privacy behavior. A generated nonpersonal drawing was also inspected in the portal preview.

Production-mode checks on the supplied originals completed offline with no processing-time HTTP requests, screenshots or saved photo outputs. Some masks intentionally retained the detector-based estimate with an explicit uncertainty notice; do not describe every original as automatically refined or visually certified. No private paths, filenames or measurements belong in this handoff. A supplementary development-server diagnostic timed out; the production-path checks above are the verified runtime evidence, not that diagnostic.

The inventory remains **94 packages / 100 notice files**, with the same LGPL distribution-review and missing-license-text flags. No dependencies or models were added. The temporary diagnostic server was stopped; normal operation uses the production server on loopback port 4317.

## Previous change: version 0.6.0

Two requests are implemented: local HEIC input and tighter Indian portal crop suggestions.

- `src/heic-header.ts` validates supported container structure and declared dimension bounds before decoding. The primary image may coexist with visible tone-map items.
- `src/heic.worker.ts`, `src/heic.ts` and the pinned decoder alias in `vite.config.ts` use libheif's explicit primary-image selection. A disposable inline worker checks decoded dimensions, returns pixels, frees native handles/context and terminates after success/error or a 90-second timeout. No conversion upload or intermediate file is created.
- The decoder source is CSP compatible and bundled at startup; only `worker-src blob:` is added to the production policy. No general unsafe evaluation or extra network permission is allowed. This adds a deliberately larger local startup bundle.
- `suggestPortalFraming` now uses a tight head-based starting crop, approximately 80% head height and 5% headroom when feasible, with bounded eye-based centering. It is not a measurement of 80% face area. The owner supplied the tight-crop requirement, so the exploratory looser suggestion was replaced before release.
- Reframe upload around marked face uses the current markers, preserves print settings, and invalidates old outputs/review confirmations. The fixed 7:9 crop is resized proportionally to 630 x 810 without stretching. Exact output byte checks remain.
- README, setup, privacy, licensing, project brief and decisions D19-D20 explain the new behavior. LGPL-3.0 decoder distribution/patent review remains open, alongside the earlier missing-text flag. Do not suppress either scanner flag.

Final verification: **34 core tests, all 19 Edge browser scenarios and the production build passed.** Coverage includes offline HEIC decoding, primary/tone-map metadata, content-based input detection, dimensions and transparency, tight crop/reframe behavior, unchanged prints, byte-verified downloads, resets, mobile layout and privacy. A clean locked dependency install also passed from the local cache.

The current inventory contains **94 installed packages and 100 notice/license files**. It deliberately returns nonzero for `heic-to@1.6.5` (LGPL-3.0 distribution review) and `guid-typescript@1.0.9` (missing license text). The larger decoder bundle is expected, not a reason to relax privacy or load a remote converter.

Private on-device verification confirmed that the supplied originals decode with processing offline and no screenshots, copies, exports or reports saved. The upstream transparency fixture was separately inspected and is a nonpersonal drawing; its temporary preview was removed. Never retain the supplied photographs, names, paths or private measurements in fixtures, logs or notes.

## Previous change: version 0.5.0

Eye guides, guarded background correction and private-repository setup documentation are implemented.

- New `src/eyes.ts` and `src/background.ts` contain pure measurement and conservative appearance checks.
- Detected or manually marked eyes stay anchored to source pixels; both eyes must remain inside active crops. Optional user-supplied print bands are validated, cleared on profile changes, and never represented as government-verified rules. Preview guides never reach exports.
- Background correction checks original pixels with the raw local matte. It requires editing consent and light-wall confirmation, rejects unsuitable or uncertain backgrounds without an override, and offers white, very light neutral and very light warm. Resets, reports, previews and edited filenames are wired consistently.
- `GETTING_STARTED.md` explains trusted prerequisites, clone/ZIP, install, run, stop/update, troubleshooting and explicit staged-file review before a user-initiated private Git push. README and PRIVACY explain operation and data flows. No Git repository or remote was initialized.
- Public-registry configuration and canonical lock URLs replace machine-specific feed URLs. A clean locked install passed using cached, integrity-checked packages from an approved mirror. Fresh public model downloads passed pinned SHA-256 verification in an isolated folder, which was removed. A fully uncached public npm install and current advisory audit remain unverified because public metadata/TLS access was inconsistent.
- Dependency inventory: 93 installed packages and 97 notice/license files. The known `guid-typescript@1.0.9` ISC license-text flag remains. No release clearance is claimed.

Final validation: **31 core tests, TypeScript/production build and all 16 Edge browser scenarios passed in the final run.** This includes byte-identical JPEGs after moving eye guides, optional-band gating and narrow-screen controls, all print combinations, background target colors and rejection, resets, offline processing and no application persistence. Fresh model installation succeeded, and a separate corrupt-model check failed closed without a success manifest or partial download.

The original synthetic dark-shirt drawing was rejected by the conservative background guard because matting treated part of it as background. A light-clothing generated fixture passes. No thresholds were relaxed. An exact-185 grayscale boundary test exposed floating-point arithmetic just below 185; integer-weighted luminance coefficients now preserve that exact boundary. Below-threshold values remain rejected.

See D16-D18 for evidence limitations and exact background thresholds. No real portrait or private diagnostic data was used in this validation. Do not reload or capture the owner's existing browser tabs.

## Previous change: version 0.4.1

Fixed misleading insufficient-resolution guidance and overly tight automatic portal framing for minor shortfalls.

- Print and portal warnings now show separate available/required pixel dimensions.
- Use 300 PPI for prints appears only when the prospective lower-density crop supports the requested print format. Portal warnings explicitly explain that print PPI cannot fix portal pixels.
- Face-based portal suggestions can expand by up to 10% per dimension to preserve native 630 x 810 upload pixels. The target has a one-pixel arithmetic guard and is clipped to original bounds. Larger shortfalls still require manual framing review or a better original, rather than automatically adding excessive background.
- Print crop suggestions and density selection are unchanged. No source or output upscaling was introduced.
- Portal reset uses the revised default. All resolution changes still invalidate old files and review confirmations.

Verification: **27 core tests and 5 focused Edge browser tests passed**, along with TypeScript and the production build. Tests cover minor versus major shortfalls, source bounds, unchanged print framing, separate print/portal diagnostics, lower-density recovery, exact downloads, no-upscale guards, generic metric behavior, mobile layout and privacy.

A private local diagnostic also confirmed that the reported warning cleared with the revised defaults. It ran offline after model initialization, without screenshots, output downloads, or processing-time HTTP requests. Do not persist the photograph, path or private diagnostic values here or in regression fixtures.

## Previous change: version 0.4.0

The owner requested visible cutting marks, explicitly removed nonstandard 4 x 7 sheets, and added 35 x 45 mm printing for other countries.

Current choices:

| Physical photo | 4 x 6 paper | 5 x 7 paper (default) |
|---|---:|---:|
| 2 x 2 inches (U.S./India profiles) | 2 copies | 6 copies |
| 35 x 45 mm (generic print-only profile) | 4 copies | 6 copies |

All layouts have 0.25-inch gaps and outer margins. Cutting marks are enabled by default, appear only in waste paper and can be disabled. The original 4 x 7 options no longer exist. This explicitly supersedes earlier requirements and historical descriptions below.

Implementation:

- `src/core.ts`: format definitions, nearest-pixel metric dimensions, physical sheet layouts, ink-safe crop marks, generic head-guide validation and format-aware crop defaults.
- `src/images.ts`: individual format rendering, matching paper sizes, outside cut marks, density metadata and format-aware filenames.
- `src/App.tsx`: separate Generic 35 x 45 mm profile, explicit destination-rule review, millimeter head display, dynamic PPI/dimension labels, actual sheet size in downloads/report and reset/invalidation across profile changes.
- Changing profile preserves the original and optional edits, recomputes crop suggestions and clears prior files/confirmations. PPI changes reproject guides to preserve source anchors. Global reset keeps the profile, resets its crop defaults and selects 5 x 7 with guides.

35 x 45 mm exports are 827 x 1063 pixels at 600 PPI or 413 x 531 at 300 PPI. The maximum rounding error is half a pixel per dimension (less than 0.043 mm). Crop ratios match actual output pixels so no square-to-portrait stretching occurs. The report gives nominal and raster-derived millimeters. This generic profile has no country-specific head-height rule and no Indian portal output; require manual confirmation of the destination's official requirements.

Verification:

- **25 core tests passed.** Layouts, photo sizes, non-overlap, guide lengths/alignment and full stroke footprints are checked at both densities for both photo formats and paper sizes.
- **13 Edge browser scenarios passed** across the regression run and focused rerun. The new export scenario covers all eight format/paper/density combinations with actual downloaded JPEG headers, density, copy counts, photograph pixels, white gaps and dark marks.
- Guide toggling leaves the individual JPEG byte-identical and removes the sheet marks. Report dimensions, labels and flags match exports.
- Generic review gating, profile transitions, crop-ratio preservation and low-resolution rejection are tested. Existing lighting, background, exact Indian portal, offline/network/storage and mobile checks remain passing.
- One test initially assumed that a 500 x 700 source's automatic crop would support 300 PPI. Its detected crop was only 397 x 511, so the app correctly blocked upscaling. The test now reduces zoom before checking that a sufficiently large crop exports.
- TypeScript and production build passed. No dependencies were added. The previously deferred license-text flag remains unchanged.
- Visually inspected an enlarged generated 35 x 45 mm sheet: all six images have visible outside corner marks on white waste paper. Generic-profile controls also fit 320- and 390-pixel viewports. The generated browser workspace was cleared afterward; the owner's shared tab was not touched.

Test images are generated drawings only. Do not inspect or capture the owner's real photograph in the shared browser tab. Open a separate page for visual testing. Existing workspaces require a deliberate refresh to load the new build; refreshing discards in-memory photo state.

## Previous change: version 0.3.0

The owner asked for basic lighting enhancements because the face looked dark, and preferred a blueish rather than greenish UI.

- `src/tone.ts`: neutral defaults, bounded linear-light exposure, shadow lift, highlight reduction and contrast, a gentle preset, and truthful filename suffixes.
- `src/images.ts`: one original-based lighting -> optional white-background composite -> full-resolution export pipeline.
- `src/App.tsx`: independent lighting consent, per-slider/group/global reset, original/adjusted previews, deferred 1400-edge preview rendering, original-coordinate crop scaling, and lighting-aware review/reporting.
- `src/styles.css`: coherent blue/slate palette, accessible focus styling, expanded lighting controls, collapsible quality metrics and responsive layout.
- No dependency or privacy-boundary changes. Generative relighting and beautification remain excluded.

Start with Optional: lighting adjustments, enable its consent checkbox, then Brighten gently. The preset is +0.4 EV and shadow lift 12, not face-specific analysis. Reset lighting is exact neutral; disabling lighting clears its settings. Background and lighting can be enabled or removed independently. Reset all, clear and replacement remove both edits/consent and invalidate review/files.

Verification completed:

- **23 core tests passed**, including exact neutral identity, alpha preservation, non-mutating adjustments, linear exposure, shadow/highlight behavior, bounds, invalid input and all four edit suffixes.
- **11 Edge browser scenarios passed** across the regression run and focused rerun. Actual lighting-preview pixels and all three downloaded outputs match expected tonal values within sampling/JPEG tolerance. Dimensions, density and strict portal byte limits are preserved.
- Combined negative exposure/highlight reduction with portrait matting still exports a white background. Lighting-only and combined filenames are verified; downloaded report settings and warnings are verified.
- Consent, individual/group/global resets, clear/replacement, stale-output invalidation, offline processing and absence of persistent app storage are tested.
- Layout checks pass at 320, 390, 768 and 1280 pixels. The blue lighting panel was visually inspected at desktop and mobile sizes with a generated drawing in a separate browser page.
- **TypeScript and production build passed.**
- Existing license inventory remains **94 packages / 98 notice files** with the previously deferred `guid-typescript@1.0.9` missing-text flag. The inventory command exits nonzero for that known flag; this is not publication clearance.

One new test initially sampled the white center guide instead of an image pixel; the sample was moved off the guide and then matched the full-resolution exported pixels. A unit-test expectation was aligned to the independently expected rounded shadow result (65).

No real photograph was saved, copied or captured for testing. The owner's existing shared photo tab was not reloaded. To use the new build, open a new tab or refresh deliberately, which discards the old in-memory workspace. The local app runs at `http://127.0.0.1:4317`; it is still not a persistent Windows service.

## Previous change: version 0.2.0

The owner requested better enhancements, face-selected defaults and reset controls. Public release/license review is deferred; local-only and privacy requirements are unchanged.

New implementation:

- `src/vision.ts`: MediaPipe face detection + MODNet portrait matting using local ONNX WebAssembly.
- `src/FaceSelector.tsx`: explicit face choice and two-point manual head marking.
- `src/core.ts`: head-aware independent crop defaults, guide reprojection, matte tuning.
- `tools/setup-vision.mjs`: one-time public model downloads and local runtime copies.
- `public/vision/model-provenance.json`: pinned model URLs, sizes and SHA-256 hashes.
- `third-party-licenses`: upstream runtime notices.

Model initialization is required before input is enabled; a failure is visible and manual cropping remains available. Local server CSP permits only `/vision/` model/runtime asset reads. Images never leave browser memory.

Reset behavior:

- Per-slider resets to the selected head's suggested value.
- Per-crop reset restores its geometry; print reset restores its head guides.
- Background reset restores cleanup 3 / soft-edge preservation 100.
- Reset all retains original photo and selected head, removes the edit, restores suggested crops/PPI and six-up layout, and clears confirmations and exports.

Version 0.2 verification completed on 2026-10-15:

- **17 core tests passed.**
- **9 Edge browser tests passed**, including actual offline local matting, face detection completion/fallback, manual head selection, per-control/per-crop/global resets, stale-output invalidation, download sizes/densities, source-resolution guards, mobile layout and no persistent browser storage.
- **TypeScript and production build passed.**
- Runtime dependency audit reported **zero known vulnerabilities** at the time checked.
- **94 installed packages inventoried; 98 upstream notice/license texts preserved.**

`npm run licenses` intentionally retains one unresolved release-review flag for `guid-typescript@1.0.9` (ISC declared, license text absent); the owner asked not to block local usability on publication review. This is not publication clearance.

Browser tests use generated drawings and exercise actual models. They do not establish accuracy on all real portraits, skin tones, hairstyles or hardware. The next useful step is the owner's visual review of their own photo locally. No actual owner photo has been saved or uploaded for testing.

Historical version 0.1 results below are retained for context.

## Read first

1. [PROJECT_BRIEF.md](PROJECT_BRIEF.md): owner requirements and product scope.
2. [DECISIONS.md](DECISIONS.md): sources, corrections and architecture rationale.
3. [PRIVACY.md](PRIVACY.md): non-negotiable no-upload/no-persistence boundary.
4. [README.md](README.md): operation and actual implemented features.
5. [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md): licensing obligations.

## Workspace

`D:\private_repos\passport-photo-local`

This is the personal project. Do not work in the unrelated repository from which the planning conversation began. Do not initialize Git, publish, upload, deploy, configure a remote, or add a cloud API without a new explicit instruction.

## Implementation map

- `src/App.tsx`: profile selection, local file input, manual checks, independent crops, edit preview, downloads.
- `src/core.ts`: pure crop geometry, source limits, header inspection, quality measurements, simple background mask, sheet layout, JPEG density.
- `src/images.ts`: browser-only decoding, canvas processing, JPEG encoding and output revalidation.
- `src/styles.css`: responsive local interface, no remote fonts.
- `tools/serve.mjs`: loopback-only static production server, no writes/uploads/logged request data.
- `tools/licenses.mjs`: installed-dependency inventory and notice preservation.
- `tests/core.test.ts`: pure function tests.
- `tests/browser/workflow.spec.ts`: Edge end-to-end workflows, file bytes/density and privacy checks.
- `playwright.config.ts`: starts production server for tests on port 4317.
- `Start-Local.ps1`: convenience launcher for installed dependencies.

## Commands

```powershell
Set-Location 'D:\private_repos\passport-photo-local'
npm test
npm run licenses
npm run build
npm run test:e2e
npm start
```

The browser tests manage their own server and will fail if another process already owns port 4317. Stop only the known project process, not unrelated processes. The regular server runs attached to the terminal and stops with Ctrl+C.

## Historical version 0.1 verification

Final command sequence on 2026-10-15:

- `npm test`: **13 passed**.
- `npm run licenses`: **77 installed packages inventoried, 80 license/notice texts preserved**, no unresolved declaration/missing-notice flags.
- `npm run build`: **TypeScript and production build passed**.
- `npm run test:e2e`: **7 passed** in local Microsoft Edge.
- `npm audit --audit-level=moderate`: **zero reported vulnerabilities**, including development dependencies, at the time of the check. This is not a vulnerability-free guarantee.
- No `.git` directory; no remote repository or hosting.
- Manual smoke check: production URL returned HTTP 200, the listener bound only to `127.0.0.1:4317`, and the actual interface was opened and visually checked in the integrated browser at desktop width. Automated mobile-width checks passed.

The app was left running in the implementation session's attached local process. It is not installed as a service and will not automatically restart after a reboot or session shutdown. Use `npm start` (existing build), or `Start-Local.ps1` (rebuild then serve), to restart it.

Browser tests actually downloaded and decoded all three JPEG outputs. Verified:

- Individual print: 1200 x 1200 pixels, 600 PPI JFIF metadata.
- Sheet: 2400 x 4200 pixels, 600 PPI metadata, repeated image content in all six slots and white outer vertical margins.
- Portal: 630 x 810 pixels and strictly below 250,000 bytes.
- Processing/export worked with the browser offline and no processing-time HTTP requests.
- No cookies, localStorage, sessionStorage, IndexedDB databases or service-worker registrations.
- Static server rejects POST and exposes no files outside its build allowlist.
- US output exclusions, crop invalidation, insufficient-resolution rejection, transparent-image rejection, background opt-in/edited filenames, mobile layout and reload/clear behavior.

Failures found and resolved during development:

- One extra parenthesis in a test prevented the initial compile.
- A browser test attempted review before image loading finished; the test now waits for the review panel.
- Four native bundler packages omit root license files. Same-version, same-repository parent notices are attached with explicit provenance.
- A targeted test argument was not forwarded through the local npm PowerShell wrapper. Directly invoking `node node_modules\@playwright\test\cli.js test --grep 'US mode'` worked.

## Next development priorities

1. Let the owner try a real original locally. Do not save their photo or report automatically.
2. Gather usability feedback before expanding the architecture.
3. Gather real local-photo feedback on face selection and matting without saving or uploading the owner's image.
4. Keep limitations visible: face/head estimates and soft portrait masks are not automatic eye/expression/pose compliance checks.
5. Re-run the commands above after any code or dependency change.

## Privacy reminders

Do not introduce telemetry, image uploads, fetch-based inference, data URLs in remote requests, cookies, IndexedDB, local/session storage, service workers or server-side image logging.

Source documents may be opened explicitly by the user; photo data must not accompany navigation. Project notes can persist. Photos and analyses cannot persist automatically.

## User's last requests

- Build a local-only implementation, with all files under the personal profile.
- Do not store any uploaded/user data on hosting servers.
- Save project discussions and learnings here for continuity across restarts and tools.
