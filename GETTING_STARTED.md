# Get the code and run it locally

This guide is for Windows PowerShell. The application runs on your own computer, not inside GitHub or another Git hosting service. A private repository distributes code; it does not host a photo-processing service.

The owner's existing project is at `D:\private_repos\passport-photo-local`. Use that directory to run or update it. The clone examples below use `$HOME\source` for a new installation on another computer; substitute your actual checkout location in later restart/update commands. Do not clone a second copy just to run the existing project.

## 1. Install trusted prerequisites

- Install a currently supported, patched **Node.js LTS** release from [nodejs.org](https://nodejs.org/en/download). This project requires at least Node.js 22.6. Node includes npm.
- For cloning and updates, install **Git for Windows** from [git-scm.com](https://git-scm.com/downloads/win). Its normal installer includes Git Credential Manager.
- Use an up-to-date Microsoft Edge or Chrome browser. Automated browser tests currently use locally installed Edge.

Avoid download aggregators and unofficial installers. Restart PowerShell after installation, then check:

```powershell
node --version
npm.cmd --version
git --version
```

Commands below use `npm.cmd` so PowerShell does not need to execute the npm PowerShell shim. Do not weaken execution policy or TLS certificate validation.

## 2. Get your private copy

The repository owner must grant your Git account access. There is no repository URL embedded in this project because no remote has been chosen or created.

### Recommended: clone

Open the private repository in your browser and copy its HTTPS clone URL. Replace the placeholder below with that URL, without inserting a password or token:

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\source" | Out-Null
Set-Location "$HOME\source"
git clone "PASTE_YOUR_PRIVATE_REPOSITORY_CLONE_URL" passport-photo-local
Set-Location "$HOME\source\passport-photo-local"
```

Complete the normal Git Credential Manager sign-in when prompted. Do not put credentials in source files, clone URLs or project configuration.

### Alternative: download ZIP

While signed in to the private repository, use its **Download ZIP** action. Extract it under your personal profile, outside OneDrive or other synchronized folders if you do not want project files synchronized. Rename the extracted folder to `passport-photo-local` if convenient. Open PowerShell in that extracted folder. ZIP downloads do not support `git pull`; download a new ZIP for updates.

The correct folder contains `package.json`, `src` and `tools`. Do not run setup from the parent folder or the unrelated repository where you discussed this project.

## 3. First-time setup

This step needs internet access for public dependencies and models. It does not involve your photograph.

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run setup:vision
npm.cmd run build
npm.cmd start
```

Run each command only after the previous command succeeds:

1. `ci` installs exactly the locked dependencies. Dependency lifecycle scripts are disabled.
2. `setup:vision` downloads the pinned face detector and portrait-matting models from Google and Hugging Face, verifies SHA-256, and copies the installed browser runtimes into local application assets. A mismatch stops setup. Later runs reuse matching model files.
3. `build` type-checks and creates the local production application.
4. `start` serves those files only at **http://127.0.0.1:4317**.

Keep that PowerShell window open. Open the address in your browser and wait for **Local vision ready**. No account or API key is needed. Models are tens of megabytes and may take time to download or initialize.

Do not open the HTML file directly or use a general-purpose file server. The included server supplies the required privacy headers and restricts served assets and request methods. Use the production commands above for normal photo work, not the development server.

## 4. Prepare a photo

1. Select the application profile: Indian print plus portal, U.S. printed submission, or generic 35 x 45 mm print.
2. Choose a local JPEG, PNG, HEIC or HEIF still photo. The browser reads it into memory; the file is not uploaded. HEIC files are decoded on-device without saving a converted copy.
3. Select the correct detected face or mark the head. Review or manually mark both pupil centers.
4. Check both crops, source resolution, head guides and eye placement. The Indian portal uses a local crown estimate when available. Inspect the head lines and headroom percentages on its preview. Correct the print's head-top/chin guides or mark the head manually if the estimate is wrong, then click **Reframe upload around marked face**. Corrections now affect that action without changing the print crop. Compare with the official example; percentage estimates are not proof of face-area compliance. If your instructions specify an eye-height range, enter that range from the bottom of the physical print.
5. Optional lighting and conservative wall correction require explicit consent. Inspect before/after and understand the editing restrictions.
6. Choose 4 x 6 or 5 x 7 paper, density and outside cutting guides.
7. Confirm the manual checks, prepare files, and deliberately download the outputs you want.

Read [README.md](README.md) for output dimensions, printing, eye guides, background restrictions and limitations. A correctly sized image is not a government acceptance guarantee.

## 5. Stop, restart and update

Press **Ctrl+C** in the server window to stop it. Clearing, reloading or closing the page discards the browser workspace; explicit downloads remain on disk. The app does not restore your photograph after a restart.

For later use, with dependencies, assets and build already present:

```powershell
Set-Location "$HOME\source\passport-photo-local"
npm.cmd start
```

For an update to a cloned checkout, finish your work and stop the server first:

```powershell
git pull --ff-only
npm.cmd ci --ignore-scripts
npm.cmd run setup:vision
npm.cmd run build
npm.cmd start
```

If Git reports local changes or conflicting history, stop and review them; do not force-reset your work. Restart after building because the static server records the available build files at startup. Refreshing an existing browser tab loads the new version and discards its current photo.

After successful setup, normal processing can run without internet. No Windows service or automatic startup task is installed.

## 6. Troubleshooting

| Problem | What to do |
|---|---|
| Command not recognized | Reopen PowerShell after the official installer; check Node/npm/Git versions. |
| PowerShell blocks npm scripts | Use `npm.cmd` as shown, rather than changing execution policy. |
| Missing package or build assets | Confirm the project directory, then run the install and build steps in order. |
| Models missing or vision initialization fails | Stop, run `npm.cmd run setup:vision`, build again, restart, and use a current browser. Do not substitute a hosted inference API. |
| Model checksum mismatch | Stop. Do not bypass it. Verify the pinned publisher asset and source revision before replacing only the affected model file. |
| TLS, proxy or registry errors | Use your organization's approved network, proxy and certificate configuration. Never set `strict-ssl=false` or disable Node TLS validation. Ask your administrator when appropriate. |
| A public package lookup reports a missing version | Registry metadata can be stale or filtered. Check the pinned upstream release and approved registry; do not blindly install an unrelated latest version. |
| Port 4317 already in use | Stop your previous app terminal with Ctrl+C. Do not terminate unidentified processes or expose the service on all network interfaces. |
| Workspace disappears after reload | Expected: photos and edits are not saved automatically. Reopen the original. |
| HEIC cannot decode | Update dependencies and rebuild. Only supported still photographs within the size limits are accepted. If necessary, export a JPEG with a trusted local photo app; do not upload it to an online converter. |
| Export button disabled | Check the displayed resolution, selected face/head, eye markers and optional eye band, then repeat the manual confirmations. |
| Background correction rejected | The original or matte failed conservative checks. There is no override; use the original or retake. A faint pattern is not guaranteed to pass. |
| Print dimensions wrong | Order the exact sheet size at 100%, with auto-crop, fit-to-page, enhancement and borderless expansion disabled; verify with a ruler. |

The development machine had inconsistent public npm metadata and TLS failures. The checked-in lockfile uses public URLs and no private feed credentials. Clean installation was tested from cached packages obtained through an approved mirror; fresh model downloads were separately verified. An uncached public npm install remains unverified here. If your organization requires a registry mirror, use its documented configuration without committing tokens or machine-specific lockfile URLs.

## 7. Optional developer checks

Stop the running app before browser tests; the tests start their own server on port 4317.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run licenses
npm.cmd audit
```

Tests use generated drawings, not real photographs. Never add real portraits as fixtures or attach them to bug reports.

The license inventory deliberately flags the LGPL-3.0 HEIC decoder for distribution review and an unresolved license-text flag for `guid-typescript@1.0.9`, despite its ISC metadata. Public-registry advisory auditing was blocked by TLS in this environment, so there is no current all-clear audit claim. These are release-review items, not reasons to disable checks or automatically run force-upgrade commands.

## 8. Owner only: preparing a private repository

The implementation did not initialize or publish a repository. At the later ignore-rule review, the owner already had a local Git repository with project files staged; that staging was left untouched. Skip initialization/staging steps you have already completed, and review the current index before committing. Follow this section only when ready and after reviewing the license/provenance notes.

Create an **empty private repository** with your preferred Git host, without a generated README or license. Keep access limited to intended collaborators. Git hosting receives code, commit author details and normal connection metadata; it must never receive users' photo data.

From this project folder, initialize and stage an explicit list, not every file indiscriminately:

```powershell
git init
git branch -M main
git add -- .gitignore .npmrc package.json package-lock.json index.html tsconfig.json vite.config.ts playwright.config.ts Start-Local.ps1 src tools tests public third-party-licenses
git add -- README.md GETTING_STARTED.md PRIVACY.md PROJECT_BRIEF.md DECISIONS.md HANDOFF.md AGENTS.md LICENSE THIRD-PARTY-NOTICES.md dependency-inventory.json
git status --short
git diff --cached --stat
git diff --cached
```

Review every staged file. Stop if you see photographs, reports, credentials, personal diagnostics, environment files, downloaded PDFs or unexpected files. The ignore rules cover common photo and camera-raw formats (including uppercase), photo sidecars, recordings, archives, personal work folders, preparation reports, private keys, generated vision binaries, dependencies, builds, coverage, test output and local caches/backups.

Keep source code, the lockfile, portable project configuration, license notices, the dependency inventory and the pinned model-provenance manifest in Git. Only the two named, reviewed upstream HEIC graphic fixtures are exempt from the media rules. Do not exempt an entire fixture or image directory. Future public artwork requires a narrowly named exception and a privacy/license review. Environment examples are allowed only with nonsecret placeholders.

Ignore rules are a safety net, not a security boundary: they cannot detect sensitive data in arbitrary text files, remove already staged/tracked files, or erase Git history. Do not force-add ignored files. After updating the rules, this read-only check should print nothing:

```powershell
git ls-files --cached --ignored --exclude-standard
```

If it lists files, inspect them before committing; changing `.gitignore` alone will not remove them from staging. Restage deliberately edited source/configuration/documentation only after reviewing the working-tree changes.

Only after that review:

```powershell
git commit -m "Initial local passport photo tool" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git remote add origin "PASTE_YOUR_PRIVATE_REPOSITORY_CLONE_URL"
git remote -v
git push -u origin main
```

Check the destination before the push. Never include a token in its URL. Do not enable Pages, app hosting, analytics, cloud inference or artifact uploads containing user data. Git privacy does not waive upstream licensing duties. See [PRIVACY.md](PRIVACY.md) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
