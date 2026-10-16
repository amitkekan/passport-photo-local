# Decisions and research learnings

Recorded: 2026-10-15. This document preserves the reasoning, corrections and uncertainty from the planning conversation. It is not a claim that every government rule is fully verified.

## D23: Diagnose the actual rejection and allow tinted light walls

The owner supplied an exact HEIC after the brightness fix did not resolve their case. An isolated offline reproduction showed a color rejection, not a darkness rejection. The background had low texture and low brightness variation. The previous color limits (mean channel spread 22, at most 3% of samples above spread 40) effectively demanded near-gray pixels, excluding ordinary light walls with a tint.

Version 0.6.3 allows mean channel spread up to 50 and keeps a 3% cap on strong-color samples, now defined as spread above 80. Spread is max(R,G,B) minus min(R,G,B), not spatial variation or a semantic scene label. These are engineering heuristics for light cream and muted pastels. Strong green, blue and pink fixtures remain rejected; mask-confidence, texture, brightness and dark-patch checks are unchanged.

The color limits are shared constants for the predicate and UI. Expose mean color spread, strong-color fraction, brightness variation, textured-edge fraction and confident-background coverage so a future failure can be diagnosed without guessing at unrelated thresholds. The preparation report retains these metrics only on explicit download.

Test the exact failing input, not just a different original from the same conversation. The supplied HEIC now reaches a correction preview in the offline production app, without saved photo copies, screenshots, reports or exports. Never add its path, filename, private measurements or pixels to project fixtures or notes. Regression fixtures are generated drawings, not personal photographs. Passing the guard is not a visual certificate or proof of passport compliance.

## D22: Tolerate light-wall shading without waiving foreground-mask failures

The owner reported a false rejection of a light-colored wall and explicitly requested more leniency. The original guard rejected any image with more than 0.5% of background samples below luminance 120, even if the rest of the wall was light. Its mean-185 and standard-deviation-22 limits also excluded dimmer light-gray walls and ordinary gradients.

An initial mean-160 / 5%-shadow adjustment still rejected a supplied underexposed-wall original, so it was not treated as a completed fix. Version 0.6.2 uses a mean of at least 140, at most 15% below 120, and standard deviation at most 35. A separate near-black guard retains the original 0.5% allowance for values below 65. Strong-color, local texture, coverage and uncertainty thresholds are unchanged. All checks still use original pixels and the unmodified raw mask, not a lighting-enhanced image or a user-cleaned matte. Dimmer/shadowed accepted cases warn that whitening a wall does not correct facial underexposure.

These chosen bands are product heuristics tested with synthetic walls and controlled shadows, not measured government standards or proof of real-world matting accuracy. Uniform light gray and mild gradients now pass. Large shadows, near-black patches, colored/textured scenes and uncertain masks still fail. Do not loosen the near-black guard to admit dark clothing that the portrait model mistakenly classified as background.

The UI distinguishes overall dimness, excessive moderate shadows and near-black patches. It displays brightness, shadow and near-black sample percentages in browser memory and explicitly explains that an apparent dark background may actually be a missed part of the person. Keep consent, wall confirmation, original-based analysis, edited filenames and the no-override behavior.

This supersedes only the brightness/shadow/variation portion of D17. The original boundary and the reason for retaining foreground protection remain relevant.

## D21: Correct the head geometry, not just the portal zoom

After HEIC worked, the owner still found the portal default unsatisfactory. Investigation established that Reframe upload ignored corrected print head-top/chin guides and reused the original selected face. Automatic crown geometry also came only from a detector box padded by 30% of its height. A tighter zoom cannot make that estimate correspond to the visible hair.

Version 0.6.1 uses the already-loaded local portrait model to refine the portal crown. A bounded strip around the selected face must contain several clear background rows followed by a sustained foreground transition. A small allowance protects the estimated edge. Solid, uncertain or insufficient masks do not count as successful refinement; the UI explains the fallback. This is not pixel-exact hair segmentation or passport-rule validation. Keep the detector's bottom/width estimate and require review of chin, ears, hair and coverings.

The refined head is portal-specific. Print framing, print guides, density and physical sizing remain unchanged. Reframe upload converts corrected print guides back into original coordinates and uses those corrections instead of stale detector geometry. Untouched/reprojected guides retain the automatic crown refinement. Reversed guides fail visibly.

Pupils now center horizontally only. Their vertical location no longer pulls the crop toward an invented 40% eye line. Retain the approximately 80% head-height and 5% headroom starting targets, bounds and existing minor-resolution expansion. Show head lines and percentages in the portal preview, never in exports. These are measurements of estimated/marked height, not 80% face area.

