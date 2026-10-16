# Passport Photo Local working agreement

Read HANDOFF.md, PROJECT_BRIEF.md, DECISIONS.md and PRIVACY.md before changing behavior.

- This personal project is local-only. No repository publishing, hosting or remote APIs without explicit authorization.
- Private-repository preparation and novice setup documentation are now requested. No remote destination or actual push was supplied. Do not initialize or publish automatically.
- All photo data stays in browser memory. No upload endpoints, telemetry, server photo processing, browser persistent storage or automatic saving.
- Preserve exact 2 x 2 print sizing, generic 35 x 45 mm sizing to nearest-pixel precision, exact Indian 630 x 810 JPEG below 250,000 bytes, and standard 4 x 6 / 5 x 7 sheet geometry.
- The owner removed 4 x 7 in version 0.4. Keep cutting guides entirely outside all photo rectangles, including stroke width. Do not enlarge individual photos to fill sheet paper.
- Generic 35 x 45 mm prints require manual destination-rule review, not U.S./Indian head-size gates or a passport-compliance claim.
- Never upscale a low-resolution crop and label it high resolution.
- Indian portal suggestions should follow the supplied tight-crop guidance. About 80% head height is an engineering starting point, not proof of 80% face area; require comparison against the official example. Reframing the upload must not change prints or stretch the person.
- Portal crown refinement uses the existing local matte, with explicit uncertainty and no photo edits. Keep detector-based print defaults independent. Reframe must honor corrected source-anchored head guides; pupils center horizontally, not toward an invented vertical eye target. Show headroom measurements honestly.
- HEIC processing stays in a disposable local worker with strict container/dimension checks. Select the declared primary image, not the first item; visible tone-map/auxiliary items can coexist with it. Preserve CSP and offline behavior.
- The HEIC decoder's LGPL and codec review flag remains open. Keep upstream notices and pinned source provenance; never treat the original code's Apache license as covering every dependency.
- Preserve the original. Optional background and lighting edits require warning, independent opt-in, preview and edited-output identification.
- Lighting defaults must be neutral. Render original -> lighting -> optional light-background composite -> independent full-resolution crops. Never export the reduced preview or accumulate adjustments.
- Background correction requires original-pixel eligibility checks, explicit editing consent and light-wall confirmation. Versions 0.6.2-0.6.3 add tolerance for underexposed light walls, moderate shadows, cream and muted pastels. Preserve separate near-black, vivid-color, texture and mask-confidence guards; do not waive model mistakes or add a rejection override/arbitrary-scene replacement. Diagnose the exact rejection instead of repeatedly lowering unrelated limits.
- Eye markers stay in source coordinates. Check both pupils inside active crops and require manual review. A user-supplied print eye band is not an app-verified government rule or a portal rule. Never draw guides into exports.
- Keep dependency URLs portable, model hashes pinned and generated vision binaries out of Git. Never weaken TLS checks to resolve setup failures.
- Keep the owner's blue/slate theme preference and test narrow-screen controls.
- Never call manual checks automated checks or promise passport acceptance.
- Current quality checks are region heuristics, not face-aware models. Keep that limitation visible.
- Face detection and portrait matting are local models loaded from fixed application assets before photo input. Do not confuse their estimates with verified passport compliance.
- Reset controls must restore the currently selected head's crop defaults, remove optional edits on global reset, and invalidate stale exports/review confirmations.
- Verify library, binary and model-weight licenses separately before adding dependencies.
- The owner deferred open-source release review to prioritize local usability. Preserve known notices and document unresolved release flags; do not publish or claim legal clearance.
- Do not place real user photographs, metadata or private reports in fixtures, logs or project notes.
- Maintain the project brief, decisions and handoff when requirements or status change.
- Validate with core tests, type checking/build, license inventory and relevant browser tests.
- Use the existing project's patterns and avoid introducing unnecessary services or frameworks.
