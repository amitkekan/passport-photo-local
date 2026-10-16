import { test, expect, type Page, type Download } from "@playwright/test";
import { readHeader, sheetLayout, SHEET_PRESETS, printDimensions } from "../../src/core";
import { applyTonePixels, GENTLE_LIFT } from "../../src/tone";
import { readFile } from "node:fs/promises";

async function openWorkspace(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Local vision ready. Processing stays on this device.")).toBeVisible({ timeout: 60_000 });
}

async function markHead(page: Page, top = 0.14, chin = 0.62) {
  await page.getByRole("button", { name: "Mark head manually", exact: true }).click();
  const image = page.getByRole("img", { name: "Full original for face selection and head marking", exact: true });
  const bounds = await image.boundingBox();
  if (!bounds) throw new Error("Full-photo preview missing.");
  await image.click({ position: { x: bounds.width / 2, y: bounds.height * top } });
  await image.click({ position: { x: bounds.width / 2, y: bounds.height * chin } });
}

async function fixture(page: Page, width = 1800, height = 2200, mime = "image/png", background = "#e8e8e8", shirt = "#1d5446", highlightPatches = false) {
  const base64 = await page.evaluate(({ width, height, mime, background, shirt, highlightPatches }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = shirt; ctx.fillRect(width * 0.18, height * 0.60, width * 0.64, height * 0.40);
    ctx.fillStyle = "#b98257"; ctx.beginPath(); ctx.ellipse(width / 2, height * 0.38, width * 0.22, height * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#342b24"; ctx.fillRect(width * 0.32, height * 0.14, width * 0.36, height * 0.08);
    for (const x of [0.41, 0.59]) { ctx.beginPath(); ctx.arc(width * x, height * 0.36, width * 0.016, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillRect(width * 0.43, height * 0.50, width * 0.14, height * 0.009);
    if (highlightPatches) {
      ctx.fillStyle = "#c8c8c8"; ctx.fillRect(width * 0.44, height * 0.40, width * 0.10, height * 0.09);
      ctx.fillStyle = "#f0f0f0"; ctx.fillRect(width * 0.54, height * 0.40, width * 0.10, height * 0.09);
    }
    return canvas.toDataURL(mime).split(",")[1];
  }, { width, height, mime, background, shirt, highlightPatches });
  return { name: mime === "image/png" ? "synthetic-test-only.png" : "synthetic-test-only.jpg", mimeType: mime, buffer: Buffer.from(base64, "base64") };
}

async function manualReview(page: Page) {
  await expect(page.locator(".review-list input[type=checkbox]").first()).toBeVisible();
  await markEyes(page);
  for (const checkbox of await page.locator(".review-list input[type=checkbox]").all()) await checkbox.check();
}

async function markEyes(page: Page, y = 0.36) {
  await page.getByRole("button", { name: "Mark both eyes", exact: true }).click();
  const image = page.getByRole("img", { name: "Full original for face selection and head marking", exact: true });
  const bounds = await image.boundingBox();
  if (!bounds) throw new Error("Original preview missing.");
  for (const x of [0.41, 0.59]) await image.click({ position: { x: bounds.width * x, y: bounds.height * y } });
}

async function bytes(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Download stream missing.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function sampleJpeg(page: Page, data: Buffer, x = 0.5, y = 0.5) {
  return page.evaluate(async ({ encoded, x, y }) => {
    const image = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), value => value.charCodeAt(0))], { type: "image/jpeg" }));
    const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, Math.floor(image.width * x), Math.floor(image.height * y), 1, 1, 0, 0, 1, 1);
    image.close();
    return Array.from(ctx.getImageData(0, 0, 1, 1).data);
  }, { encoded: data.toString("base64"), x, y });
}

test("HEIC graphic decodes offline with empty MIME, uppercase extension and unchanged privacy boundaries", async ({ page, context }) => {
  await openWorkspace(page);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await context.setOffline(true);
  const buffer = await readFile(new URL("../fixtures/rainbow-451x461.heic", import.meta.url));
  await page.locator("#photo-upload").setInputFiles({ name: "synthetic-graphic.HEIC", mimeType: "", buffer });
  await expect(page.getByText(/HEIC decoded locally/)).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole("img", { name: "Full original for face selection and head marking", exact: true })).toBeVisible();
  await expect(page.getByText(/451 x 461 source pixels/)).toBeVisible();
  await page.getByRole("button", { name: "Clear photo and results", exact: true }).click();
  await expect(page.getByText(/HEIC decoded locally/)).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("HEIC transparency and malformed containers are rejected with explicit errors", async ({ page, context }) => {
  await openWorkspace(page);
  await context.setOffline(true);
  const buffer = await readFile(new URL("../fixtures/with-alpha-512x512.heic", import.meta.url));
  await page.locator("#photo-upload").setInputFiles({ name: "synthetic-alpha.heif", mimeType: "image/heif", buffer });
  await expect(page.getByRole("alert")).toContainText("Transparent", { timeout: 90000 });
  await page.locator("#photo-upload").setInputFiles({ name: "damaged.heic", mimeType: "image/heic", buffer: buffer.subarray(0, 60) });
  await expect(page.getByRole("alert")).toContainText("HEIC");
  await expect(page.locator(".output-card")).toHaveCount(0);
});

test("reframing the portal uses current eye marks and leaves print position and density untouched", async ({ page }) => {
  await openWorkspace(page);
  await page.locator("#photo-upload").setInputFiles(await fixture(page));
  await markHead(page);
  await manualReview(page);
  const printSliders = page.locator(".crop-card").first().getByRole("slider");
  const before = await printSliders.evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value));
  const ppi = await page.locator("#ppi").inputValue();
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.locator(".output-card")).toHaveCount(3);
  const vertical = page.getByRole("slider", { name: "630 x 810 portal vertical position", exact: true });
  await vertical.fill("90");
  await page.getByRole("button", { name: "Reframe upload around marked face", exact: true }).click();
  await expect(vertical).not.toHaveValue("90");
  expect(await printSliders.evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value))).toEqual(before);
  await expect(page.locator("#ppi")).toHaveValue(ppi);
  await expect(page.locator(".output-card")).toHaveCount(0);
  await expect(page.locator(".review-list input:checked")).toHaveCount(0);
});

