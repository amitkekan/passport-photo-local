# Privacy contract

## Hard boundary

No photograph, uploaded file, original filename, image pixels, face information, crop coordinates, edit, generated output or report is transmitted to or stored by the application server.

The server is a static file server on `127.0.0.1:4317`. It has no upload route, persistence API, database, authentication, cookies, analytics or access logging. It accepts GET/HEAD only for known build assets. It does not read or store request bodies. Production response headers allow connections only to the fixed local `/vision/` asset directory, prohibit form submission, and disable caching with `Cache-Control: no-store`. No external inference connection is permitted.

## Browser behavior

Input is read with browser file APIs into memory. Image decoding, measurements, edits and export encoding run in that browser. No application data is saved in localStorage, sessionStorage, IndexedDB, service workers or browser cookies.

Optional lighting uses local pixel arithmetic, not a remote enhancement API. The reduced preview and full-resolution export pipeline use the same settings. Originals, masks, lighting settings and edited canvases remain in browser memory; settings are included only in a report the user explicitly downloads.

Eye landmarks, manually marked pupils, eye-height ranges and measurements also stay in browser memory. Conservative background checks examine original pixels and a local portrait mask. These measurements are not sent to a classifier service, used to identify anyone, or collected for training.

Displayed brightness, shadow, color, texture and separation diagnostics also remain in browser memory. They are included in a preparation report only when the user explicitly downloads that report.

When faces are detected, the existing local portrait model also estimates the visible crown for portal framing. Its raw mask stays in memory and may be reused for the separate, opt-in background check. Automatic boundary estimation does not enable background replacement or change any original pixels. An uncertain estimate is disclosed, with manual marking available.

HEIC/HEIF decoding happens in a dedicated browser worker. Encoded bytes are transferred locally to the worker, which selects the declared primary image and returns a decoded bitmap. The worker terminates on success, failure or timeout; the bitmap is closed after drawing. No intermediate JPEG is automatically written. Decoder code is bundled into startup assets, not fetched from a conversion service.

## Data flow at a glance

| Data | Where it is used | Persistence or external transfer |
|---|---|---|
| Original photo, filename and decoded pixels | Browser memory | No application upload or automatic storage; original file stays where you selected it |
| Face boxes, eyes, masks, crops, edits and background assessment | Browser memory | No telemetry or persistent application storage |
| Generated JPEGs and preparation report | Browser memory, then deliberate download | Saved only when requested; reports can contain coordinates and quality measurements, so treat them as personal data |
| Models, JavaScript, styles and WASM | Project disk and local static server | Public application assets, not user data |
| Dependency/model installation requests | npm registry and public model publishers | Setup providers can see ordinary connection metadata; no browser photograph is involved |
| Private Git repository | Chosen Git provider | Source, notices and commit metadata only; never photos, outputs, reports or credentials |

The pixel pipeline is local decode/orientation, face and eye estimates, crop review, optional original-based lighting, optional eligible-background compositing, independent crops, and verified JPEG encoding. Guides are preview overlays, not part of exported photographs.

- Selecting another original discards the current workspace and outputs.
- Clear photo discards the active photo, edits and results.
- Closing or reloading the page discards the workspace.
- Explicit download buttons save files through the browser to the location you choose. These downloads are not deleted by Clear photo.
- Download links use temporary blob URLs, revoked after the download window or when their previews are removed.
- The application does not claim secure erasure of physical RAM, OS swap, browser crash dumps, extension data or browser-managed download history.
- Downloads or originals in OneDrive or another synchronized folder may be uploaded by that separate service. The application cannot disable OS synchronization, browser extensions, backups or external photo-lab uploads. Choose local unsynchronized folders if required.

## Network behavior

Only application assets are fetched from the local server. At startup, static model files and WebAssembly runtimes load from the computer's `/vision/` directory, before photo input is enabled. These requests contain no image or filename. Detection, matting, adjustment and encoding then run in the browser. No remote fonts, models, inference APIs, scripts or images are requested. Tests verify processing while offline after initialization and no persistent app storage.

`npm run setup:vision` is an explicit setup operation that downloads public models from their publishers to the local project. It has no access to uploaded browser photographs. Those model files persist as application assets, not user data. Model inference never uses a hosted API.

Official-reference links intentionally open external websites when clicked. They do not include your photo or filename and use no-referrer behavior. Dependency installation is an explicit developer setup operation, not part of photo processing.

The development server uses a local hot-reload connection; use `npm run build` and `npm start` for the hardened normal-use server.

The production policy permits `worker-src blob:` only for locally constructed decoding workers. It does not add general JavaScript `unsafe-eval`, remote worker sources or broader network permissions. Blob workers inherit the page's connection restrictions. No service worker or background photo-processing service is installed.

## Future hosting

Private Git preparation is authorized, but no remote has been created or used. A private code repository is not an application host. Never commit real photographs, downloaded results, reports, secrets or private diagnostics. Review staged files even when ignore rules are present, and avoid submitting browser screenshots containing a person's photo in issues or support requests.

This project is not hosted publicly. Any future deployment must preserve browser-only image processing and disable access logs, analytics, CDN request logging, tracking, storage and diagnostic capture as appropriate. A remote server or infrastructure provider necessarily receives connection metadata such as IP addresses to deliver a web page; "no photo uploads" must not be misrepresented as "no network metadata exists." A deployment and privacy review would be required before any hosting.