The automatic mask is temporary browser memory, never an automatic background edit. Reuse it only for the existing explicit background check. No new dependency, remote service, stored photo or new model is introduced.

## D19: Browser-local HEIC support

The owner reported that HEIC originals could not be opened. Version 0.6.0 adds direct HEVC-based HEIC/HEIF still input, rather than requiring a cloud converter or writing intermediate JPEG files.

Use the pinned `heic-to@1.6.5` package's CSP-compatible libheif 1.23.5 source, compiled with libde265 1.0.16 and unsafe evaluation disabled. A build alias and narrow TypeScript declarations expose the needed native wrapper API. This intentionally avoids the convenience wrapper's first-image selection: select exactly one `is_primary()` image, check its dimensions, decode only that image, release handles/context, and terminate the disposable worker.

A declared primary image can coexist with a visible tone-map item that references it. Such a reference must not cause the primary image to be filtered out as a tile. Metadata-only regression coverage preserves this case. Container checks bound box structure, identifiers, declared image dimensions and codec brands. Sequence containers, unsupported primary types, malformed input, transparency and oversized dimensions fail explicitly.

Decoder code is loaded as part of the initial local application, not fetched after photo selection. The worker has a 90-second timeout; production CSP adds only blob workers and keeps existing connection restrictions and the prohibition on general JavaScript unsafe evaluation. The bigger startup bundle is an intentional privacy/offline tradeoff.

LGPL-3.0 is not silently added to the permissive-license list. Preserve libheif/libde265 notices, pinned source/build references and the distribution/patent review flag. Two pinned upstream graphic fixtures supplement the generated tests; never use real portraits as fixtures. Private local verification used the supplied originals without screenshots, saved outputs, reports or processing-time HTTP requests. Do not retain their paths or measurements in project notes.

## D20: Follow the supplied tight portal-crop guidance

The owner clarified the portal instructions: little space above the head or beside the ears, approximately 80% face coverage, exactly 630 x 810 pixels and fewer than 250 KB. This supersedes the exploratory idea of adding extra headroom.

Use an engineering starting point of 80% marked head height and 5% top margin, subject to source bounds and width constraints. When eye markers exist, center around their midpoint while keeping feasible top space within 3-7% and retaining the head. These numbers are composition heuristics, not proof of 80% face area or a government eye-height rule. The sample image is still needed to judge exact ear margins.

The explicit Reframe upload around marked face action uses current head/eye marks and changes only the upload crop. Manual zoom/position controls remain. Old files and review confirmations are invalidated. Print framing, PPI, physical sizing and the no-upscale invariant remain unchanged.

Keep the bounded minor-shortfall expansion, measured against the new natural crop. Update tests to actually exercise a minor shortfall under the tighter default; do not weaken the 10% bound to keep an old fixture passing.

Crop proportionally to 7:9 before encoding 630 x 810, rather than following an aspect-ratio-off stretch. Do not repeat the claim that opening and saving guarantees a smaller file with no quality loss. Measure the encoded bytes and use the existing bounded JPEG quality loop without shrinking output dimensions.

## D01: One source, separate crops

The Indian physical and portal requirements differ. A square print is not the same image shape as a 630 x 810 upload. Use one original capture and derive independent crops; never stretch one into the other.

630:810 equals 7:9, the same aspect ratio as 35:45. Pixels do not specify millimeters without a print scale. An exact 2-inch length is 50.8 mm; official documents commonly round this to 51 mm.

## D02: Physical Indian requirements were read from the downloaded PDF

The owner provided the local reference `C:\Users\kekanamit\Downloads\photo-specifiation.pdf`. Its text was extracted locally, not uploaded.

Source link:
https://services.vfsglobal.com/one-pager/india/united-states-of-america/passport-services/pdf/photo-specifiation.pdf

Findings:

- Color photograph, 2 x 2 inches (listed as 51 x 51 mm).
- Plain white background and no distracting shadows.
- Full frontal view, centered head, visible eyes.
- Full head from top of hair to bottom of chin.
- Diagram indicates head height from 1 to 1 3/8 inches (25 to 35 mm).
- Colored clothing, not patterned/textured or pure white.
- Clear, continuous-tone photo print; high-resolution photography/printing recommended.
- Head-covering exceptions and other appearance details are profile-specific.
- No particular PPI is specified.
- The document does not establish how many copies must accompany the application.