test("portal reframe uses corrected head guides and rejects inverted guides without moving either crop", async ({ page, context }) => {
  await openWorkspace(page);
  const requests: string[] = [];
  page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await context.setOffline(true);
  await page.locator("#photo-upload").setInputFiles(await fixture(page));
  await markHead(page);
  await markEyes(page);
  const zoom = page.getByRole("slider", { name: "630 x 810 portal zoom", exact: true });
  const initialZoom = Number(await zoom.inputValue());
  const top = page.getByRole("slider", { name: "Head top guide (%)", exact: true });
  await top.fill("22");
  const printSliders = page.locator(".crop-card").first().getByRole("slider");
  const before = await printSliders.evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value));
  await page.getByRole("button", { name: "Reframe upload around marked face", exact: true }).click();
  expect(Number(await zoom.inputValue())).toBeGreaterThan(initialZoom);
  await expect(page.getByTestId("portal-head-measurement")).toContainText("80.0% of crop height");
  await expect(page.getByTestId("portal-head-measurement")).toContainText("Top space: 5.0%");
  expect(await printSliders.evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value))).toEqual(before);
  const reframedZoom = await zoom.inputValue();
  await top.fill("90");
  await page.getByRole("button", { name: "Reframe upload around marked face", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("head-top guide above the chin");
  await expect(zoom).toHaveValue(reframedZoom);
  await page.getByRole("button", { name: "Reset 630 x 810 portal crop", exact: true }).click();
  expect(Number(await zoom.inputValue())).toBeCloseTo(initialZoom, 5);
  expect(requests).toEqual([]);
});

test("standard sheets print both photo formats at both densities with visible guides only in waste paper", async ({ page, context }) => {
  test.setTimeout(120_000);
  await openWorkspace(page);
  const requests: string[] = [];
  page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await context.setOffline(true);
  await page.locator("#photo-upload").setInputFiles(await fixture(page));
  await markHead(page);
  await expect(page.locator("#sheet-layout option")).toHaveCount(2);
  const guideToggle = page.getByRole("checkbox", { name: "Include cutting guides outside the photos", exact: true });
  await expect(guideToggle).toBeChecked();
  let lastIndividual: Buffer | undefined;
  for (const format of ["2x2", "35x45"] as const) {
    await page.locator("#country").selectOption(format === "2x2" ? "india" : "generic35x45");
    for (const ppi of [300, 600] as const) for (const preset of ["4x6", "5x7"] as const) {
      await page.locator("#ppi").selectOption(String(ppi));
      await page.locator("#sheet-layout").selectOption(preset);
      await expect(page.locator(".output-card")).toHaveCount(0);
      await manualReview(page);
      await page.getByRole("button", { name: /Prepare verified-size/ }).click();
      await expect(page.locator(".output-card")).toHaveCount(format === "2x2" ? 3 : 2);
      const layout = sheetLayout(ppi, preset, format), spec = SHEET_PRESETS[preset];
      const pixels = printDimensions(format, ppi);
      const photoPending = page.waitForEvent("download");
      await page.getByRole("button", { name: format === "2x2" ? "Download 2 x 2 photo" : "Download 35 x 45 mm photo", exact: true }).click();
      const photo = await photoPending;
      lastIndividual = await bytes(photo);
      expect(readHeader(lastIndividual)).toEqual({ format: "jpeg", ...pixels });
      expect(lastIndividual[13]).toBe(1);
      expect(lastIndividual.readUInt16BE(14)).toBe(ppi);
      expect(lastIndividual.readUInt16BE(16)).toBe(ppi);
      expect(photo.suggestedFilename()).toContain(format === "2x2" ? "2x2-inch" : "35x45-mm");
      const sheetPending = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download sheet", exact: true }).click();
      const download = await sheetPending, data = await bytes(download);
      expect(download.suggestedFilename()).toContain(`sheet-${spec.width}x${spec.height}-inch-${layout.photos.length}-photos`);
      expect(download.suggestedFilename()).toContain("-cut-guides");
      expect(readHeader(data)).toEqual({ format: "jpeg", width: layout.width, height: layout.height });
      expect(data[13]).toBe(1);
      expect(data.readUInt16BE(14)).toBe(ppi);
      expect(data.readUInt16BE(16)).toBe(ppi);
      const samples = await page.evaluate(async ({ encoded, layout, ppi }) => {
        const image = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: "image/jpeg" }));
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0); image.close();
        const sample = (x: number, y: number) => Array.from(ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data);
        return {
          faces: layout.photos.map(p => sample(p.x + p.width / 2, p.y + p.height / 2)),
          gaps: layout.photos.map(p => sample(p.x + p.width / 2, p.y - ppi * 0.125)),
          guides: layout.guides.map(g => {
            const values = ctx.getImageData(Math.floor((g.x1 + g.x2) / 2) - 1, Math.floor((g.y1 + g.y2) / 2) - 1, 3, 3).data;
            let darkest = 255;
            for (let i = 0; i < values.length; i += 4) darkest = Math.min(darkest, (values[i] + values[i + 1] + values[i + 2]) / 3);
            return darkest;
          }),
        };
      }, { encoded: data.toString("base64"), layout, ppi });
      for (const face of samples.faces) {
        for (const [channel, value] of [185, 130, 87].entries()) expect(Math.abs(face[channel] - value)).toBeLessThanOrEqual(3);
      }
      for (const gap of samples.gaps) expect(gap.slice(0, 3).every(value => value >= 250)).toBe(true);
      for (const guide of samples.guides) expect(guide).toBeLessThan(140);
      const pendingReport = page.waitForEvent("download");
      await page.getByRole("button", { name: /Download checks & printing instructions/ }).click();
      const report = JSON.parse((await bytes(await pendingReport)).toString("utf8"));
      expect(report.sheet).toMatchObject({ widthInches: spec.width, heightInches: spec.height, photoCount: layout.photos.length, cuttingGuides: true, gapInches: 0.25 });
      expect(report.printFormat.name).toBe(format);
      expect(report.printInstructions).toContain(`Select ${spec.width} x ${spec.height} inches`);
      expect(report.outputFiles.find((f: { name: string }) => f.name.startsWith("sheet")).printSize).toBe(`${spec.width} x ${spec.height} inches at ${ppi} PPI`);
      expect(Math.abs(report.measurements.printCrop.width / report.measurements.printCrop.height - pixels.width / pixels.height)).toBeLessThan(1e-9);
      if (format === "35x45") {
        expect(report.sources).toEqual([]);
        expect(report.application).toContain("country-specific requirements not verified");
        expect(Math.abs(report.printFormat.rasterWidthMm - 35)).toBeLessThan(0.043);
        expect(Math.abs(report.printFormat.rasterHeightMm - 45)).toBeLessThan(0.043);
      }
    }
  }
  await guideToggle.uncheck();
  await expect(page.locator(".output-card")).toHaveCount(0);
  await expect(page.locator(".review-list input:checked")).toHaveCount(0);
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  const cleanPhotoPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 35 x 45 mm photo", exact: true }).click();
  expect(await bytes(await cleanPhotoPending)).toEqual(lastIndividual);
  const cleanSheetPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download sheet", exact: true }).click();
  const cleanSheet = await cleanSheetPending;
  expect(cleanSheet.suggestedFilename()).not.toContain("-cut-guides");
  const layout = sheetLayout(600, "5x7", "35x45"), g = layout.guides[0];
  const pixel = await sampleJpeg(page, await bytes(cleanSheet), (g.x1 + g.x2) / 2 / layout.width, (g.y1 + g.y2) / 2 / layout.height);
  expect(pixel.slice(0, 3).every(value => value >= 250)).toBe(true);
  expect(requests).toEqual([]);
});

