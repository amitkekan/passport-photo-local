# Third-party notices

Original Passport Photo Local code is licensed under Apache-2.0. Dependencies remain under their own licenses.

Run `npm run licenses` after installation or lockfile changes. It generates:

- `dependency-inventory.json`: exact installed package names, versions and declared licenses.
- `public/third-party-notices.json`: package details and preserved upstream root license/notice texts, including bundled notices where shipped by upstream.

The inventory includes build and test tools, not just browser runtime code. The scanner blocks unknown/unreviewed license declarations and missing root license files. It does not replace review of nested bundled code, binary dependencies, patents or the actual release artifact.

esbuild and Rollup platform packages omit a root license file. Their metadata identifies the same repository, MIT license and exact release as their parent tool. The inventory attaches that matching parent release's license texts to each platform package; an unmatched version/repository fails review instead of silently assuming coverage.

## Chosen components

- React and React DOM: MIT.
- Vite and its React plugin: MIT.
- TypeScript: Apache-2.0.
- Playwright: Apache-2.0; the locally installed Microsoft Edge browser is used for testing and is not redistributed with this project.
- tsx: MIT.
- Type packages and transitive development dependencies: consult the generated inventory and notices.

The initial permissive-license review list includes MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD and CC-BY-4.0 (for attributed data, where applicable). A matched declaration is not by itself a legal clearance. Attribution obligations still apply.

Version 0.2.0 adds local BlazeFace face detection and MODNet portrait matting. The MODNet upstream README explicitly licenses its code, models and demos (excluding its GIF directory) under Apache-2.0; the pinned Xenova conversion also declares Apache-2.0. Model provenance and hashes are recorded in `public/vision/model-provenance.json`. Runtime license and third-party notice texts are preserved in `third-party-licenses`.

The owner deferred publication-license work to prioritize local usability. `guid-typescript@1.0.9`, an ONNX Runtime dependency, declares ISC but ships no license text and its upstream repository also lacks one. The license scanner keeps this as an explicit unresolved publication-review flag. Do not silently replace that missing text with an invented notice.

No third-party portrait datasets, government/VFS PDF copies, logos, remote fonts, paid SDKs or stock images are included. The UI uses system fonts. Test images are generated geometric drawings.

Sharp/libvips are not included. Models require separate verification of weight licenses and redistribution rights.

## HEIC decoding, version 0.6.0

`heic-to@1.6.5` declares LGPL-3.0. This release carries libheif 1.23.5, built with libde265 1.0.16 and `USE_UNSAFE_EVAL=0`. The application uses the pinned package's CSP-compatible source through a build alias, rather than its first-image convenience wrapper, so it can explicitly select `is_primary()` and release handles/context. No upstream decoder code is patched.

- [Pinned package source](https://github.com/hoppergee/heic-to/tree/v1.6.5), including its build instructions.
- [libheif 1.23.5 source](https://github.com/strukturag/libheif/tree/v1.23.5).
- [libde265 1.0.16 source](https://github.com/strukturag/libde265/tree/v1.0.16).
- Upstream license texts are retained in `third-party-licenses/libheif-1.23.5.txt` and `third-party-licenses/libde265-1.0.16.txt`, alongside the npm package license in generated notices.

The license scanner continues to flag LGPL-3.0 for review instead of adding it to the project's permissive-license allowlist. Before distributing a source or built release, review the combined work, notices, corresponding-source/relinking obligations and applicable HEVC patent considerations. This is not legal clearance, and private hosting alone does not waive obligations.

Two nonpersonal graphic regression fixtures come from libheif's pinned `tests/data` directory. They are the only HEIC exceptions in the Git ignore rules:

| Fixture | SHA-256 |
|---|---|
| `rainbow-451x461.heic` | `4b2ce727f093944975f143ba2b39c4c64511b766d94552f8d51a755916e7f983` |
| `with-alpha-512x512.heic` | `dac399d3bf1019baaf5f88eef8b277087d0643e735db947c42355237bb9d0221` |

Keep their upstream source reference and COPYING notice; include fixture rights in release review. Do not replace these fixtures with personal photographs. Other tests remain generated drawings and metadata-only containers.

Do not redistribute `node_modules`, a packaged installer, or browser binaries without reviewing that distribution's full obligations. Publishing this source later requires a separate final license/provenance check. No source repository or remote has been created.
