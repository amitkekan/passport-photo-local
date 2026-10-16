# Passport Photo Local: persistent project brief

Recorded: 2026-10-15. This is the durable summary of the planning conversation and agreed requirements. Read together with [DECISIONS.md](DECISIONS.md), [HANDOFF.md](HANDOFF.md), [README.md](README.md) and [PRIVACY.md](PRIVACY.md).

## Purpose

Help a person choose or take a suitable passport photograph, identify problems, prepare application-specific images, and order correctly sized physical prints. The product is a photo checker, formatter and capture coach, not merely a resizer and not primarily a chatbot.

Core promise: one original photograph, carefully checked and prepared for digital upload and physical prints, with honest limits on what is verified.

## Latest correction, version 0.6.3

The owner supplied a specific HEIC that still failed background correction. Its rejection came from color, not brightness. Support light cream and muted pastel walls rather than effectively requiring near-gray background pixels. Show color/texture/separation diagnostics, preserve the remaining guards and verify the exact supplied input privately before declaring success. The exact HEIC now reaches the correction preview offline; no personal file or measurements are retained in the project.

## Previous correction, version 0.6.2

The owner found the light-background guard too strict for a light-colored wall. Allow dimmer light-gray/off-white walls and small moderate shadows while retaining strong-color, busy-texture, near-black-patch and mask-confidence safeguards. Distinguish wall brightness from possible foreground-mask errors in rejection messages, and show the sampled brightness/shadow measurements locally. This is not permission for arbitrary scene replacement or an acceptance guarantee.

## Previous correction, version 0.6.1

The owner confirmed HEIC works but found the portal default unsatisfactory. Refine the visible crown using the existing local portrait model, rather than changing a zoom constant again. Honor corrected head-top/chin guides when reframing, remove arbitrary vertical eye-line alignment, and show head lines plus headroom/height percentages in the portal preview. Keep prints and original pixels unchanged. Mask uncertainty requires a visible notice and manual review, not an acceptance claim.

## Previous requirements, version 0.6.0

- Accept HEIC/HEIF still photographs directly without uploading or automatically saving converted files. Select the declared primary image in containers with auxiliary tone-map data, retain safety limits, and preserve an explicit decoder-license review flag.
- The owner clarified that the Indian portal needs a tighter crop with little space above the head or beside the ears and approximately 80% face coverage. Provide a head/eye-based reframe action, preserve proportions, and do not claim a height-based estimate proves face area.

## Previous requirements, version 0.5.0

- Include eye-position assistance: detected or manually marked pupils, source-anchored guides, bottom-origin measurements, manual review and an optional application-specific print range supplied by the user. No uncertain numeric rule is guessed.
- Limit advanced background correction to already-light, mostly plain walls with mild unevenness or faint patterns. Check original pixels and matte confidence; reject unsuitable/uncertain scenes without an override. Offer white and very light neutral/warm targets, with editing warnings and original preservation.
- Prepare for a private Git repository and give novices clear clone/ZIP, install, startup, update and troubleshooting instructions. This supersedes the earlier blanket prohibition on preparing for publication, but does not supply a remote or authorize an actual push or hosted deployment.
- Explain all data flows, explicit downloads, external setup assets and Git metadata. Preserve the strict browser-memory photo boundary.

See [GETTING_STARTED.md](GETTING_STARTED.md), [PRIVACY.md](PRIVACY.md) and decisions D16-D18.

## Usability update, version 0.2.0

The owner reported that the first app looked good but its photo-enhancement features were poor. They specifically requested reset-to-default behavior and better automatic face selection, and asked to pause open-source publication concerns while prioritizing usability.

Implemented response:

- Local MediaPipe face detection replaces the generic starting crop when one confident face is found.
- Multiple detections require explicit selection; no confident detection offers two-point manual head marking.
- Selected head geometry drives separate print and portal defaults and an achievable PPI choice.
- Head guides remain attached to source-image locations while cropping.
- Each slider, each crop, background settings and all adjustments have reset behavior.
- Global reset retains the photo and selected head, restores suggested crops/quality, removes optional edits and clears review confirmations and stale exports.
- Local MODNet soft portrait matting replaces color flood fill. Cleanup and soft-edge controls update the same mask without repeating inference.
- Public model assets are loaded from the local server before photo input. No user photograph, pixels or result is sent to a server.

No promise of perfect head/hair detection or government acceptance is made. At that milestone publication was unauthorized; the latest request allows private-repository preparation only. License declarations and upstream notices remain recorded, with unresolved release-review items documented rather than silently waived.

## Owner's explicit requirements