test("generic metric profile requires destination review, resets on profile changes and never upscales", async ({ page }) => {
  await openWorkspace(page);
  await page.locator("#country").selectOption("generic35x45");
  await page.locator("#photo-upload").setInputFiles(await fixture(page));
  await markHead(page);
  await expect(page.getByRole("heading", { name: "35 x 45 mm print", exact: true })).toBeVisible();
  await expect(page.getByText("No country-specific head-height limit is applied.", { exact: false })).toBeVisible();
  await expect(page.locator(".source-links")).toHaveCount(0);
  await page.getByRole("slider", { name: "Head top guide (%)", exact: true }).fill("10");
  await page.getByRole("slider", { name: "Chin guide (%)", exact: true }).fill("90");
  await manualReview(page);
  const countryRules = page.getByRole("checkbox", { name: /I checked my destination's official/ });
  await countryRules.uncheck();
  await expect(page.getByRole("button", { name: /Prepare verified-size/ })).toBeDisabled();
  await countryRules.check();
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.locator(".output-card")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Download portal JPEG", exact: true })).toHaveCount(0);
  await page.locator("#country").selectOption("india");
  await expect(page.locator(".output-card")).toHaveCount(0);
  await expect(page.locator(".review-list input:checked")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "2 x 2 print", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "630 x 810 portal", exact: true })).toBeVisible();
  await page.locator("#country").selectOption("generic35x45");
  await page.locator("#photo-upload").setInputFiles(await fixture(page, 500, 700));
  await expect(page.locator(".face-selector")).toBeVisible();
  await page.locator("#ppi").selectOption("600");
  await manualReview(page);
  await expect(page.getByRole("button", { name: /Prepare verified-size/ })).toBeDisabled();
  await page.locator("#ppi").selectOption("300");
  await page.getByRole("button", { name: "Reset 35 x 45 mm print crop", exact: true }).click();
  await page.getByRole("slider", { name: "35 x 45 mm print zoom", exact: true }).fill("1");
  await manualReview(page);
  await expect(page.getByRole("button", { name: /Prepare verified-size/ })).toBeEnabled();
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.locator(".output-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Reset all adjustments", exact: true }).click();
  await expect(countryRules).not.toBeChecked();
  await expect(page.locator("#country")).toHaveValue("generic35x45");
  await expect(page.locator("#sheet-layout")).toHaveValue("5x7");
});