The owner's application requires two physical photos. Treat that as their application context, not a universally verified count.

The extracted eye-height text contains inconsistent fractions. Visually verify the original diagram before implementing an exact eye-height rule. It has deliberately not been encoded.

## D03: Indian portal requirements were directly extracted

Source supplied by owner:
https://assets.ctfassets.net/xxg4p8gt3sg6/65N7mZz0hfj57DM1VlnLA2/2c951b35b3a446e6e970e2844036ff02/Passport-Seva-Photo-Upload-Instuctions-May-2026.pdf

Relevant document wording:

- "The image size must be exactly 630 x 810 pixels and less than 250 KB."
- "Save the image in JPEG format."
- "Use a light-colored background"
- "Ensure no shadows on the face or background."
- "Do not use filters or photo editing tools."

The instructions explicitly include cropping and resizing. They recommend a newly captured, high-resolution original and include sample-based framing instructions. Interpret source capture resolution separately from exported portal dimensions.

"Light-colored" does not mean every pixel must equal RGB 255,255,255. Background checks must not invent a stricter pure-white pixel threshold as a government rule.

## D04: Editing instructions contain nuance and tension

The physical VFS document says not to retouch, enhance or soften the photograph. It also says brightness and contrast should be adjusted to represent the subject and background accurately, with natural skin tones.

This corrected an initially overbroad assumption that all tonal adjustment was unconditionally prohibited. However, the portal document separately prohibits photo-editing tools. Neither fact should be hidden.

Decision:

- Keep automatic post-capture exposure/contrast/relighting disabled.
- Offer capture guidance.
- Optional background editing is explicitly user-selected and marked policy-unverified.
- Do not claim the optional edit is compliant merely because it looks natural.

## D05: US source is a web page, not a required PDF

Source:
https://travel.state.gov/en/passports/apply/help/photos.html

Printed-photo baseline: 2 x 2 inches, head height 1 to 1 3/8 inches, white/off-white background. Direct retrieval was blocked during research; indexed official guidance supported the size/head facts. Recheck current wording and exceptions before expanding automatic enforcement.

Online renewal has its own guidance:
https://travel.state.gov/en/passports/renew-replace/online/upload-digital-photo.html

Initial search summaries incorrectly mixed visa constraints with passport online-renewal rules, including square pixel limits. These mixed summaries were rejected as an implementation basis. US online renewal is not implemented.

## D06: Local web application

A browser interface was chosen over a native desktop/mobile app:

- Works on the owner's existing Windows computer.
- No app-store distribution or paid AI service.
- Can eventually support phones, but current local loopback is computer-only.
- A phone accessing a laptop is a separate LAN/HTTPS setup; do not expose the local server automatically.

The first recommendation was Next.js, TypeScript, Sharp and local vision models. Dependency inspection showed Next.js itself includes optional Sharp and native binary dependencies. Sharp uses LGPL-licensed libvips.

Actual implementation uses React + TypeScript + Vite with browser Canvas processing. It needs no image backend, avoids Sharp/libvips and model-weight licensing in the MVP, and simplifies the no-upload boundary. A static Node server serves application files only.

This is a deliberate architecture refinement, not a claim that the original recommended stack was fully implemented.

## D07: Historical version 0.1 feature boundary

Version 0.1 included file validation, manual crops, manual head guides, image-region quality advisories, exact JPEG exports, print sheets, optional simple color-based background editing, and privacy safeguards. D12 below supersedes its face-detection and matting limitations.

Not implemented: learned face/pose/eye detection, automatic full compliance judgment, high-quality learned matting, live capture, HEIC, PDF output, printer ordering or an acceptance guarantee.

Manually confirmed checks must not be reported as model-verified. Uniform RGB backgrounds are not enough to demonstrate passport acceptance.

## D08: Open-source licensing

Original project code uses Apache-2.0. Upstream licenses checked during planning:

- React and Next.js: MIT.
- TypeScript and MediaPipe library code: Apache-2.0.
- Sharp: Apache-2.0.
- libvips: LGPL-2.1-or-later.

Library code license does not establish model-weight permission. No weights were bundled.

HEIC codecs can introduce software-license and patent questions; no HEIC implementation was bundled.

Dependency notices, exact versions, inventory and license checks are required. Preserve upstream license texts. Unknown or incompatible terms require review. A scanner result is not a guarantee of legal clearance.

Government/VFS PDF documents and example portraits are referenced by link, not copied into the project. Test assets are geometric drawings rather than scraped photographs.