1. Start with US passports and Indian passports.
2. Initial audience: people in the United States applying for US passports or renewing Indian passports through Indian consulates.
3. Accommodate photos originating from different phones and cameras, while clearly stating supported file formats.
4. Identify unsuitable personal presentation, framing, background, image quality and lighting; explain when a retake is needed.
5. Produce an actual high-resolution, physically correct 2 x 2 inch print photo.
6. For the supplied Indian portal instructions, produce exactly 630 x 810 pixels in JPEG format, strictly below 250 KB.
7. Produce standard 4 x 6 and 5 x 7 inch sheets with visible cutting guides and multiple correctly sized photos. The owner explicitly replaced the initial 4 x 7 requirement in version 0.4.
8. Offer optional white-background replacement, off by default, with original preservation, preview and clear editing-policy warnings.
9. Analyze lighting, shadows, highlights and color. Prefer capture guidance; do not assume natural-looking alterations are permitted.
10. Design for eventual open-source distribution with license reviews. Apache-2.0 was recommended for original code and applied to this local implementation.
11. The owner initially required the personal profile, then explicitly requested relocation to `D:\private_repos\passport-photo-local` for later personal GitHub use.
12. Run locally. Prepare private-repository instructions under the latest request, but do not create a remote, upload code or deploy without a specific destination and authorization.
13. Do not transmit or store user data or uploaded photographs on hosting servers.
14. Persist project discussions, learnings and handoff information locally so changing tools or restarting the laptop does not lose context.

## Local project identity

- Working name: Passport Photo Local.
- Location: `D:\private_repos\passport-photo-local`.
- Normal-use URL: `http://127.0.0.1:4317`.
- No Git repository or remote was initialized.
- No accounts, database, paid AI service or cloud subscription.
- Project files are outside OneDrive and separate from the workspace in which planning started.

## Application profiles, not just countries

Rules must be scoped by issuing authority, submission route, jurisdiction where relevant, age group, and output type.

Initial implementation:

- India: supplied physical-photo requirements plus May 2026 portal specifications.
- US: printed-photo submission only.
- Adults only.

Future separately verified profiles:

- US online renewal.
- More Indian consular/application variants.
- Children and infants.
- Other countries.

Do not copy visa or OCI requirements into a passport profile merely because a search result combines them. Do not turn print-resolution calculations into portal upload rules.

## Agreed deliverables

### Individual print photo

- Physical size: 2 x 2 inches.
- Preferred quality: 1200 x 1200 pixels at 600 PPI when the crop contains enough original pixels.
- Alternative: 600 x 600 pixels at 300 PPI.
- PPI values are engineering print choices, not official minimums established by the supplied documents.
- Include physical-density metadata.
- No stretching or artificial upscaling to claim high resolution.

The owner also requested 35 x 45 mm printing for other countries. Provide a generic size-only profile, separate from the verified-dimension U.S./India routes. It requires manual destination-rule review and makes no country-specific compliance claim. At 600 PPI use 827 x 1063 pixels; at 300 PPI use 413 x 531. These are nearest-pixel physical dimensions, with less than 0.043 mm rounding error per dimension. Crop directly from the original at the output aspect ratio, never stretch a square print.

### Indian portal photo

- Exactly 630 x 810 pixels.
- JPEG.
- Strictly less than 250 KB.
- Implementation uses a conservative decimal limit of 250,000 bytes, with a 245,000-byte target.
- Preserve dimensions while adjusting JPEG encoding quality within a defined lower bound.
- Reject output if the size limit cannot be reached at that bound.
- Decode the resulting file and verify its dimensions.

### Print sheet

- Standard 5 x 7 inches (default): 3000 x 4200 pixels at 600 PPI, 1500 x 2100 at 300 PPI.
- Standard 4 x 6 inches: 2400 x 3600 pixels at 600 PPI, 1200 x 1800 at 300 PPI.
- 2 x 2 inch photos: six on 5 x 7, two on 4 x 6.
- 35 x 45 mm photos: six on 5 x 7, four on 4 x 6.
- Every layout has 0.25-inch white gaps and outer margins, with short cutting marks outside the photos. Marks are enabled by default and can be disabled. No border is drawn over a finished photo.
- The original 4 x 7 layouts are removed at the owner's request; this is an explicit requirement change, not a silent substitution.
- Instruct the user to select actual size / 100%, no fit-to-page, no automatic cropping, no enhancement and no borderless enlargement.
- Order the selected sheet size. Correct file geometry and margins cannot compensate for printer or lab scaling.
- User should verify a printed photo with a ruler.
- Direct ordering integration and PDF output are future features, not completed work.