test("minor portal shortfalls get native-resolution defaults and warnings distinguish portal from print PPI", async ({ page }) => {
  await openWorkspace(page);
  await page.locator("#photo-upload").setInputFiles(await fixture(page));
  await markHead(page, 0.14, 0.42);
  await expect(page.locator("#ppi")).toHaveValue("300");
  await expect(page.getByText("Insufficient crop resolution.", { exact: true })).toHaveCount(0);
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.locator(".output-card")).toHaveCount(3);
  await page.getByRole("slider", { name: "630 x 810 portal zoom", exact: true }).fill("3");
  await expect(page.locator(".output-card")).toHaveCount(0);
  await expect(page.getByText("Changing print PPI cannot fix the portal crop.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 300 PPI for prints", exact: true })).toHaveCount(0);
  await page.locator("#ppi").selectOption("600");
  await expect(page.getByText("Print crop:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Use 300 PPI for prints", exact: true }).click();
  await expect(page.locator("#ppi")).toHaveValue("300");
  await expect(page.getByText("Print crop:", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Changing print PPI cannot fix the portal crop.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Reset 630 x 810 portal crop", exact: true }).click();
  await expect(page.getByText("Insufficient crop resolution.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".review-list input:checked")).toHaveCount(0);
  await manualReview(page);
  await expect(page.getByRole("button", { name: /Prepare verified-size/ })).toBeEnabled();
});

test("optional lighting changes preview and every exact-size export offline, with a truthful report", async ({ page, context }) => {
  await openWorkspace(page);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await context.setOffline(true);
  await page.locator("#photo-upload").setInputFiles(await fixture(page));
  await markHead(page);
  const consent = page.getByRole("checkbox", { name: /I understand lighting changes/ });
  const preset = page.getByRole("button", { name: "Brighten gently", exact: true });
  await expect(consent).not.toBeChecked();
  await expect(preset).toBeDisabled();
  await consent.check();
  const original = await page.getByAltText("Original lighting preview", { exact: true }).getAttribute("src");
  await expect(page.getByAltText("Adjusted lighting preview", { exact: true })).toHaveAttribute("src", original!);
  await preset.click();
  await expect(page.getByRole("slider", { name: "Exposure (EV)", exact: true })).toHaveValue("0.4");
  await expect(page.getByRole("slider", { name: "Shadow lift", exact: true })).toHaveValue("12");
  await expect(page.getByAltText("Adjusted lighting preview", { exact: true })).not.toHaveAttribute("src", original!);
  await expect(page.getByAltText("Original lighting preview", { exact: true })).toHaveAttribute("src", original!);
  const expected = Array.from(applyTonePixels(new Uint8ClampedArray([185, 130, 87, 255]), GENTLE_LIFT));
  const previewPixel = await page.locator(".crop-canvas canvas").first().evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext("2d")!.getImageData(Math.floor(canvas.width * 0.55), Math.floor(canvas.height / 2), 1, 1).data));
  for (let channel = 0; channel < 3; channel++) expect(Math.abs(previewPixel[channel] - expected[channel])).toBeLessThanOrEqual(2);
  expect(previewPixel[0]).toBeGreaterThan(200);
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.locator(".output-card")).toHaveCount(3);
  for (const [label, width, height, x, y] of [
    ["Download 2 x 2 photo", 1200, 1200, 0.5, 0.5],
    ["Download portal JPEG", 630, 810, 0.5, 0.5],
    ["Download sheet", 3000, 4200, 1.375 / 5, 1.25 / 7],
  ] as const) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const download = await pending, data = await bytes(download);
    expect(download.suggestedFilename()).toContain("-lighting-edited.jpg");
    expect(readHeader(data)).toEqual({ format: "jpeg", width, height });
    if (label === "Download portal JPEG") expect(data.length).toBeLessThan(250_000);
    else { expect(data[13]).toBe(1); expect(data.readUInt16BE(14)).toBe(600); expect(data.readUInt16BE(16)).toBe(600); }
    const pixel = await sampleJpeg(page, data, x, y);
    for (let channel = 0; channel < 3; channel++) expect(Math.abs(pixel[channel] - expected[channel])).toBeLessThanOrEqual(3);
  }
  const reportPending = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download checks & printing instructions/ }).click();
  const report = JSON.parse((await bytes(await reportPending)).toString("utf8"));
  expect(report.lightingEdited).toBe(true);
  expect(report.backgroundEdited).toBe(false);
  expect(report.lightingSettings).toEqual(GENTLE_LIFT);
  expect(report.editingPolicy).toContain("NOT established");
  await page.getByRole("slider", { name: "Exposure (EV)", exact: true }).fill("0.6");
  await expect(page.locator(".output-card")).toHaveCount(0);
  await expect(page.locator(".review-list input:checked")).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length, cookies: document.cookie,
    databases: (await indexedDB.databases()).length,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }))).toEqual({ local: 0, session: 0, cookies: "", databases: 0, workers: 0 });
});