Eventual publishing requires a separate final artifact/provenance review. The initial instruction prohibited uploading or hosting. D18 records the later private-repository preparation request; no push or hosting has occurred.

## D09: Environment and installation

Initial Node.js: 22.6.0; npm: 10.8.2. Another Node version was installed, but the global runtime selection was not changed.

Direct public npm registry access failed with a TLS handshake error. The configured package mirror worked. TLS checks were not disabled and global package-manager settings were not changed.

Some mirror `latest` tags pointed to prereleases. Stable package versions were explicitly selected and pinned.

Initial dependencies installed with lifecycle scripts disabled. Existing Microsoft Edge is used for browser tests; no browser executable is redistributed with this project.

No Git initialization, commit, push, online deployment or model API call was made.

## D16: Measured eye guides, not an invented government band

The owner requested eye-position support. MediaPipe's two eye landmarks are retained when available; users can mark both pupils manually. Points stay in original-image coordinates while print and portal crops move. Measurements report heights upward from the bottom and the eye-line angle. Both eyes must be inside every active crop, and manual eye review gates export.

Direct official page retrieval was blocked, and available text extracted from the VFS diagram did not establish a reliable numeric range. This is uncertainty in the evidence, not proof that the source document is wrong. No numeric government band is enforced by default. A user may enter a print range in millimeters from their current instructions; it checks both eyes, is labeled user-supplied, and is not applied to the portal. Profile changes clear the target. Guides never reach exported pixels.

## D17: Conservative correction of near-valid light walls

This supersedes unrestricted background replacement. The owner explicitly excludes forests and busy scenery. Eligibility uses original image pixels and the raw local MODNet mask, never a lighting-adjusted source or user-cleaned mask. Editing consent and light-wall confirmation are both required. There is no rejection override.

Engineering limits, not government rules:

- Confident background alpha at most 0.05; coverage at least 15%, with at least 64 samples.
- At most 35% uncertain pixels (alpha between 0.05 and 0.9).
- Confident coverage on both sides and the top, each measured against the complete mask: 3%, 3% and 2%.
- Mean luminance at least 185/255; pixels below 120 account for at most 0.5% of background samples.
- Mean channel spread at most 22; at most 3% of background samples have spread above 40.
- Luminance standard deviation at most 22; adjacent-background differences above 12 account for at most 1.5% of measured pairs.

Passing does not prove a scene is a wall. False rejection is preferable to an unrestricted replacement path. Light-wall gradients and faint waves are tested; strongly colored, dark and textured scenes and uncertain masks are rejected. A geometric test drawing's dark rectangular shirt was treated as background by the model and correctly rejected. The successful integration fixture uses light clothing; thresholds were not weakened. Synthetic tests do not establish real-world matting accuracy.

Targets are white (`#ffffff`), very light neutral (`#f5f5f5`) and very light warm (`#faf8f4`). Nonwhite targets may not satisfy a white-background rule. Soft boundaries can change fine detail. Retakes remain preferable where editing is prohibited.

## D18: Private Git preparation, reproducible local setup and privacy

The owner now wants private-repository setup instructions, not online photo hosting. No remote URL or actual push was supplied. No repository, commit, remote or push was created. The guide provides explicit staging, review and user-executed publishing steps.

Photos, outputs, reports, secrets, generated models/runtimes, dependencies and build/test output are excluded from intended version control. Small model provenance and existing license notices are retained. Ignore rules do not protect already tracked files or replace staged-file review.

The original mirror-specific dependency pins and lock URLs were not suitable for a novice's independent checkout. Direct versions were deliberately repinned, with Vite 6.4.1 and Playwright 1.55.1 checked against tagged upstream manifests. The project defaults to the public registry; lock URLs are canonical public tarballs with integrity hashes preserved. Installation through an approved mirror and a clean offline public-lock install passed. Public metadata/audit TLS failures remain an environment limitation, not an all-clear advisory result. TLS was not bypassed and global settings were not changed.

Model setup verifies pinned SHA-256 values before installation, reuses matching assets, rejects mismatches, and cleans its temporary download files. First-time public model downloads were tested in an isolated temporary folder, which was removed afterward. Dependencies/models are public application assets; no photograph is involved.