### Preparation report

- Output dimensions and bytes.
- Rule/profile version.
- Manual confirmations versus automated measurements.
- Background-edit status and policy warning.
- Printing instructions.
- Source references and limitations.
- Report is downloaded only on explicit user action.

## Photo checks: intended scope

The intended full product checks subject count, facial visibility, pose, eyes, expression, glasses, head coverings, framing, background, shadows, exposure, sharpness and file compliance.

It must not judge attractiveness or infer ethnicity, nationality, gender, medical conditions or identity.

Current implementation distinguishes:

- Deterministic file/dimension/crop/byte-limit checks.
- Local face candidates and approximate head-aware crop suggestions, subject to user confirmation.
- Coarse central-region and corner-background quality measurements.
- Manual checks for face, pose, eyes, expression, exceptions and actual lighting.

Do not describe the current heuristic measurements as automatic face-compliance detection. Thresholds are internal engineering heuristics, not government rules. Dark skin is not inherently underexposure; global or central brightness alone cannot establish proper facial lighting.

## Outcome language

Use distinct concepts:

- Ready to format after required review.
- Retake recommended.
- Needs review / uncertain.
- Unsupported input or application.

Per-check results can be passed, failed, uncertain, user confirmation required or not applicable.

Avoid a misleading numeric acceptance probability and never claim "government approved", "guaranteed compliant" or "acceptance guaranteed."

## Background editing agreement

The owner explicitly wants an optional white-background tool.

- Off by default and requires informed opt-in.
- Preserve the original.
- Show before/after.
- Identify edited exports in filenames and report, not with a watermark on the photo.
- A white-looking background does not establish compliance with editing restrictions.
- Fine hair, glasses, veils and blurred boundaries contain mixed pixels; exact subject preservation cannot be guaranteed.
- Never rely on a reviewer failing to notice the edit.
- Retaking against a suitable plain background remains the recommended passport workflow.

The original 0.1 implementation used conservative color-connected selection. Version 0.2 replaces that editor with learned local portrait matting; uncertain edges still require inspection.

## Lighting and enhancement agreement

The tool should explain underexposure, uneven illumination, shadows, glare, clipped highlights and color casts. Capture-time guidance is preferred.

Conventional exposure and contrast adjustment is technically possible, but approval depends on the selected profile. Do not automatically enable it simply because it looks natural or does not use generative AI.

For version 0.3, the owner explicitly requested basic tonal controls to help when the face looks too dark. Offer exposure, shadow lift, highlight reduction, modest contrast and a gentle-brightening preset. Keep all values at zero by default, require informed opt-in, preserve the original, provide before/after and individual/group/global reset, and identify edits in filenames and the downloaded report. Controls operate on the whole image rather than identifying skin colors. This supersedes the earlier decision not to expose ordinary tonal controls, not the policy warnings or the exclusions below.

The owner prefers a blueish interface rather than green. Use a coherent blue/slate palette, readable controls and responsive layouts. Keep lighting controls visible and secondary quality metrics collapsible. Use generated test images for UI evaluation, never the owner's private photograph.

Excluded from passport preparation:

- Face reshaping, beauty filters, skin smoothing.
- Opening eyes or changing expression.
- Removing glasses digitally.
- Inventing hair, shoulders, facial detail or clothing.
- Generative relighting, sharpening or super-resolution.

## Privacy agreement

No photograph, filename, pixels, facial information, crop coordinates, edits or outputs may be sent to the server.

No application persistence in cookies, localStorage, sessionStorage, IndexedDB or service workers. No telemetry, session replay, analytics or external processing. Images stay in browser memory. Only deliberate downloads are saved.

Static application delivery is allowed. The local server must not expose upload/write endpoints or request logs. Production CSP prohibits connections. Tests must verify processing while offline and inspect network/storage behavior.

Do not promise secure physical RAM erasure or control over browser extensions, operating-system swap, crash dumps or download history. Future hosting would necessarily involve network metadata and requires a separate review. Hosting is not authorized now.

## Future roadmap

1. Strengthen real-world evaluation of quality checks without using private photos as test assets.
2. Review and benchmark face-landmark and segmentation model weights before introducing them.
3. Add uncertainty-aware automatic pose, eye visibility and framing assistance.
4. Add browser camera capture and live guidance.
5. Review HEIC decoder licensing and codec patent implications before enabling support.
6. Add independently verified application profiles.
7. Consider installable PWA behavior only if it preserves the no-photo-persistence contract.
8. Add PDF export and print-service integrations only when explicitly requested.

No expansion should quietly weaken the privacy or licensing requirements.