test("highlight reduction remains visible with raised exposure and matches all exports without changing the original", async ({ page, context }) => {
  await openWorkspace(page);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await context.setOffline(true);
  await page.locator("#photo-upload").setInputFiles(await fixture(page, 1800, 2200, "image/png", "#e8e8e8", "#c8c8c8", true));
  await markHead(page);
  await page.getByRole("checkbox", { name: /I understand lighting changes/ }).check();
  const original = await page.getByAltText("Original lighting preview", { exact: true }).getAttribute("src");
  const preview = page.getByAltText("Adjusted lighting preview", { exact: true });
  const samples = () => preview.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return [0.50, 0.60].map(x => ctx.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * 0.43), 1, 1).data[0]);
  });
  await page.getByRole("slider", { name: "Exposure (EV)", exact: true }).fill("1.5");
  await page.getByRole("slider", { name: "Contrast", exact: true }).fill("20");
  await expect.poll(samples).toEqual([255, 255]);
  const highlights = page.getByRole("slider", { name: "Highlight reduction", exact: true });
  await highlights.fill("25");
  await expect.poll(async () => (await samples()).every(value => value <= 249)).toBe(true);
  const middle = await samples();
  await highlights.fill("50");
  await expect.poll(async () => (await samples())[0]).toBeLessThanOrEqual(235);
  const full = await samples();
  expect(full[0]).toBeLessThan(full[1]);
  expect(full.every((value, i) => value < middle[i])).toBe(true);
  await expect(page.getByAltText("Original lighting preview", { exact: true })).toHaveAttribute("src", original!);
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.locator(".output-card")).toHaveCount(3);
  for (const [label, width, height, x, y] of [
    ["Download 2 x 2 photo", 1200, 1200, 0.5, 0.5],
    ["Download portal JPEG", 630, 810, 0.5, 0.5],
    ["Download sheet", 3000, 4200, 1.375 / 5, 1.25 / 7],
  ] as const) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const download = await pending, data = await bytes(download);
    expect(download.suggestedFilename()).toContain("-lighting-edited.jpg");
    expect(readHeader(data)).toEqual({ format: "jpeg", width, height });
    if (label === "Download portal JPEG") expect(data.length).toBeLessThan(250_000);
    const pixel = await sampleJpeg(page, data, x, y);
    for (const channel of pixel.slice(0, 3)) expect(Math.abs(channel - full[0])).toBeLessThanOrEqual(3);
  }
  const reportPending = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download checks & printing instructions/ }).click();
  const report = JSON.parse((await bytes(await reportPending)).toString("utf8"));
  expect(report.lightingSettings).toEqual({ exposure: 1.5, shadows: 0, highlights: 50, contrast: 20 });
  await page.getByRole("button", { name: "Reset Highlight reduction", exact: true }).click();
  await expect(highlights).toHaveValue("0");
  await expect.poll(samples).toEqual([255, 255]);
  await expect(page.locator(".output-card")).toHaveCount(0);
  await expect(page.locator(".review-list input:checked")).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("lighting resets are neutral and disabling, replacing or clearing a photo removes lighting state", async ({ page }) => {
  await openWorkspace(page);
  const input = await fixture(page);
  await page.locator("#photo-upload").setInputFiles(input);
  const consent = page.getByRole("checkbox", { name: /I understand lighting changes/ });
  const preset = page.getByRole("button", { name: "Brighten gently", exact: true });
  await consent.check();
  const original = await page.getByAltText("Original lighting preview", { exact: true }).getAttribute("src");
  for (const [name, value] of [["Exposure (EV)", "0.8"], ["Shadow lift", "25"], ["Highlight reduction", "30"], ["Contrast", "-10"]]) {
    await page.getByRole("slider", { name, exact: true }).fill(value);
    await page.getByRole("button", { name: `Reset ${name}`, exact: true }).click();
    await expect(page.getByRole("slider", { name, exact: true })).toHaveValue("0");
  }
  await preset.click();
  await page.getByRole("button", { name: "Reset lighting", exact: true }).click();
  await expect(page.getByAltText("Adjusted lighting preview", { exact: true })).toHaveAttribute("src", original!);
  await preset.click();
  await consent.uncheck();
  await expect(preset).toBeDisabled();
  await expect(page.getByRole("slider", { name: "Exposure (EV)", exact: true })).toHaveValue("0");
  await consent.check();
  await preset.click();
  await page.getByRole("button", { name: "Reset all adjustments", exact: true }).click();
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole("slider", { name: "Shadow lift", exact: true })).toHaveValue("0");
  await consent.check();
  await preset.click();
  await page.locator("#photo-upload").setInputFiles(input);
  await expect(consent).not.toBeChecked();
  await expect(page.getByRole("slider", { name: "Exposure (EV)", exact: true })).toHaveValue("0");
  await consent.check();
  await preset.click();
  await page.getByRole("button", { name: "Clear photo and results", exact: true }).click();
  await expect(consent).toHaveCount(0);
  await page.locator("#photo-upload").setInputFiles(input);
  await expect(consent).not.toBeChecked();
});

test("all three downloads have exact dimensions, density, portal bytes, and no processing network/storage", async ({ page, context }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", error => consoleErrors.push(error.message));
  await openWorkspace(page);
  const requests: string[] = [];
  page.on("request", request => {
    if (/^https?:/.test(request.url())) requests.push(`${request.method()} ${request.url()}`);
  });
  const input = await fixture(page);
  await context.setOffline(true);
  await page.locator("#photo-upload").setInputFiles(input);
  await expect(page.getByText("1800 x 2200 source pixels.", { exact: false })).toBeVisible();
  await markHead(page);
  await expect(page.getByRole("button", { name: /Prepare verified-size/ })).toBeDisabled();
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.getByRole("region", { name: "Prepared downloads" })).toBeVisible();
  for (const [label, width, height, portal] of [
    ["Download 2 x 2 photo", 1200, 1200, false],
    ["Download portal JPEG", 630, 810, true],
    ["Download sheet", 3000, 4200, false],
  ] as const) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const download = await pending;
    const data = await bytes(download);
    expect(readHeader(data)).toEqual({ format: "jpeg", width, height });
    expect(download.suggestedFilename()).toContain("original-based");
    if (portal) expect(data.length).toBeLessThan(250_000);
    else {
      expect(data[13]).toBe(1);
      expect(data.readUInt16BE(14)).toBe(600);
      expect(data.readUInt16BE(16)).toBe(600);
    }
    if (label === "Download sheet") {
      const samples = await page.evaluate(async encoded => {
        const image = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), value => value.charCodeAt(0))], { type: "image/jpeg" }));
        const canvas = document.createElement("canvas");
        canvas.width = 500; canvas.height = 700;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0, 500, 700); image.close();
        return [20, 125, 350, 575, 680].flatMap(y => [138, 363].map(x => Array.from(ctx.getImageData(x, y, 1, 1).data)));
      }, data.toString("base64"));
      expect(samples[0].slice(0, 3).every(value => value > 250)).toBe(true);
      expect(samples[8].slice(0, 3).every(value => value > 250)).toBe(true);
      for (const sample of samples.slice(2, 8)) {
        expect(sample[0]).toBeGreaterThan(sample[2]);
        expect(sample[0]).toBeLessThan(240);
      }
    }
  }
  expect(await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length, cookies: document.cookie,
    databases: (await indexedDB.databases()).length,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }))).toEqual({ local: 0, session: 0, cookies: "", databases: 0, workers: 0 });
  expect(requests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await page.getByRole("button", { name: "Clear photo and results" }).click();
  await expect(page.getByRole("region", { name: "Prepared downloads" })).toHaveCount(0);
  await expect(page.getByText("A better original makes a better print.")).toBeVisible();
});

