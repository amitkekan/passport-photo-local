# Passport Photo Local

A personal, local-only passport photo preparation application. Original application code is Apache-2.0. No repository initialization, publishing, cloud hosting, accounts, photo uploads or database are required. Public model assets are downloaded once during setup and then served locally; photos never go to a model provider.

## Run

**New to Git or Node.js? Start with [GETTING_STARTED.md](GETTING_STARTED.md)** for trusted installers, private-repository clone or ZIP instructions, setup, updates, troubleshooting and safe publication preparation.

Use a currently supported, patched Node.js LTS release, at least 22.6. Run these commands inside your downloaded project folder:

The owner's existing checkout is now `D:\private_repos\passport-photo-local`. If you cloned the project elsewhere, open PowerShell in your own checkout instead.

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run setup:vision
npm.cmd run build
npm.cmd start
```

Open **http://127.0.0.1:4317**. Stop with Ctrl+C. After initial installation, normal use does not need an internet connection. `Start-Local.ps1` builds and starts using already-installed dependencies. No Windows execution policy changes are required or recommended; use the commands above if scripts are restricted.

The production local server binds only to loopback, serves a fixed set of build assets, accepts GET/HEAD only, emits no access logs, and rejects upload/write requests. Do not replace it with internet hosting without a separate privacy review. For development only, `npm run dev` enables Vite's local development connection.

## What works

- JPEG, PNG and HEVC-based HEIC/HEIF still input, with content-based validation, orientation handling, transparency rejection and size limits (25 MiB, 24 megapixels, 10,000 pixels per side).
- Advisory exposure, light-balance, detail and corner-background measurements. These are not face-aware checks or official thresholds.
- Independent print and portal crops, without stretching or upscaling.
- Local MediaPipe face detection, explicit face selection when multiple faces are found, and automatic independent crop suggestions.
- Two-point manual head marking when detection is wrong or uncertain. Review the estimated hair/head and chin guides.
- Reset buttons for every adjustment slider, each crop, background settings and all adjustments. Reset defaults follow the selected head, not a generic center crop.
- PPI starts at the highest supported choice for the suggested print crop; no upscaling.
- Resolution warnings identify the print and portal crop separately, with available and required pixels. A Use 300 PPI for prints button appears only when that crop will support it. Print PPI does not change the portal's 630 x 810 requirement.
- Indian profile: square prints and a 630 x 810 JPEG strictly below 250,000 bytes, with a 245,000-byte encoding target. Encoded dimensions are decoded and checked again.
- US printed-submission profile: square print and sheet only. Not a US online-renewal profile.
- 2 x 2 inch JPEG at 600 PPI (1200 x 1200), or 300 PPI (600 x 600), with JFIF physical-density metadata.
- Standard 4 x 6 and 5 x 7 inch JPEG sheets at matching PPI, with white gaps and optional cutting guides outside every photo. The owner replaced the original nonstandard 4 x 7 option.
- Generic 35 x 45 mm physical-print profile, with its own proportional crop, individual JPEG and sheet. This does not claim country-specific passport compliance or generate an Indian portal upload.
- Detected eye landmarks or two-point manual pupil marking, with source-anchored guides, eye heights from the bottom and a tilt measurement. Optional user-supplied print eye-height range; no unverified official numeric range is invented.
- Conservative light-background correction using local MODNet matting. Original-pixel brightness, color, texture and mask-confidence checks gate correction; unsuitable or uncertain backgrounds have no override. White, very light neutral and very light warm choices, with consent, wall confirmation, before/after, edge controls and edited filenames.
- User-initiated JPEG downloads and a JSON preparation report, without saving data in the application.
- Optional, consent-gated exposure, shadow lift, highlight reduction and contrast. Neutral defaults, a Brighten gently preset, per-slider reset and Reset lighting. No skin smoothing, face reshaping or generative relighting.
- Blue/slate interface with an expanded lighting panel, original/adjusted comparison and collapsible original-quality measurements.

## Brightening a dark photo

1. Select the correct face or mark the head manually.
2. In **Optional: lighting adjustments**, read the warning and enable the controls.
3. Try **Brighten gently** (+0.4 EV, shadow lift 12), then compare with the original. The preset is a conservative starting point, not an automatic face-specific recommendation.
4. Adjust exposure or shadows in small steps. Use highlight reduction for bright regions and contrast sparingly. These global adjustments cannot repair missing detail, motion blur or severe lighting problems.
5. Use a slider's Reset button, **Reset lighting**, or disable the controls to return to neutral. Disabling removes lighting changes; Reset all also removes background editing and consent.
6. Recheck the crops and review confirmations before preparing files. Lighting and background edits are labeled separately or together in filenames and recorded in the report.

Previews use a maximum 1400-pixel edge for responsiveness. Source-resolution checks and exports still use the full original. Processing always starts from the original, applies lighting, optionally composites the selected light background, and then creates the independent crops. Adjustments never accumulate on an already-edited image. A replacement background is therefore not darkened by lighting controls.

In version 0.6.4, **Highlight reduction** uses a stronger, gradual highlight-compression curve after exposure and contrast, before channel clipping. Start at **15-25**; **50** is the strongest setting. It now affects moderately bright regions and remains useful with raised exposure. Zero retains the previous exposure/shadow/contrast behavior, including Brighten gently. The same adjustment runs in previews and every export, preserving linear RGB channel ratios. It can keep exposure adjustments from flattening existing highlight differences, but cannot recreate detail already missing from the original. Original bright backgrounds may darken; an optionally replaced white/light background stays at its selected color.

## Eye position

1. Select or mark the head first. Inspect the orange eye markers, or choose **Mark both eyes** and click the center of each pupil in the original preview.
2. Review the eye heights and tilt in both crop previews. Markers stay attached to the original while crops move. Both eyes must remain inside every active crop.
3. If your current instructions provide a physical-print eye-height band, enable **Use an eye-height range from my current application instructions**. Enter millimeters measured upward from the bottom of the print. Convert inches by multiplying by 25.4.
4. The blue band is your supplied reference. Both eyes must fit it before export. It is not applied to the portal JPEG. Changing application profile clears the range.
5. Confirm that markers match visible pupils and manually check open eyes, level pose and obstructions. Eye guides and bands are never exported.

No government-approved numeric band is selected automatically. Available source text did not establish a reliable numeric range, and text extraction from a diagram is not authoritative evidence. This feature measures placement; it does not certify eye position or automatically straighten the person.

## Conservative background correction

Use **Advanced: conservative light-background correction** for a mostly plain light gray, off-white, cream or muted pastel wall, including underexposure, moderate shading or faint patterns. Accept the editing warning and confirm that the original is a wall, not scenery or a busy room. Select a target color and choose **Check and preview background**.

The app checks original pixels, before lighting adjustments, using confidently background pixels from the unmodified portrait mask. Version 0.6.2 is more tolerant of underexposed light walls: average brightness may be as low as 140/255, up to 15% of samples may be below 120, and luminance variation may reach a standard deviation of 35. Previously the limits were 185, 0.5% and 22 respectively. Dimmer/shadowed cases carry an additional reminder that whitening the wall does not correct dark facial lighting.

Version 0.6.3 also corrects false rejection of tinted light walls: mean color spread (maximum minus minimum RGB channel) may reach 50/255, and no more than 3% of background samples may have spread above 80. The earlier 22/40 limits effectively required near-gray pixels and rejected ordinary cream/pastel backgrounds. The UI now shows color, texture, brightness-variation and confident-coverage measurements as well as brightness/shadow readings.

Near-black samples (below 65) still cannot exceed 0.5%. Busy-texture and mask-confidence limits are unchanged, and vivid colors remain blocked. Dark hair or clothing missed by the mask must not be treated as a harmless wall shadow. Rejections distinguish overall dimness, moderate shadow coverage, near-black patches and excessive color, with a reminder that a mask error can be responsible. There is no override. These are editing safeguards, not a wall/forest classifier or official passport requirements. Some suitable walls will still be rejected when separation is unreliable.

White is the default and preferred when white is required. Other light tones may be unsuitable for that application. Inspect hair, glasses, clothing and transparent edges in the comparison, then review every crop. Solid foreground pixels are retained, but soft boundary blending can affect fine details. **Use original background** removes correction; **Reset background settings** restores white and default edge controls; **Reset all adjustments** removes edits and consent.

This cannot make an edited photograph compliant with a prohibition on editing. The reviewed Indian portal instructions prohibit photo-editing tools, and U.S. guidance restricts alteration. Retaking against a suitable wall is safer. Outputs and reports identify edits rather than asserting acceptance.

## Required human review

This is a formatting assistant, not an automated passport-compliance product. Local models detect candidate faces and estimate a portrait mask. Detection can miss faces or select a false positive; the head/hair extent is an estimate. Eyes, expression, head pose, head coverings, glasses, actual facial lighting and background shadows still need human review. The tool cannot establish identity, capture age, filter history, editing permission or government acceptance. Adults only.

Detected faces generate initial head guides, including estimated extra space above the face box for hair. Match them to the actual image or mark the top of the head and chin manually. Guides stay anchored to source-image points when the crop changes. The portal's example-based face coverage is a user review, not an automated validated measurement. No uncertain eye-height fraction from the VFS document is enforced.

For a minor portal-resolution shortfall, default framing can include slightly more original surroundings rather than upscale the image. Expansion is limited to 10% in crop height/width, uses only available original pixels and retains head-centered framing. Larger shortfalls remain explicit warnings instead of silently framing a small head with excessive background. Always check the adjusted portal framing against the official instructions. Reset the portal crop to restore its current suggestion.

Portrait matting is substantially more capable than the original color selection, but fine hair, translucent fabric, unusual poses and out-of-distribution images can still produce errors. Do not describe edited results as passport compliant. The reviewed Indian upload instructions prohibit photo-editing tools. Ordinary tonal adjustments are now available only by explicit opt-in. Beautification and generative relighting remain excluded. Retaking with suitable lighting is preferred.

Camera capture, automatic expression/pose compliance, HEIC sequences, PDF export and print-service ordering are not implemented.

## HEIC photos

Select `.heic` or `.heif` files directly, including uppercase extensions or files with no MIME label. A local decoder selects the container's declared **primary photograph**, not the first image or an auxiliary depth/gain/tone map. Container dimensions are bounded before decoding, and the actual primary-image dimensions are checked again before allocating the output pixels.

Decoding runs in a disposable browser worker with a 90-second timeout. The decoder is bundled with the application and loaded before photo selection; no converter website, upload endpoint or additional processing-time HTTP request is used. The worker is terminated after each result or failure. The original is never overwritten or automatically converted to a file on disk.

HEIF crop/rotation transforms are handled by libheif. Inspect orientation and color in the preview. HDR presentation, auxiliary images, depth information and original metadata are not preserved in the standard output. Unsupported, damaged, oversized or transparent input fails explicitly. To recover, export a JPEG in a trusted local photo application, keeping the HEIC original.

The decoder adds a few megabytes to the local application bundle. This deliberate startup cost supports offline decoding without later asset requests. Its LGPL and codec-patent considerations are recorded in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md); source-code Apache-2.0 licensing is not blanket clearance for the combined application.

## Indian portal crop

The supplied instructions ask for limited space above the head and beside the ears, with approximately 80% face coverage. The revised starting crop is tighter than the print crop. Its engineering target is about 80% **marked head height** with approximately 5% top space when source geometry permits; this is explicitly not proof of 80% face area.

Automatic portal framing now refines the crown from the existing local portrait mask instead of relying only on a padded detector box. It requires a sustained background-to-head transition and keeps a small edge allowance. This is a boundary estimate, not a verified hair outline; uncertain masks produce a visible manual-review notice. The mask is computed in memory without editing or exporting pixels. Print defaults are unchanged.

Select or mark the head and pupils, then use **Reframe upload around marked face**. Corrections to the print's head-top and chin guides now feed this action, rather than being ignored. The crop centers horizontally around the eyes, but does not shift vertically toward an arbitrary eye-height target. The portal preview shows head guides and the estimated/marked head-height and top-space percentages, making the suggestion inspectable. It changes only the upload crop and clears stale exports/review confirmations. Reset restores the selected head's automatic suggestion. Compare with the actual official example, especially the ear margins, then adjust zoom/position as needed.

The app crops original pixels to the 7:9 aspect ratio before producing exactly 630 x 810 pixels. It does not follow an aspect-ratio-off resize that would stretch the face. A minor resolution shortfall can still expand the crop by up to 10%; larger shortfalls remain visible. The square print is unchanged.

JPEG resaving does not guarantee a byte limit or zero quality loss. The encoder checks the actual dimensions and byte count, trying bounded JPEG quality settings to stay below 250,000 bytes rather than relying on a Save operation.

## Printing

Choose the paper size in **Print sheet size and layout**, and order that exact size with no auto crop, automatic enhancement, fit-to-page or borderless enlargement.

| Paper size | 2 x 2 inch photos | 35 x 45 mm photos |
|---|---:|---:|
| 4 x 6 inches | 2 | 4 |
| 5 x 7 inches (default) | 6 | 6 |

All layouts have 0.25-inch white gaps and outer margins. Cutting guides are on by default and appear only in waste paper, never over a finished photo. Align a straightedge through matching short marks and trim away the surrounding paper and gaps. Disable the guide checkbox for a clean sheet. Changing sheet size or guides clears old exports and confirmations.

The sheet is larger; the individual photos are not enlarged. Do not order the individual photo as a 4 x 6 or 5 x 7 print. Margins cannot correct a lab's automatic enlargement. Verify a cut photo with a ruler and use appropriate photo paper.

### Generic 35 x 45 mm prints

Choose **Generic 35 x 45 mm print: size only** in Application profile. Check the destination's official requirements yourself and confirm the additional review checkbox. Framing suggestions remain estimates; no U.S./Indian head-height rule is applied. Adults only.

- 600 PPI: 827 x 1063 pixels, approximately 35.010 x 45.000 mm.
- 300 PPI: 413 x 531 pixels, approximately 34.967 x 44.958 mm.
- Dimensions are rounded to the nearest whole pixel, less than 0.043 mm error per dimension. The crop uses the actual output aspect ratio to avoid stretching.
- The report includes requested dimensions, raster-derived dimensions, density, paper size, copy count and guide status.
- This print is separate from the Indian portal JPEG, which remains exactly 630 x 810 pixels and below 250,000 bytes.

PPI settings are engineering choices, not government requirements. High-resolution source pixels are required after cropping; the app will not upscale a low-quality original and label it high resolution. Browser encoding can vary; inspect the actual JPEG after download. Color is browser-managed into an sRGB canvas; original file and metadata are not copied into exports.

## Privacy

See [PRIVACY.md](PRIVACY.md). Images, filenames, pixel measurements, crop coordinates and reports remain in browser memory. No localStorage, sessionStorage, IndexedDB, service worker, cookies or analytics are used. Only explicit downloads persist outside browser memory. Clear the photo or close the tab to discard application state.

## Requirements sources

- [VFS physical-photo specification](https://services.vfsglobal.com/one-pager/india/united-states-of-america/passport-services/pdf/photo-specifiation.pdf)
- [Passport Seva upload instructions, May 2026](https://assets.ctfassets.net/xxg4p8gt3sg6/65N7mZz0hfj57DM1VlnLA2/2c951b35b3a446e6e970e2844036ff02/Passport-Seva-Photo-Upload-Instuctions-May-2026.pdf)
- [US Department of State passport photos](https://travel.state.gov/en/passports/apply/help/photos.html)

Rule profile: `2026-10-15-local-1`. India values were read from the supplied documents. US printed size/head range were cross-checked through indexed official guidance; direct page access was blocked during initial research. Current instructions and exceptions must be checked by the applicant. The required number of physical copies is not established by the image specification alone. Government/VFS PDFs, example portraits and logos are not redistributed.

## Validation

```powershell
npm test
npm run typecheck
npm run licenses
npm run build
npm run test:e2e
```

Browser tests use locally installed Edge and procedurally generated drawings, never a person's portrait. They cover actual downloaded JPEG dimensions, strict portal bytes, JFIF density, source-resolution rejection, invalidation, privacy and basic mobile layout. Test fixtures are not suitable passport photographs.

## Licensing and dependency provenance

Original code: Apache-2.0, see [LICENSE](LICENSE). Each dependency retains its own license. [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) describes the dependency review and limitations. `npm run licenses` records the installed dependency inventory and includes upstream license texts in the locally served notices. Exact versions are locked.

React and Vite replace the initially proposed Next.js/Sharp stack because all photo processing can run in the browser. No Sharp/libvips codecs are included. MediaPipe and ONNX Runtime run on-device using locally served WebAssembly. Model URLs, versions and checksums are in `public/vision/model-provenance.json`. Tooling contains native bundler binaries with their own notices.

The owner deferred open-source release review and now requests private-repository preparation. No repository, remote, commit or push has been created by this work. `npm run licenses` intentionally flags the LGPL-3.0 HEIC dependency for distribution review and the missing license text for transitive `guid-typescript@1.0.9` (its metadata declares ISC). These checks were not disabled. Do not interpret a private repository or this local build as publication clearance.

The project defaults to the public npm registry and the lockfile contains public registry URLs, not a machine-specific feed. A clean locked install was verified using cached, integrity-checked packages obtained through an approved mirror. Public npm metadata was inconsistent and some requests, including the advisory audit, failed TLS in this environment. An uncached public-registry installation and current advisory clearance are therefore not claimed. Tagged upstream Vite 6.4.1 and Playwright 1.55.1 manifests were verified rather than relying on mirror latest tags. No TLS checks were disabled or global registry settings changed.

Fresh model downloads and their pinned SHA-256 checks were verified separately. Generated models and runtime binaries are excluded from Git and recreated by setup; small provenance and license notices remain included. Install metadata and advisories are not photo data. Normal processing makes no remote connections.