Source: [Vite 6.4.1 manifest](https://raw.githubusercontent.com/vitejs/vite/v6.4.1/packages/vite/package.json), [Playwright 1.55.1 manifest](https://raw.githubusercontent.com/microsoft/playwright/v1.55.1/packages/playwright-test/package.json).

## D10: Local persistence versus private user data

Project discussions and source files must persist on disk. User photographs and analysis must not.

Store decisions, sources, feature status, licensing and test instructions in the project. Never include actual user image content, EXIF/GPS metadata or private analysis in these documents.

Explicit user downloads persist in their chosen local folder. This is different from automatic server storage and must be explained clearly.

## D11: Testing strategy

Validate actual outputs, not just UI labels:

- Decode downloaded JPEGs and verify exact pixels.
- Read JFIF density for physical printing.
- Check portal size strictly below the decimal byte limit.
- Verify six non-overlapping 2-inch rectangles fit a 4 x 7 sheet.
- Reject crops lacking real source resolution.
- Confirm edits and crop changes invalidate old exports and confirmations.
- Test invalid file contents and damaged headers.
- Run browser processing offline; inspect network and persistent storage.
- Confirm static server rejects writes and exposes only known application assets.
- Verify mobile layout, reload behavior and clear-photo action.

Automated tests use drawings, not real portraits. Real-world model accuracy, demographic fairness and government acceptance remain future evaluation work, not proven by formatting tests.

## D12: Usability priority, local face detection and portrait matting

The owner found the initial enhancement features inadequate and requested better face-based defaults and reset controls. They asked to defer open-source publication concerns rather than restrict the local product to the initial simple algorithm.

Chosen implementation:

- MediaPipe Tasks Vision 0.10.21, BlazeFace short-range version 1, CPU inference.
- ONNX Runtime Web 1.22.0, single-threaded WebAssembly, no hosted inference.
- MODNet FP32 from Xenova, pinned model revision `fa2fa546052fba4c08921230a26cc69a333fca12`.
- MODNet RGB normalization uses mean/std 0.5, dimensions divisible by 32, shortest-edge target 512 and longest-edge bound 1024.
- A soft alpha matte preserves solid foreground and blends boundaries over white. It replaces the previous RGB flood-fill algorithm.
- Defaults preserve soft edges; cleanup and edge controls have individual and group reset.

MODNet's official README explicitly includes code, models and demos under Apache-2.0, except its GIF directory. The pinned model card declares Apache-2.0. The source README and model card were checked; no demo portraits or GIFs were copied.

Runtime notices are retained locally. Transitive `guid-typescript@1.0.9` declares ISC but has no upstream license text. This remains an explicit publication-review flag; publishing is not authorized and no license clearance is claimed.

### Face framing

BlazeFace detects face boxes, not the top of hair. Estimated head extent adds space above the box; users must inspect it. When exactly one face is found, it is selected. With multiple candidates, the user selects the intended face. With no confident detection, the app explains that and offers manual top-of-head/chin marking.

Print suggestions aim for an estimated head height of 60% of a 2-inch photo, inside the supplied 1 to 1.375 inch interval. Portal suggestions use a separate 7:9 crop and larger estimated head fraction. These are framing heuristics, not a new government rule. Physical source bounds and resolution can prevent an ideal crop; the app does not synthesize missing margins or upscale.

Guides are reprojected through crop changes so their source-image anchors remain stable. Reset all keeps the current selected head and original photo, removes edits, restores suggested geometry and PPI, resets the sheet layout and invalidates prior confirmations/exports.

### Privacy refinement

The production CSP changed from denying every fetch to allowing only local `/vision/` asset reads. Model/runtime files load before photo input becomes available. Every processing operation then runs in-browser without a network call. Server method restrictions, no request logs, no browser persistence and offline processing tests remain.

This is not permission to upload photos to a third-party API. No cloud processing, repository upload or hosting was introduced.

## D13: Explicit optional lighting and blue/slate interface

The owner reported that their face appeared too dark and asked for basic photo enhancements. They also preferred blue over the previous green interface.

- Supersede the earlier UI exclusion of ordinary tonal controls. Keep automatic changes disabled and expose user-selected exposure (-1 to +1.5 EV), shadow lift (0 to 40), highlight reduction (0 to 50) and contrast (-20 to +20).
- All defaults are zero. Brighten gently uses +0.4 EV, shadow lift 12, no highlight reduction and no contrast. It is a starting point, not automatic skin-tone analysis.
- Require separate lighting consent and warn about editing restrictions, noise and irrecoverable clipped detail. No generative relighting, face reshaping, invented detail or beauty filters.
- Adjust in linear light with a common luminance-based RGB gain and a bound preventing individual channel clipping. Alpha is unchanged. The neutral path is exact identity and the original buffer is not mutated.
- Process original -> lighting -> optional portrait matte on white -> independent crops -> JPEG. Never apply lighting to an already-edited result. A replaced background stays white even with negative exposure or highlight reduction.
- Use a maximum-1400-edge deferred preview. Scale original-coordinate crops to preview coordinates. Export using full-resolution source pixels, not the thumbnail, and prevent export while a preview update is pending.
- Reset individual sliders to zero; Reset lighting is neutral; disabling consent clears tone settings. Clear/replacement/global reset clear tone settings and consent. All edits invalidate old files and confirmations.
- Distinguish original-based, lighting-edited, background-edited and lighting-and-background-edited filenames. Record the active settings and limitations in explicit downloaded reports.
- Use blue/slate throughout, with amber warnings and red errors. Expand the lighting panel by default, offer side-by-side previews and collapse secondary original-quality measurements.

No new dependencies, hosted processing, photo persistence or release-license clearance are introduced. Tests use generated drawings, not retained personal photos.

## D14: Standard print sheets, outside cutting guides and generic metric prints

The owner reported missing cutting margins in downloaded sheets. The renderer previously drew photographs on white paper without crop marks, so white photo backgrounds blended into the paper. Six 2-inch photos also filled the original 4-inch-wide sheet without side margins.

The owner explicitly rejected 4 x 7 as nonstandard and requested standard sizes, superseding the original instruction to retain 4 x 7. Offer 5 x 7 by default and 4 x 6 as an alternative. Every layout uses 0.25-inch gaps and outer white margins. Optional dark crop marks are enabled by default, with 0.03-inch separation from photo edges, 0.08-inch length and 0.005-inch stroke width. The full ink footprint must stay outside every photo and inside the paper.

- 2 x 2 inches: six copies on 5 x 7, two on 4 x 6.
- 35 x 45 mm: six copies on 5 x 7, four on 4 x 6. These intentionally leave comfortable cutting margins rather than maximizing packing density.
- Only the sheet receives cutting marks. Individual photos and the portal upload never receive them.
- Filenames, preview labels, PPI options and downloaded reports reflect the actual paper size and photo format.
- Changing layout, density or guide visibility invalidates old files and confirmations. Global reset restores 5 x 7 with guides enabled.

The owner then requested 35 x 45 mm prints for other countries. Use a separate generic physical-print profile rather than inventing country-specific rules. Keep one active print format at a time, preserving the same original when profiles change. Require explicit destination-rule review. Display head height in millimeters and require ordered guides within the crop, but do not apply the square-photo 1 to 1.375 inch head-height rule to this generic profile. Framing remains a suggestion.

35/25.4 and 45/25.4 inches do not map to integer pixels at 300 or 600 PPI. Round each dimension to its nearest pixel: 413 x 531 at 300 PPI, 827 x 1063 at 600 PPI. State the rounding limitation (less than 0.043 mm per dimension), record nominal and raster-derived millimeters, use the resulting pixel aspect ratio for cropping, and never upscale insufficient source pixels. This physical print is not the Indian 630 x 810 portal upload.

Printing instructions specify the selected sheet size, actual-size scaling and no automatic enhancement/cropping/borderless expansion. Larger paper does not mean larger passport photographs. Physical print accuracy still requires a ruler check.

No new libraries, remote processing or photo storage are needed. Real shared browser photos must not be inspected, reloaded or captured during testing.

## D15: Distinguish print resolution from portal resolution

A reported insufficient-resolution warning exposed two usability problems: the generic message suggested 300 PPI even when 300 PPI was already selected, and the automatic portal crop could be slightly tighter than necessary to retain native upload pixels.

Print and portal resolution checks now report their own available and required dimensions. Offer Use 300 PPI for prints only when the prospective 300-PPI crop actually supports the requested print size. Explain that print PPI does not change portal dimensions.

For face-based portal defaults, allow at most 10% expansion of the proposed crop in each dimension to retain at least 630 x 810 source pixels. Use an 811-source-pixel height target to avoid floating-point undershoot, bounded by the original image. Recompute around the selected head, rather than shifting its center accidentally. This limit is an engineering safeguard, not a government head-size threshold. Larger shortfalls remain warnings so pixel count is not satisfied merely by adding excessive background around a small head. Print crop defaults and independent output sizing are unchanged.

Always require manual framing review. Manual zoom remains available and cannot bypass the no-upscale guard. Regression fixtures are generated geometry only; do not store the owner's photograph, original path or diagnostic measurements in project notes/tests.