test("US mode exports only prints and changing a crop invalidates files and confirmations", async ({ page }) => {
  await openWorkspace(page);
  await page.locator("#country").selectOption("usa");
  await page.locator("#photo-upload").setInputFiles(await fixture(page, 1300, 1700, "image/jpeg"));
  await expect(page.locator(".face-selector")).toBeVisible();
  await markHead(page);
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.locator(".output-card")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Download portal JPEG" })).toHaveCount(0);
  await page.getByRole("slider", { name: "2 x 2 print zoom", exact: true }).fill("2");
  await expect(page.locator(".output-card")).toHaveCount(0);
  await expect(page.getByText("Insufficient crop resolution.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /Prepare verified-size/ })).toBeDisabled();
  await page.locator("#ppi").selectOption("300");
  await page.getByRole("button", { name: "Reset 2 x 2 print crop", exact: true }).click();
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.locator(".output-card")).toHaveCount(2);
});

test("invalid content is rejected without preserving the old photo", async ({ page }) => {
  await openWorkspace(page);
  await page.locator("#photo-upload").setInputFiles(await fixture(page));
  await page.locator("#photo-upload").setInputFiles({ name: "not-a-photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<svg>not a photograph</svg>") });
  await expect(page.getByRole("alert")).toContainText("JPEG, PNG");
  await expect(page.getByText("A better original makes a better print.")).toBeVisible();
});

test("background edit requires consent, labels exported files, and does not upload data", async ({ page, context }) => {
  await openWorkspace(page);
  await context.setOffline(true);
  await page.locator("#photo-upload").setInputFiles(await fixture(page, 1800, 2200, "image/png", "#e8e8e8", "#c8c8c8"));
  await page.getByText("Advanced: conservative light-background correction", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Check and preview background" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /I understand the editing restriction/ }).check();
  await expect(page.getByRole("button", { name: "Check and preview background" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /My original background is a light/ }).check();
  await page.getByRole("button", { name: "Check and preview background" }).click();
  await expect(page.getByText("Background-edited source is selected.", { exact: false })).toBeVisible();
  await expect(page.getByRole("img", { name: "Photograph with optional background edit" })).toBeVisible();
  await page.getByRole("slider", { name: "Background cleanup", exact: true }).fill("12");
  await page.getByRole("slider", { name: "Soft edge preservation", exact: true }).fill("40");
  await page.locator("#background-color").selectOption("neutral");
  await page.getByRole("button", { name: "Reset background settings", exact: true }).click();
  await expect(page.locator("#background-color")).toHaveValue("white");
  await expect(page.getByRole("slider", { name: "Background cleanup", exact: true })).toHaveValue("3");
  await expect(page.getByRole("slider", { name: "Soft edge preservation", exact: true })).toHaveValue("100");
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.locator(".output-card")).toHaveCount(3);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download portal JPEG", exact: true }).click();
  expect((await pending).suggestedFilename()).toContain("background-edited");
  await page.getByRole("checkbox", { name: /I understand lighting changes/ }).check();
  await page.getByRole("slider", { name: "Exposure (EV)", exact: true }).fill("-0.5");
  await page.getByRole("slider", { name: "Highlight reduction", exact: true }).fill("30");
  await expect(page.locator(".output-card")).toHaveCount(0);
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  const combinedPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download portal JPEG", exact: true }).click();
  const combined = await combinedPending;
  expect(combined.suggestedFilename()).toContain("-lighting-and-background-edited.jpg");
  const combinedPixel = await sampleJpeg(page, await bytes(combined), 0.01, 0.01);
  expect(combinedPixel.slice(0, 3).every(value => value >= 253)).toBe(true);
  await page.locator("#background-color").selectOption("warm");
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  const warmPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download portal JPEG", exact: true }).click();
  const warmPixel = await sampleJpeg(page, await bytes(await warmPending), 0.01, 0.01);
  for (const [channel, value] of [250, 248, 244].entries()) expect(Math.abs(warmPixel[channel] - value)).toBeLessThanOrEqual(3);
  const reportPending = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download checks & printing instructions/ }).click();
  const report = JSON.parse((await bytes(await reportPending)).toString("utf8"));
  expect(report.backgroundCorrection.color.css).toBe("#faf8f4");
  expect(report.backgroundCorrection.assessment.eligible).toBe(true);
  expect(report.eyePlacement.portalMeasurement.averagePixels).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Use original background" }).click();
  await expect(page.locator(".output-card")).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Exposure (EV)", exact: true })).toHaveValue("-0.5");
});

test("eye markers gate exports, support a user range, and reset on profile changes", async ({ page }) => {
  await openWorkspace(page);
  await page.locator("#photo-upload").setInputFiles(await fixture(page));
  await markHead(page);
  const prepare = page.getByRole("button", { name: /Prepare verified-size/ });
  for (const checkbox of await page.locator(".review-list input[type=checkbox]").all()) await checkbox.check();
  await expect(prepare).toBeDisabled();
  await manualReview(page);
  await expect(page.locator(".eye-mark")).toHaveCount(2);
  await expect(prepare).toBeEnabled();
  await prepare.click();
  const firstPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 2 x 2 photo", exact: true }).click();
  const originalBytes = await bytes(await firstPending);
  await markEyes(page, 0.37);
  for (const checkbox of await page.locator(".review-list input[type=checkbox]").all()) await checkbox.check();
  await prepare.click();
  const secondPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 2 x 2 photo", exact: true }).click();
  expect(await bytes(await secondPending)).toEqual(originalBytes);
  const target = page.getByRole("checkbox", { name: /Use an eye-height range/ });
  await target.check();
  await expect(prepare).toBeDisabled();
  await page.getByLabel("Minimum eye height from bottom (mm)").fill("49");
  await page.getByLabel("Maximum eye height from bottom (mm)").fill("50");
  await manualReview(page);
  await expect(prepare).toBeDisabled();
  await expect(page.getByText(/eye markers are outside your supplied range/)).toBeVisible();
  await page.getByLabel("Minimum eye height from bottom (mm)").fill("0");
  await page.getByLabel("Maximum eye height from bottom (mm)").fill("50.8");
  await manualReview(page);
  await expect(prepare).toBeEnabled();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("#country").selectOption("generic35x45");
  await expect(target).not.toBeChecked();
  await expect(page.locator(".eye-mark")).toHaveCount(2);
  await page.getByRole("button", { name: "Reset eye markers", exact: true }).click();
  await expect(page.locator(".eye-mark")).toHaveCount(0);
  await expect(prepare).toBeDisabled();
});

test("unsuitable backgrounds have no correction override and do not prevent original-based preparation", async ({ page, context }) => {
  await openWorkspace(page);
  await context.setOffline(true);
  await page.locator("#photo-upload").setInputFiles(await fixture(page, 1800, 2200, "image/png", "#82bd68"));
  await markHead(page);
  await page.getByText("Advanced: conservative light-background correction", { exact: true }).click();
  await page.getByRole("checkbox", { name: /I understand the editing restriction/ }).check();
  await page.getByRole("checkbox", { name: /My original background is a light/ }).check();
  await page.getByRole("button", { name: "Check and preview background" }).click();
  await expect(page.getByText(/Correction is unavailable; no override is offered/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Use original background" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Photograph with optional background edit" })).toHaveCount(0);
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  await expect(page.locator(".output-card")).toHaveCount(3);
});

test("light gray wall correction succeeds offline with transparent measurements and unchanged consent gates", async ({ page, context }) => {
  await openWorkspace(page);
  const requests: string[] = [];
  page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await context.setOffline(true);
  await page.locator("#photo-upload").setInputFiles(await fixture(page, 1800, 2200, "image/png", "#969696", "#aaaaaa"));
  await page.getByText("Advanced: conservative light-background correction", { exact: true }).click();
  const preview = page.getByRole("button", { name: "Check and preview background" });
  await expect(preview).toBeDisabled();
  await page.getByRole("checkbox", { name: /I understand the editing restriction/ }).check();
  await expect(preview).toBeDisabled();
  await page.getByRole("checkbox", { name: /My original background is a light/ }).check();
  await preview.click();
  await expect(page.getByRole("img", { name: "Photograph with optional background edit" })).toBeVisible();
  await expect(page.getByTestId("background-measurements")).toContainText("minimum 140");
  await expect(page.getByText(/Whitening it will not fix dark facial lighting/)).toBeVisible();
  await expect(page.getByTestId("background-measurements")).toContainText("not passport requirements");
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("cream wall correction succeeds offline without removing consent, diagnostics or edited-output labels", async ({ page, context }) => {
  await openWorkspace(page);
  const requests: string[] = [];
  page.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await context.setOffline(true);
  await page.locator("#photo-upload").setInputFiles(await fixture(page, 1800, 2200, "image/png", "#e0ccb4", "#c8c8c8"));
  await markHead(page);
  await page.getByText("Advanced: conservative light-background correction", { exact: true }).click();
  const preview = page.getByRole("button", { name: "Check and preview background" });
  await expect(preview).toBeDisabled();
  await page.getByRole("checkbox", { name: /I understand the editing restriction/ }).check();
  await expect(preview).toBeDisabled();
  await page.getByRole("checkbox", { name: /My original background is a light/ }).check();
  await preview.click();
  await expect(page.getByRole("img", { name: "Photograph with optional background edit" })).toBeVisible();
  await expect(page.getByTestId("background-color-measurements")).toContainText("maximum 50");
  await expect(page.getByTestId("background-color-measurements")).toContainText("spread above 80");
  await manualReview(page);
  await page.getByRole("button", { name: /Prepare verified-size/ }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download portal JPEG", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toContain("background-edited");
  const data = await bytes(download);
  expect(readHeader(data)).toEqual({ format: "jpeg", width: 630, height: 810 });
  expect(data.length).toBeLessThan(250_000);
  const corner = await sampleJpeg(page, data, 0.01, 0.01);
  expect(corner.slice(0, 3).every(value => value >= 253)).toBe(true);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("server prohibits uploads and browser connections, and does not expose files outside the build", async ({ request }) => {
  const result = await request.get("/");
  expect(result.headers()["content-security-policy"]).toContain("connect-src http://127.0.0.1:4317/vision/");
  expect(result.headers()["content-security-policy"]).not.toContain("connect-src 'self'");
  expect(result.headers()["cache-control"]).toBe("no-store");
  expect(result.headers()["set-cookie"]).toBeUndefined();
  expect((await request.post("/upload", { data: "synthetic-not-personal" })).status()).toBe(405);
  expect((await request.get("/package.json")).status()).toBe(404);
  expect((await request.get("/?filename=synthetic")).status()).toBe(404);
});

test("mobile workspace fits the viewport and reload does not retain a photo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await page.locator("#photo-upload").setInputFiles(await fixture(page));
  await page.getByRole("checkbox", { name: /I understand lighting changes/ }).check();
  await page.getByRole("button", { name: "Brighten gently", exact: true }).click();
  await expect(page.locator(".hero-note")).toHaveCSS("background-color", "rgb(23, 60, 121)");
  await expect(page.locator(".primary").first()).toHaveCSS("background-color", "rgb(29, 78, 216)");
  await expect(page.locator(".tone-grid")).toHaveCSS("grid-template-columns", /^\d+(\.\d+)?px$/);
  await expect(page.getByAltText("Adjusted lighting preview", { exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Overflow at ${width}px`).toBe(true);
  }
  await page.reload();
  await expect(page.getByText("Local vision ready. Processing stays on this device.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("A better original makes a better print.")).toBeVisible();
  expect(await page.locator("#photo-upload").inputValue()).toBe("");
});

test("small sources cannot be upscaled and transparent cutouts are rejected", async ({ page }) => {
  await openWorkspace(page);
  await page.locator("#photo-upload").setInputFiles(await fixture(page, 400, 500));
  await manualReview(page);
  await expect(page.getByRole("button", { name: /Prepare verified-size/ })).toBeDisabled();
  await expect(page.getByText("Insufficient crop resolution.", { exact: false })).toBeVisible();
  const transparent = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000; canvas.height = 1200;
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#photo-upload").setInputFiles({ name: "transparent-cutout.png", mimeType: "image/png", buffer: Buffer.from(transparent, "base64") });
  await expect(page.getByRole("alert")).toContainText("Transparent images are not accepted");
});

test("marking the head personalizes defaults and all reset paths restore those defaults", async ({ page }) => {
    await openWorkspace(page);
    await page.locator("#photo-upload").setInputFiles(await fixture(page, 2400, 3000));
    await expect(page.locator(".face-selector")).toBeVisible();
    await markHead(page, 0.20, 0.55);
    const zoom = page.getByRole("slider", { name: "2 x 2 print zoom", exact: true });
    const x = page.getByRole("slider", { name: "2 x 2 print horizontal position", exact: true });
    const portalZoom = page.getByRole("slider", { name: "630 x 810 portal zoom", exact: true });
    const headTop = page.getByRole("slider", { name: "Head top guide (%)", exact: true });
    const defaults = { zoom: await zoom.inputValue(), x: await x.inputValue(), portal: await portalZoom.inputValue(), top: await headTop.inputValue() };
    expect(Number(defaults.zoom)).toBeGreaterThan(1);
    await zoom.fill("2");
    await expect(headTop).not.toHaveValue(defaults.top);
    await page.getByRole("button", { name: "Reset 2 x 2 print crop", exact: true }).click();
    await expect(zoom).toHaveValue(defaults.zoom);
    await expect(headTop).toHaveValue(defaults.top);
    await x.fill("10");
    await page.getByRole("button", { name: "Reset 2 x 2 print horizontal position", exact: true }).click();
    await expect(x).toHaveValue(defaults.x);
    await portalZoom.fill("2.5");
    await page.getByRole("button", { name: "Reset 630 x 810 portal crop", exact: true }).click();
    await expect(portalZoom).toHaveValue(defaults.portal);
    await page.locator("#ppi").selectOption("300");
    await page.locator("#sheet-layout").selectOption("4x6");
    await page.getByRole("checkbox", { name: "Include cutting guides outside the photos", exact: true }).uncheck();
    await zoom.fill("2");
    await manualReview(page);
    await page.getByRole("button", { name: "Reset all adjustments", exact: true }).click();
    await expect(zoom).toHaveValue(defaults.zoom);
    await expect(page.locator("#ppi")).toHaveValue("600");
    await expect(page.locator("#sheet-layout")).toHaveValue("5x7");
    await expect(page.getByRole("checkbox", { name: "Include cutting guides outside the photos", exact: true })).toBeChecked();
    await expect(page.locator(".review-list input:checked")).toHaveCount(0);
    await expect(page.getByText("Using your manually marked head.")).toBeVisible();
  });

test("local face detector completes without a remote request and offers an explicit selection result", async ({ page, context }) => {
    await openWorkspace(page);
    await context.setOffline(true);
    await page.locator("#photo-upload").setInputFiles(await fixture(page));
    await expect(page.locator(".face-selector")).toBeVisible();
    const faces = await page.locator(".face-box").count();
    if (faces === 1) {
      await expect(page.locator(".face-box.selected")).toHaveCount(1);
      await expect(page.getByText("Detected face selected.", { exact: false })).toBeVisible();
    } else if (faces > 1) {
      await expect(page.locator(".face-box.selected")).toHaveCount(0);
      await page.getByRole("button", { name: "Select face 1", exact: true }).click();
      await expect(page.locator(".face-box.selected")).toHaveCount(1);
    } else {
      await expect(page.getByText("No confident face detection.", { exact: false })).toBeVisible();
    }
  });
