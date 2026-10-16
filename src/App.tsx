import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  cropRect, DEFAULT_MATTE, headSizeInches, INITIAL_FRAME, isSheetPreset, reprojectGuides, RULE_VERSION, SHEET_PRESETS, sheetLayout, sufficientResolution, suggestFraming, suggestPortalFraming, refinePortalHead, portalHeadFromGuides, validPrintHead, printDimensions, PRINT_FORMATS,
  type ApplicationProfile, type Face, type Frame, type MatteSettings, type Ppi, type Quality, type Rect, type SheetPreset, type PrintFormat,
} from "./core";
import {
  analyzePhoto, assessBackground, context, createOutputs, loadPhoto, renderAdjustments, thumbnail, triggerDownload,
  type Output, type Photo,
} from "./images";
import { detectFaces, initializeVision, portraitMatte, type PortraitMatte } from "./vision";
import FaceSelector from "./FaceSelector";
import { DEFAULT_TONE, GENTLE_LIFT, hasTone, type ToneSettings } from "./tone";
import { BACKGROUND_COLORS, BACKGROUND_COLOR_LIMITS, type BackgroundColor, type BackgroundAssessment } from "./background";
import { eyeMeasurements, eyesWithinTarget, validEyeTarget, type Eyes, type EyeTarget } from "./eyes";

type Guides = { top: number; chin: number };
type Review = { appearance: boolean; framing: boolean; original: boolean; printing: boolean; edited: boolean; countryRules: boolean; eyes: boolean };
const EMPTY_REVIEW: Review = { appearance: false, framing: false, original: false, printing: false, edited: false, countryRules: false, eyes: false };
const SOURCES = {
  indiaPrint: "https://services.vfsglobal.com/one-pager/india/united-states-of-america/passport-services/pdf/photo-specifiation.pdf",
  indiaUpload: "https://assets.ctfassets.net/xxg4p8gt3sg6/65N7mZz0hfj57DM1VlnLA2/2c951b35b3a446e6e970e2844036ff02/Passport-Seva-Photo-Upload-Instuctions-May-2026.pdf",
  usa: "https://travel.state.gov/en/passports/apply/help/photos.html",
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected processing error occurred. No files were generated. Try a different original photograph.";
}

function Slider({ label, value, min, max, step = 1, onChange, defaultValue }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; defaultValue?: number;
}) {
  return <div className="slider">
    <span>{label}<span className="slider-actions"><output>{value.toFixed(step < 1 ? 2 : 0)}</output>
      {defaultValue !== undefined && <button type="button" className="reset-inline" aria-label={`Reset ${label}`} onClick={() => onChange(defaultValue)}>Reset</button>}</span></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
      onChange={event => onChange(Number(event.target.value))} />
  </div>;
}

function CropEditor({ title, source, originalWidth, originalHeight, rect, frame, ratio, onChange, guides, onGuides, defaults, defaultGuides, onReset, printFormat = "2x2", eyes, eyeTarget, eyeOutputHeight }: {
  title: string; source: HTMLCanvasElement; rect: Rect; frame: Frame; ratio: number;
  originalWidth: number; originalHeight: number;
  onChange: (frame: Frame) => void; guides?: Guides; onGuides?: (guides: Guides) => void;
  defaults: Frame; defaultGuides?: Guides; onReset: () => void;
  printFormat?: PrintFormat;
  eyes?: Eyes | null; eyeTarget?: EyeTarget; eyeOutputHeight?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = 420; canvas.height = Math.round(420 / ratio);
    const ctx = context(canvas);
    const sx = source.width / originalWidth, sy = source.height / originalHeight;
    ctx.drawImage(source, rect.x * sx, rect.y * sy, rect.width * sx, rect.height * sy, 0, 0, canvas.width, canvas.height);
    if (eyeTarget) {
      const heightMm = PRINT_FORMATS[printFormat].heightMm;
      ctx.fillStyle = "rgba(37,99,235,.16)";
      ctx.fillRect(0, (1 - eyeTarget.maxMm / heightMm) * canvas.height, canvas.width, (eyeTarget.maxMm - eyeTarget.minMm) / heightMm * canvas.height);
    }
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
    if (guides) {
      ctx.setLineDash([]); ctx.lineWidth = 2;
      for (const [position, text] of [[guides.top, "TOP OF HAIR / HEAD"], [guides.chin, "BOTTOM OF CHIN"]] as const) {
        const y = canvas.height * position / 100;
        ctx.strokeStyle = "#38bdf8";
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        ctx.fillStyle = "#173454"; ctx.fillRect(4, Math.max(0, y - 19), 158, 17);
        ctx.font = "10px sans-serif"; ctx.fillStyle = "white"; ctx.fillText(text, 10, Math.max(12, y - 7));
      }
    }
    if (eyes) {
      const points = [eyes.left, eyes.right].map(p => ({ x: (p.x - rect.x) / rect.width * canvas.width, y: (p.y - rect.y) / rect.height * canvas.height }));
      ctx.strokeStyle = "#c2410c"; ctx.fillStyle = "#c2410c"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(points[1].x, points[1].y); ctx.stroke();
      ctx.setLineDash([]);
      for (const point of points) { ctx.beginPath(); ctx.arc(point.x, point.y, 4, 0, Math.PI * 2); ctx.fill(); }
    }
  }, [source, originalWidth, originalHeight, rect.x, rect.y, rect.width, rect.height, ratio, guides, eyes, eyeTarget, printFormat]);
  const eyeValues = eyes ? eyeMeasurements(eyes, rect, PRINT_FORMATS[printFormat].heightMm) : null;
  return <article className="crop-card">
    <div className="crop-heading"><h3>{title}</h3><button type="button" className="text-button" onClick={onReset}>Reset {title} crop</button></div>
    <div className="crop-canvas"><canvas ref={ref} aria-label={`${title} crop preview`} /></div>
    <p className="caption">Usable source: {Math.floor(rect.width)} x {Math.floor(rect.height)} pixels. Guides are not printed.</p>
    {eyeValues && <p className={eyeValues.inside ? "caption eye-measurement" : "warning-inline eye-measurement"}>
      Eye-line height from bottom: {eyeOutputHeight ? `${(eyeValues.averageMm / PRINT_FORMATS[printFormat].heightMm * eyeOutputHeight).toFixed(1)} output pixels` :
        `${eyeValues.averageMm.toFixed(1)} mm (${(eyeValues.averageMm / 25.4).toFixed(3)} inches)`}.
      {" "}Eye-line angle: {eyeValues.tiltDegrees.toFixed(1)} degrees. {!eyeValues.inside && "An eye marker is outside this crop."}
      {eyeOutputHeight && " Print targets do not apply to this upload crop."}
    </p>}
    <Slider label={`${title} zoom`} min={1} max={Math.min(20, Math.max(3, Math.ceil(defaults.zoom * 1.5)))} step={0.01} value={frame.zoom} defaultValue={defaults.zoom} onChange={zoom => onChange({ ...frame, zoom })} />
    <Slider label={`${title} horizontal position`} min={0} max={100} value={frame.x} defaultValue={defaults.x} onChange={x => onChange({ ...frame, x })} />
    <Slider label={`${title} vertical position`} min={0} max={100} value={frame.y} defaultValue={defaults.y} onChange={y => onChange({ ...frame, y })} />
    {guides && onGuides && <div className="guide-controls">
      <p>Review the suggested lines against the actual top of the hair/head and bottom of the chin. Detection estimates head extent; you confirm it.</p>
      <Slider label="Head top guide (%)" min={0} max={100} step={0.1} value={guides.top} defaultValue={defaultGuides?.top} onChange={top => onGuides({ ...guides, top })} />
      <Slider label="Chin guide (%)" min={0} max={100} step={0.1} value={guides.chin} defaultValue={defaultGuides?.chin} onChange={chin => onGuides({ ...guides, chin })} />
      <p className={validPrintHead(guides.top, guides.chin, printFormat) ? "measurement" : "warning-inline"}>
        Marked head height: <strong>{printFormat === "2x2" ? `${headSizeInches(guides.top, guides.chin).toFixed(2)} inches` : `${((guides.chin - guides.top) / 100 * 45).toFixed(1)} mm`}</strong>.
        {" "}{printFormat === "2x2" ? "Target: 1 to 1.375 inches on the 2-inch print." : "No country-specific head-height limit is applied. Check the destination's official instructions."}
      </p>
    </div>}
  </article>;
}

function Checks({ quality }: { quality: Quality }) {
  const checks = [
    { title: "Central-region exposure", value: `Mean brightness ${quality.mean.toFixed(0)} / 255`,
      note: quality.darkFraction > 0.2 || quality.brightFraction > 0.2
        ? "Many central pixels are near black or white. Inspect facial detail and retake if it is lost."
        : "No large central clipping area detected. Check actual facial detail yourself." },
    { title: "Light balance", value: `Left/right difference ${quality.leftRightDifference.toFixed(0)} / 255`,
      note: quality.leftRightDifference > 35 ? "Uneven lighting may be present. Face a soft, frontal light source."
        : "Small central left/right difference. This does not rule out facial or background shadows." },
    { title: "Detail signal", value: `Edge variance ${quality.sharpness.toFixed(0)}`,
      note: quality.sharpness < 55 ? "Low detail signal. Inspect the eyes and hair at full size; blur may require a retake."
        : "Detail is present, but background edges and noise can inflate this measurement. Inspect the face." },
    { title: "Corner background sample", value: `Brightness ${quality.backgroundBrightness.toFixed(0)}; variation ${quality.backgroundSpread.toFixed(0)}`,
      note: quality.backgroundBrightness > 220 && quality.backgroundSpread < 15 && quality.backgroundNeutrality < 15
        ? "Corners look light and neutral. Review the whole background for objects and shadows."
        : "Corners are not consistently light and neutral. Clothing or hair may also be in the sample." },
  ];
  return <div className="checks-grid">{checks.map(check => <article className="check-card" key={check.title}>
    <span className="badge neutral">Advisory</span><h3>{check.title}</h3><p className="metric">{check.value}</p><p>{check.note}</p>
  </article>)}</div>;
}

function OutputCard({ output }: { output: Output }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(output.blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [output]);
  return <article className="output-card">
    {url && <img src={url} alt={`Export preview: ${output.name}`} />}
    <h3>{output.name.startsWith("sheet") ? "Print sheet" : output.name.startsWith("india") ? "Portal upload" : "Individual print"}</h3>
    {output.printSize && <p><strong>{output.printSize}</strong></p>}
    <p>{output.width} x {output.height} pixels<br />{output.blob.size.toLocaleString()} bytes</p>
    <button type="button" className="secondary" onClick={() => triggerDownload(output.blob, output.name)}>Download {output.name.startsWith("sheet") ? "sheet" : output.name.startsWith("india") ? "portal JPEG" : output.name.startsWith("print-35x45") ? "35 x 45 mm photo" : "2 x 2 photo"}</button>
  </article>;
}

export default function App() {
  const [visionState, setVisionState] = useState<"loading" | "ready" | "failed">("loading");
  const [visionError, setVisionError] = useState("");
  const [country, setCountry] = useState<ApplicationProfile>("india");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);
  const [toneConsent, setToneConsent] = useState(false);
  const [toneSettings, setToneSettings] = useState<ToneSettings>({ ...DEFAULT_TONE });
  const [quality, setQuality] = useState<Quality | null>(null);
  const [printFrame, setPrintFrame] = useState<Frame>({ ...INITIAL_FRAME });
  const [portalFrame, setPortalFrame] = useState<Frame>({ ...INITIAL_FRAME });
  const [guides, setGuides] = useState<Guides>({ top: 20, chin: 80 });
  const [ppi, setPpi] = useState<Ppi>(600);
  const [sheetPreset, setSheetPreset] = useState<SheetPreset>("5x7");
  const [showCutGuides, setShowCutGuides] = useState(true);
  const [editConsent, setEditConsent] = useState(false);
  const [wallConfirmed, setWallConfirmed] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState<BackgroundColor>("white");
  const [backgroundAssessment, setBackgroundAssessment] = useState<BackgroundAssessment | null>(null);
  const [eyes, setEyes] = useState<Eyes | null>(null);
  const [targetEnabled, setTargetEnabled] = useState(false);
  const [targetMin, setTargetMin] = useState("");
  const [targetMax, setTargetMax] = useState("");
  const [faces, setFaces] = useState<Face[]>([]);
  const [selectedFace, setSelectedFace] = useState<Face | null>(null);
  const [matte, setMatte] = useState<PortraitMatte | null>(null);
  const [matteSettings, setMatteSettings] = useState<MatteSettings>({ ...DEFAULT_MATTE });
  const [review, setReview] = useState<Review>({ ...EMPTY_REVIEW });
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [framingNotice, setFramingNotice] = useState("");
  const [inputKey, setInputKey] = useState(0);
  useEffect(() => {
    let active = true;
    initializeVision().then(() => { if (active) setVisionState("ready"); }).catch(cause => {
      if (active) { setVisionState("failed"); setVisionError(message(cause)); }
    });
    return () => { active = false; };
  }, []);
  const printFormat: PrintFormat = country === "generic35x45" ? "35x45" : "2x2";
  const printSpec = PRINT_FORMATS[printFormat];
  const printPixels = printDimensions(printFormat, ppi);
  const defaults = useMemo(() => photo ? suggestFraming(photo.canvas.width, photo.canvas.height, selectedFace, printFormat) :
    suggestFraming(1200, 1600, null, printFormat), [photo, selectedFace, printFormat]);
  const source = photo?.canvas;
  const sheetSpec = SHEET_PRESETS[sheetPreset];
  const layout = sheetLayout(ppi, sheetPreset, printFormat);
  const hasCutGuides = showCutGuides;
  const activeTone = toneConsent ? toneSettings : DEFAULT_TONE;
  const lightingEdited = toneConsent && hasTone(toneSettings);
  const isEdited = backgroundEnabled || lightingEdited;
  const previewSettings = useMemo(() => ({ tone: activeTone, matte: backgroundEnabled ? matte : null, matteSettings, backgroundColor }),
    [activeTone, backgroundEnabled, matte, matteSettings, backgroundColor]);
  const deferredPreview = useDeferredValue(previewSettings);
  const previewBase = useMemo(() => source ? thumbnail(source, 1400) : null, [source]);
  const originalPreview = useMemo(() => previewBase?.toDataURL("image/jpeg", 0.94) ?? "", [previewBase]);
  const previewSource = useMemo(() => previewBase ?
    renderAdjustments(previewBase, deferredPreview.tone, deferredPreview.matte, deferredPreview.matteSettings, deferredPreview.backgroundColor) : null,
    [previewBase, deferredPreview]);
  const editedPreview = useMemo(() => previewSource?.toDataURL("image/jpeg", 0.94) ?? "", [previewSource]);
  const previewPending = previewSettings !== deferredPreview;
  const printRect = source ? cropRect(source.width, source.height, printPixels.width / printPixels.height, printFrame) : null;
  const defaultPixels = printDimensions(printFormat, defaults.ppi);
  const printDefaultGuides = source ? reprojectGuides(
    cropRect(source.width, source.height, defaultPixels.width / defaultPixels.height, defaults.print),
    cropRect(source.width, source.height, printPixels.width / printPixels.height, defaults.print), defaults.guides) : defaults.guides;
  const portalRect = source ? cropRect(source.width, source.height, 7 / 9, portalFrame) : null;
  const portalHead = selectedFace && printRect && guides.chin > guides.top
    ? portalHeadFromGuides(selectedFace, printRect, guides) : null;
  const portalGuides = portalHead && portalRect ? {
    top: (portalHead.y - portalRect.y) / portalRect.height * 100,
    chin: (portalHead.y + portalHead.height - portalRect.y) / portalRect.height * 100,
  } : undefined;
  const printResolutionOkay = !!printRect && sufficientResolution(printRect, printPixels.width, printPixels.height);
  const portalResolutionOkay = country !== "india" || (!!portalRect && sufficientResolution(portalRect, 630, 810));
  const resolutionOkay = printResolutionOkay && portalResolutionOkay;
  const lowPrintPixels = printDimensions(printFormat, 300);
  const lowPrintRect = source ? cropRect(source.width, source.height, lowPrintPixels.width / lowPrintPixels.height, printFrame) : null;
  const canUse300 = ppi === 600 && !!lowPrintRect && sufficientResolution(lowPrintRect, lowPrintPixels.width, lowPrintPixels.height);
  const reviewed = review.appearance && review.framing && review.original && review.printing &&
    review.eyes && (!isEdited || review.edited) && (country !== "generic35x45" || review.countryRules);
  const eyeTarget = { minMm: Number(targetMin), maxMm: Number(targetMax) };
  const targetValid = targetMin.trim() !== "" && targetMax.trim() !== "" && validEyeTarget(eyeTarget, printSpec.heightMm);
  const eyePositionOkay = !!eyes && !!printRect && eyeMeasurements(eyes, printRect, printSpec.heightMm).inside &&
    (country !== "india" || (!!portalRect && eyeMeasurements(eyes, portalRect, 45).inside)) &&
    (!targetEnabled || (targetValid && eyesWithinTarget(eyes, printRect, printSpec.heightMm, eyeTarget)));
  const headOkay = validPrintHead(guides.top, guides.chin, printFormat);
  const canGenerate = !!source && !previewPending && reviewed && resolutionOkay && headOkay && eyePositionOkay && (faces.length < 2 || !!selectedFace);

  const invalidate = () => { setOutputs([]); setReport(""); setError(""); };
  const resetReview = () => { invalidate(); setReview({ ...EMPTY_REVIEW }); };
  function clearPhoto() {
    setFramingNotice("");
    resetReview(); setPhoto(null); setBackgroundEnabled(false); setQuality(null);
    setToneConsent(false); setToneSettings({ ...DEFAULT_TONE });
    setPrintFrame({ ...INITIAL_FRAME }); setPortalFrame({ ...INITIAL_FRAME });
    setEditConsent(false); setGuides({ top: 20, chin: 80 }); setInputKey(value => value + 1);
    setWallConfirmed(false); setBackgroundColor("white"); setBackgroundAssessment(null);
    setEyes(null); setTargetEnabled(false); setTargetMin(""); setTargetMax("");
    setFaces([]); setSelectedFace(null); setMatte(null); setMatteSettings({ ...DEFAULT_MATTE });
    setPpi(600); setSheetPreset("5x7"); setShowCutGuides(true);
  }
  function selectFace(face: Face) {
    if (!photo) return;
    const next = suggestFraming(photo.canvas.width, photo.canvas.height, face, printFormat);
    setSelectedFace(face); setPrintFrame(next.print); setPortalFrame(next.portal); setGuides(next.guides); setPpi(next.ppi);
    setEyes(face.eyes ?? null);
    resetReview();
  }
  function resetAdjustments() {
    setPrintFrame({ ...defaults.print }); setPortalFrame({ ...defaults.portal }); setGuides({ ...defaults.guides });
    setPpi(defaults.ppi); setSheetPreset("5x7"); setShowCutGuides(true); setBackgroundEnabled(false); setEditConsent(false);
    setToneConsent(false); setToneSettings({ ...DEFAULT_TONE });
    setWallConfirmed(false); setBackgroundColor("white"); setBackgroundAssessment(null);
    setEyes(selectedFace?.eyes ?? null); setTargetEnabled(false); setTargetMin(""); setTargetMax("");
    setMatteSettings({ ...DEFAULT_MATTE }); resetReview();
  }
  function changePrintFrame(next: Frame) {
    if (!source || !printRect) return;
    setGuides(reprojectGuides(printRect, cropRect(source.width, source.height, printPixels.width / printPixels.height, next), guides));
    setPrintFrame(next); resetReview();
  }
  function updateMatte(settings: MatteSettings) {
    setMatteSettings(settings); resetReview();
  }
  function reframePortal() {
    if (!source || !selectedFace || !printRect) { setError("Select or mark the head before reframing the upload."); return; }
    try {
      const head = portalHeadFromGuides(selectedFace, printRect, guides);
      setPortalFrame(suggestPortalFraming(source.width, source.height, { ...selectedFace, portalHead: head }, eyes ?? undefined));
      resetReview();
    } catch (cause) { setError(message(cause)); }
  }
  function updateTone(settings: ToneSettings) {
    setToneSettings(settings); resetReview();
  }
  function changeProfile(value: string) {
    if (value !== "india" && value !== "usa" && value !== "generic35x45") { setError("Choose a supported application profile."); return; }
    setCountry(value);
    setTargetEnabled(false); setTargetMin(""); setTargetMax("");
    const next = suggestFraming(source?.width ?? 1200, source?.height ?? 1600, selectedFace, value === "generic35x45" ? "35x45" : "2x2");
    setPrintFrame(next.print); setPortalFrame(next.portal); setGuides(next.guides); setPpi(next.ppi); resetReview();
  }
  function changePpi(next: Ppi) {
    const pixels = printDimensions(printFormat, next);
    if (source && printRect) setGuides(reprojectGuides(printRect, cropRect(source.width, source.height, pixels.width / pixels.height, printFrame), guides));
    setPpi(next); resetReview();
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    clearPhoto(); setBusy("Reading your original and measuring image quality...");
    try {
      const loaded = await loadPhoto(file);
      const measured = analyzePhoto(loaded.canvas);
      setPhoto(loaded); setQuality(measured);
      if (visionState === "ready") {
        setBusy("Finding faces locally and suggesting the required crops...");
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        let detected = detectFaces(loaded.canvas);
        if (detected.length) {
          setBusy("Checking the visible head boundary locally for portal framing...");
          try {
            const mask = await portraitMatte(loaded.canvas);
            setMatte(mask);
            detected = detected.map(face => {
              const head = refinePortalHead(face, loaded.canvas.width, loaded.canvas.height, mask);
              return head ? { ...face, portalHead: head } : face;
            });
            if (detected.some(face => !face.portalHead)) {
              setFramingNotice("The visible crown could not be estimated confidently for every face. Check the portal head guides and mark the head manually if needed.");
            }
          } catch (cause) {
            setFramingNotice(`Automatic crown refinement was unavailable: ${message(cause)} The detector-based crop is only a starting estimate; mark the head manually.`);
          }
        }
        setFaces(detected);
        const selected = detected.length === 1 ? detected[0] : null;
        setSelectedFace(selected);
        setEyes(selected?.eyes ?? null);
        const next = suggestFraming(loaded.canvas.width, loaded.canvas.height, selected, printFormat);
        setPrintFrame(next.print); setPortalFrame(next.portal); setGuides(next.guides); setPpi(next.ppi);
      } else {
        setPpi(suggestFraming(loaded.canvas.width, loaded.canvas.height, null, printFormat).ppi);
      }
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(""); }
  }
  async function editBackground() {
    if (!photo || !editConsent || !wallConfirmed) return;
    resetReview(); setBusy("Separating the person from the background locally. This may take a few seconds...");
    try {
      const mask = matte ?? await portraitMatte(photo.canvas);
      setMatte(mask);
      const assessment = assessBackground(photo.canvas, mask);
      setBackgroundAssessment(assessment);
      if (!assessment.eligible) throw new Error(assessment.reason);
      setBackgroundEnabled(true);
    } catch (cause) { setError(message(cause)); setBackgroundEnabled(false); }
    finally { setBusy(""); }
  }
  async function generate() {
    if (!source || !printRect || !portalRect || !canGenerate) {
      setError("Complete the review, head measurement and source-resolution requirements before generating.");
      return;
    }
    invalidate(); setBusy("Rendering and verifying exact-size JPEG files...");
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      const fullResolution = renderAdjustments(source, activeTone, backgroundEnabled ? matte : null, matteSettings, backgroundColor);
      const files = await createOutputs(fullResolution, printRect, portalRect, ppi, country === "india", sheetPreset, showCutGuides,
        { background: backgroundEnabled, lighting: lightingEdited }, printFormat);
      const portalEyes = eyes && country === "india" ? eyeMeasurements(eyes, portalRect, 810) : null;
      const details = {
        application: country === "india" ? "Indian passport: physical print + May 2026 portal dimensions" : country === "usa" ? "US passport: printed submission only" : "Generic 35 x 45 mm print: size only, country-specific requirements not verified",
        ruleVersion: RULE_VERSION, createdAt: new Date().toISOString(),
        status: "Files formatted; manual checks confirmed by user. Government acceptance not verified.",
        backgroundEdited: backgroundEnabled,
        backgroundCorrection: backgroundEnabled ? { color: BACKGROUND_COLORS[backgroundColor], wallConfirmed, assessment: backgroundAssessment, policy: "Appearance heuristic only; passport compliance not established." } : null,
        lightingEdited,
        lightingSettings: { ...activeTone },
        editingPolicy: isEdited ? "Edited photo. Compliance with application editing restrictions is NOT established." : "No intentional appearance or background edits.",
        imageProcessing: "Browser-decoded pixels re-encoded in sRGB; orientation normalized. Original file unchanged. Exports omit original metadata.",
        inputFormat: photo?.format,
        measurements: { printCrop: printRect, portalCrop: country === "india" ? portalRect : null,
          userReviewedHeadMm: (guides.chin - guides.top) / 100 * printSpec.heightMm,
          userReviewedHeadInches: (guides.chin - guides.top) / 100 * printSpec.heightMm / 25.4, selectionMethod: selectedFace?.source ?? "manual crop",
          portalHead: country === "india" ? portalHead : null,
          portalFramingNote: "Head boundary and height coverage are estimates, not verified face-area compliance." },
        printFormat: { name: printFormat, requestedWidthMm: printSpec.widthMm, requestedHeightMm: printSpec.heightMm,
          rasterWidthMm: printPixels.width / ppi * 25.4, rasterHeightMm: printPixels.height / ppi * 25.4,
          ppi, rounding: "Nearest whole pixel; maximum physical rounding error is half a pixel per dimension." },
        editing: backgroundEnabled ? { model: "MODNet (local)", settings: matteSettings } : null,
        processingOrder: ["Original pixels", "Optional linear-light exposure and tonal adjustment", "Optional light-background compositing", "Independent full-resolution crops", "JPEG encoding"],
        sourceQualityAdvisories: quality,
        manualConfirmations: review,
        eyePlacement: eyes && printRect ? { points: eyes, printMeasurement: eyeMeasurements(eyes, printRect, printSpec.heightMm),
          portalMeasurement: portalEyes ? { inside: portalEyes.inside, leftPixels: portalEyes.leftMm,
            rightPixels: portalEyes.rightMm, averagePixels: portalEyes.averageMm, tiltDegrees: portalEyes.tiltDegrees } : null,
          target: targetEnabled ? { ...eyeTarget, authority: "User-supplied from their application instructions, not verified by this app." } : null,
          warning: "No official numeric eye-height range is enforced by default. Available source text did not establish a reliable numeric range. Open eyes and pose require manual review." } : null,
        outputFiles: files.map(({ name, width, height, blob, printSize }) => ({ name, width, height, bytes: blob.size, printSize })),
        sheet: { preset: sheetPreset, widthInches: sheetSpec.width, heightInches: sheetSpec.height,
          photoCount: layout.photos.length, photoSize: printSpec.label, gapInches: sheetSpec.gap, cuttingGuides: hasCutGuides },
        printInstructions: `Select ${sheetSpec.width} x ${sheetSpec.height} inches for the sheet, actual size / 100%, no fit-to-page, no auto enhancement, no cropping or borderless expansion. Photos have white gaps and outer margins. ${hasCutGuides ? `Align cuts through the outside crop marks; remove waste paper, leaving ${printSpec.label} photos with no printed guides.` : "No cutting guides included."} Do not enlarge the individual photo to fill larger paper. Metric dimensions are rounded to the nearest whole pixel. Verify a cut photo with a ruler. Use photo paper.`,
        limitations: ["Adults only", "Face detection and head extent are estimates; eyes, expression and pose need review", "Quality thresholds are engineering heuristics, not government thresholds", "No proof of recency, originality or identity", "Physical-copy count must be checked against your current checklist", "No HEIC sequences or US online-renewal profile", "HEIC HDR, depth, auxiliary images and original metadata are not preserved; inspect decoded orientation and color"],
        sources: country === "india" ? [SOURCES.indiaPrint, SOURCES.indiaUpload] : country === "usa" ? [SOURCES.usa] : [],
      };
      setReport(JSON.stringify(details, null, 2)); setOutputs(files);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(""); }
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top"><span className="brand-mark">P</span>Passport Photo <strong>Local</strong></a>
      <span className="privacy-pill"><span /> On your device. Not in the cloud.</span>
    </header>
    <main id="top">
      <section className="hero">
        <div><p className="eyebrow">PRIVATE PHOTO WORKSPACE / EARLY LOCAL RELEASE</p>
          <h1>One original.<br /><span>Every required format.</span></h1>
          <p className="lead">Prepare a precise passport upload and real-size prints, without sending your photograph anywhere.</p>
          <div className="hero-tags"><span>2 x 2 inch / 35 x 45 mm prints</span><span>630 x 810 upload</span><span>4 x 6 / 5 x 7 sheets</span></div>
        </div>
        <aside className="hero-note"><span className="note-number">01 / 03</span><h2>Check. Frame. Export.</h2>
          <p>Honest quality guidance, independent crops, and verified file dimensions. No beauty filters. No acceptance promises.</p>
          <span className="small-label">JPEG + PNG + HEIC &bull; ADULTS ONLY &bull; LOCAL ONLY</span>
        </aside>
      </section>
      <div className="notice">Local face detection suggests the framing. Local portrait matting estimates the visible crown for the upload crop without editing the photo. Neither verifies passport acceptance; review the face, hair, expression, shadows and any exceptions.</div>
      {visionState === "loading" && <div className="status" role="status">Loading local face and portrait models from your computer. No photograph is sent anywhere.</div>}
      {visionState === "ready" && <p className="model-ready" role="status">Local vision ready. Processing stays on this device.</p>}
      {visionState === "failed" && <div className="warning" role="alert">Automatic tools could not start: {visionError} You can still mark the head and crop manually. Background matting is disabled.</div>}
      {error && <div className="error" role="alert"><strong>We could not complete that step.</strong> {error}</div>}
      {busy && <div className="status" role="status">{busy}</div>}
      <fieldset disabled={!!busy || visionState === "loading"} className="workspace">
        <legend className="sr-only">Photo preparation workspace</legend>
        <section className="panel">
          <div className="section-heading"><span className="step">01</span><div><h2>Choose your application &amp; original</h2><p>The country and submission route determine the outputs.</p></div></div>
          <div className="setup-grid">
            <div>
              <label className="field-label" htmlFor="country">Application profile</label>
              <select id="country" value={country} onChange={event => changeProfile(event.target.value)}>
                <option value="india">India: physical application + portal upload</option>
                <option value="usa">USA: printed-photo submission</option>
                <option value="generic35x45">Generic 35 x 45 mm print: size only</option>
              </select>
              <p className="caption">{country === "india"
                ? "Based on the supplied VFS print guide and May 2026 upload instructions. Check your consulate's current checklist and copy count."
                : country === "usa" ? "US printed submission only. Do not use these files as a substitute for the separate online-renewal photo instructions."
                : "Generic physical print size, not a verified country profile. Check your destination's official requirements for head height, background, expression and editing. No Indian portal upload is generated."}</p>
              {country !== "generic35x45" && <div className="source-links">
                {country === "india" ? <><a href={SOURCES.indiaPrint} target="_blank" rel="noreferrer">VFS print specifications</a><a href={SOURCES.indiaUpload} target="_blank" rel="noreferrer">Portal upload instructions</a></> :
                  <a href={SOURCES.usa} target="_blank" rel="noreferrer">US passport photo guidance</a>}
              </div>}
              {country !== "generic35x45" && <p className="caption">These links open external reference websites only when you click them. Your image is not sent with them.</p>}
            </div>
            <div className="upload-box">
              <label htmlFor="photo-upload"><strong>{photo ? "Replace original photograph" : "Choose your original photograph"}</strong><span>JPEG, PNG or HEIC/HEIF, up to 25 MiB and 24 megapixels</span></label>
              <input key={inputKey} id="photo-upload" type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" onChange={upload} />
              <p>Files stay in browser memory. No upload endpoint, remote models, analytics, or saved photo history.</p>
              {photo && <button className="text-button" type="button" onClick={clearPhoto}>Clear photo and results</button>}
            </div>
          </div>
        </section>
        {!photo && <section className="empty-state"><div className="empty-frame"><span /></div><h2>A better original makes a better print.</h2><p>Face a soft light, stand in front of a plain light wall, and leave space around your head and shoulders. Avoid close-up selfies and filters.</p></section>}
        {photo && source && previewSource && printRect && portalRect && <>
          <section className="panel">
            <div className="section-heading"><span className="step">02</span><div><h2>Choose the face &amp; adjust the photo</h2><p>{photo.canvas.width} x {photo.canvas.height} source pixels. Your original stays unchanged.</p></div></div>
            <FaceSelector key={inputKey} photo={photo} faces={faces} selected={selectedFace} onSelect={selectFace} onManual={selectFace}
              eyes={eyes} onEyes={value => { setEyes(value); resetReview(); }} />
            <details className="quality-details">
              <summary>Original photo quality measurements</summary>
              {quality && <Checks quality={quality} />}
              <p className="caption">These describe the original and are coarse image-region measurements, not face-aware judgments. Skin tone, clothing and background affect them. No automatic pass/fail decision is made from them.</p>
            </details>
            <details className="editing-panel lighting-panel" open>
              <summary>Optional: lighting adjustments <span className="badge neutral">Original by default</span></summary>
              <p>Face too dark? Start with <strong>Brighten gently</strong>, then adjust exposure or shadow lift. Keep skin tones natural. These controls change the whole photo, not facial geometry.</p>
              <div className="warning">Lighting changes edit the photograph and may violate your application's rules. This is not a compliance fix. Clipped detail cannot be recovered, and lifting deep shadows can make noise more visible.</div>
              <label className="checkbox"><input type="checkbox" checked={toneConsent} onChange={event => {
                setToneConsent(event.target.checked);
                if (!event.target.checked) setToneSettings({ ...DEFAULT_TONE });
                resetReview();
              }} />I understand lighting changes edit the photo and want to enable them.</label>
              <fieldset className="tone-controls" disabled={!toneConsent}>
                <legend className="sr-only">Optional lighting controls</legend>
                <div className="button-row">
                  <button type="button" className="secondary" onClick={() => updateTone({ ...GENTLE_LIFT })}>Brighten gently</button>
                  <button type="button" className="text-button" onClick={() => updateTone({ ...DEFAULT_TONE })}>Reset lighting</button>
                </div>
                <div className="tone-grid">
                  <div><Slider label="Exposure (EV)" min={-1} max={1.5} step={0.05} value={toneSettings.exposure} defaultValue={0} onChange={exposure => updateTone({ ...toneSettings, exposure })} /><p className="caption">Overall brightness. Small changes are usually enough.</p></div>
                  <div><Slider label="Shadow lift" min={0} max={40} value={toneSettings.shadows} defaultValue={0} onChange={shadows => updateTone({ ...toneSettings, shadows })} /><p className="caption">Lighten dark regions without applying the same lift to highlights.</p></div>
                  <div><Slider label="Highlight reduction" min={0} max={50} value={toneSettings.highlights} defaultValue={0} onChange={highlights => updateTone({ ...toneSettings, highlights })} /><p className="caption">Tone down bright regions. This cannot reconstruct washed-out detail.</p></div>
                  <div><Slider label="Contrast" min={-20} max={20} value={toneSettings.contrast} defaultValue={0} onChange={contrast => updateTone({ ...toneSettings, contrast })} /><p className="caption">Use sparingly. Excess contrast can hide facial detail.</p></div>
                </div>
              </fieldset>
              {toneConsent && <div className="comparison lighting-comparison">
                <figure><img src={originalPreview} alt="Original lighting preview" /><figcaption>Original, unchanged</figcaption></figure>
                <figure><img src={editedPreview} alt="Adjusted lighting preview" /><figcaption>{lightingEdited ? "Lighting adjusted" : "Lighting unchanged"}{backgroundEnabled ? " + corrected background" : ""}</figcaption></figure>
              </div>}
              {previewPending && <p className="status" role="status">Updating the local preview...</p>}
              <p className="caption">Lighting is applied before optional background replacement, so a replacement white background stays white. Downloads are rendered again from the full-resolution original.</p>
            </details>
            <details className="editing-panel">
              <summary>Advanced: conservative light-background correction</summary>
              <p>For light gray, off-white, cream or muted pastel walls, including underexposure, moderate shading and faint patterns. Not for forests, scenery or busy rooms. Vivid colors, deep dark patches, busy textures and uncertain separation remain blocked. These checks cannot prove what a scene depicts.</p>
              <div className="warning"><strong>This edits your photograph.</strong> The reviewed Indian portal instructions prohibit photo-editing tools. The US guidance also restricts alteration. An edited output is not verified compliant, even when the background looks white. Retaking against a suitable wall is safer.</div>
              <p>MODNet estimates a soft portrait mask locally. The foreground uses your selected lighting settings, with blending around hair and clothing edges. Inspect fine hair, glasses and any translucent fabric.</p>
              <label className="checkbox"><input type="checkbox" checked={editConsent} onChange={event => {
                setEditConsent(event.target.checked);
                if (!event.target.checked) { setBackgroundEnabled(false); resetReview(); }
              }} />I understand the editing restriction and want to preview this optional edit.</label>
              <label className="checkbox"><input type="checkbox" checked={wallConfirmed} onChange={event => {
                setWallConfirmed(event.target.checked);
                if (!event.target.checked) setBackgroundEnabled(false);
                resetReview();
              }} />My original background is a light, mostly plain wall, not scenery, a forest or a busy room.</label>
              <label className="field-label" htmlFor="background-color">Desired light background</label>
              <select id="background-color" value={backgroundColor} onChange={event => {
                const value = event.target.value;
                if (value !== "white" && value !== "neutral" && value !== "warm") { setError("Choose one of the supported light background colors."); return; }
                setBackgroundColor(value); resetReview();
              }}>
                {Object.entries(BACKGROUND_COLORS).map(([value, color]) => <option value={value} key={value}>{color.label}{value === "white" ? " (preferred when white is required)" : ""}</option>)}
              </select>
              <p className="caption">Other light tones may not meet a white-background requirement. Correction remains an edit, used at your own risk. Fine hair and transparent edges can change; inspect the final result.</p>
              <Slider label="Background cleanup" min={0} max={20} value={matteSettings.cleanup} defaultValue={DEFAULT_MATTE.cleanup} onChange={cleanup => updateMatte({ ...matteSettings, cleanup })} />
              <Slider label="Soft edge preservation" min={0} max={100} value={matteSettings.softness} defaultValue={DEFAULT_MATTE.softness} onChange={softness => updateMatte({ ...matteSettings, softness })} />
              <p className="caption">Start with the defaults. Increase cleanup only for leftover background haze; keep soft edge preservation high for hair. These controls update an existing preview without rerunning the model.</p>
              <div className="button-row">
                <button type="button" className="secondary" disabled={!editConsent || !wallConfirmed || visionState !== "ready"} onClick={editBackground}>Check and preview background</button>
                <button type="button" className="text-button" onClick={() => { setBackgroundColor("white"); updateMatte({ ...DEFAULT_MATTE }); }}>Reset background settings</button>
                {backgroundEnabled && <button type="button" className="text-button" onClick={() => { setBackgroundEnabled(false); resetReview(); }}>Use original background</button>}
              </div>
              {backgroundAssessment && <>
                <p className={backgroundAssessment.eligible ? "notice" : "warning"} role="status">{backgroundAssessment.reason}{!backgroundAssessment.eligible && " Correction is unavailable; no override is offered."}</p>
                <p className="caption" data-testid="background-measurements">
                  Estimated background only: average brightness {backgroundAssessment.metrics.brightness.toFixed(1)}/255 (minimum 140);
                  {" "}shadowed samples {(backgroundAssessment.metrics.darkFraction * 100).toFixed(2)}% (below 120, maximum 15%);
                  {" "}near-black samples {(backgroundAssessment.metrics.deepDarkFraction * 100).toFixed(2)}% (below 65, maximum 0.5%).
                  {" "}These are editing safeguards, not passport requirements. Portrait-mask mistakes can affect these readings.
                </p>
                <p className="caption" data-testid="background-color-measurements">
                  Background color spread: {backgroundAssessment.metrics.colorfulness.toFixed(1)}/255 (maximum {BACKGROUND_COLOR_LIMITS.meanSpread});
                  {" "}strong-color samples: {(backgroundAssessment.metrics.colorfulFraction * 100).toFixed(2)}% (spread above {BACKGROUND_COLOR_LIMITS.strongSpread}, maximum {BACKGROUND_COLOR_LIMITS.strongFraction * 100}%);
                  {" "}brightness variation: {backgroundAssessment.metrics.spread.toFixed(1)};
                  {" "}textured edges: {(backgroundAssessment.metrics.texturedFraction * 100).toFixed(2)}%;
                  {" "}confident background coverage: {(backgroundAssessment.metrics.coverage * 100).toFixed(1)}%.
                </p>
              </>}
              {backgroundEnabled && <div className="comparison">
                <figure><img src={originalPreview} alt="Original photograph before background edit" /><figcaption>Original, unchanged</figcaption></figure>
                <figure><img src={editedPreview} alt="Photograph with optional background edit" /><figcaption>Edited, inspect hair and clothing</figcaption></figure>
              </div>}
            </details>
          </section>
          <section className="panel">
            <div className="section-heading"><span className="step">03</span><div><h2>Frame each output separately</h2><p>A square print and portrait upload need different crops. We never stretch or upscale the person.</p></div></div>
            <div className="reset-bar"><p>{selectedFace ? "Defaults follow the selected head. Confirm the top and chin guides before exporting." : "No head selection: mark it above to get personalized crop defaults."}</p><button type="button" className="secondary" onClick={resetAdjustments}>Reset all adjustments</button></div>
            {photo.format === "heic" && <p className="notice">HEIC decoded locally, without uploading or changing the original. Inspect orientation and color: HDR, depth and auxiliary images are not preserved in the standard photo output.</p>}
            {country === "india" && <div className="notice">
              <p>The supplied instructions ask for a tight crop, limited space above the head and beside the ears, and approximately 80% face coverage. Mark the head and both pupils above, then reframe and compare against the official example.</p>
              <button type="button" className="secondary" disabled={!selectedFace} onClick={reframePortal}>Reframe upload around marked face</button>
              <p className="caption">Automatic headroom uses the locally estimated visible crown when available, rather than extra space added to a face box. Correcting the print head-top or chin guide also corrects the head used by Reframe upload. Eye markers center the crop horizontally; they no longer move it vertically toward an arbitrary eye line. Only the upload crop changes.</p>
              {framingNotice && selectedFace?.source !== "manual" && <p className="warning-inline" role="status">{framingNotice}</p>}
              {portalGuides ? <p className="caption" data-testid="portal-head-measurement">
                Estimated/marked head height: {(portalGuides.chin - portalGuides.top).toFixed(1)}% of crop height.
                {" "}Top space: {portalGuides.top.toFixed(1)}%.
                {" "}Starting targets: about 80% height and 5% top space, subject to source bounds and head width. These are not measurements of face area or a guarantee of acceptance.
                {(portalGuides.top < -0.01 || portalGuides.chin > 100.01) && " The marked head extends outside this crop; reframe or reduce zoom."}
              </p> : <p className="warning-inline">Mark the head with the top guide above the chin to review upload headroom.</p>}
            </div>}
            {backgroundEnabled && <div className="warning">Background-edited source is selected. Every photo export will be identified as edited in its filename and report.</div>}
            {lightingEdited && <div className="notice">Lighting adjustments are active. They are included in every photo export and recorded in the report.</div>}
            <details className="editing-panel eye-panel" open>
              <summary>Eye position and optional reference range</summary>
              <p>Mark both pupil centers above, or inspect the detected orange markers. They stay anchored to the original while you move either crop. Eye guides are never exported.</p>
              <div className="notice">No official numeric eye-height band is enforced by default. Available source text did not establish a reliable numeric range; check your current application instructions. Do not assume a print rule applies to the Indian portal or another country.</div>
              <button className="text-button" type="button" onClick={() => { setEyes(selectedFace?.eyes ?? null); resetReview(); }}>Reset eye markers</button>
              <label className="checkbox"><input type="checkbox" checked={targetEnabled} onChange={event => { setTargetEnabled(event.target.checked); resetReview(); }} />Use an eye-height range from my current application instructions</label>
              {targetEnabled && <>
                <p className="caption">Enter the minimum and maximum distance from the bottom of the physical print to the eye centers, in millimeters. The blue band is your reference, not an app-verified government rule. One inch equals 25.4 mm.</p>
                <div className="setup-grid">
                  <label className="field-label">Minimum eye height from bottom (mm)<input type="number" min={0} max={printSpec.heightMm} step="0.1" value={targetMin} onChange={event => { setTargetMin(event.target.value); resetReview(); }} /></label>
                  <label className="field-label">Maximum eye height from bottom (mm)<input type="number" min={0} max={printSpec.heightMm} step="0.1" value={targetMax} onChange={event => { setTargetMax(event.target.value); resetReview(); }} /></label>
                </div>
                {!targetValid && <p className="warning-inline">Enter an ordered range between 0 and {printSpec.heightMm} mm.</p>}
                {targetValid && eyes && !eyesWithinTarget(eyes, printRect, printSpec.heightMm, eyeTarget) && <p className="warning-inline">The eye markers are outside your supplied range. Adjust the print crop or correct the markers.</p>}
              </>}
            </details>
            <div className="crop-grid">
              <CropEditor title={printFormat === "2x2" ? "2 x 2 print" : "35 x 45 mm print"} printFormat={printFormat} source={previewSource} originalWidth={source.width} originalHeight={source.height} rect={printRect} frame={printFrame} ratio={printPixels.width / printPixels.height}
                eyes={eyes} eyeTarget={targetEnabled && targetValid ? eyeTarget : undefined}
                defaults={defaults.print} defaultGuides={printDefaultGuides} onReset={() => { setPrintFrame({ ...defaults.print }); setGuides({ ...printDefaultGuides }); resetReview(); }}
                onChange={changePrintFrame} guides={guides}
                onGuides={value => { setGuides(value); resetReview(); }} />
              {country === "india" && <CropEditor title="630 x 810 portal" source={previewSource} originalWidth={source.width} originalHeight={source.height} rect={portalRect} frame={portalFrame} ratio={7 / 9}
                eyes={eyes} eyeOutputHeight={810} guides={portalGuides}
                defaults={defaults.portal} onReset={() => { setPortalFrame({ ...defaults.portal }); resetReview(); }}
                onChange={value => { setPortalFrame(value); resetReview(); }} />}
            </div>
          </section>
          <section className="panel">
            <div className="section-heading"><span className="step">04</span><div><h2>Review &amp; prepare downloads</h2><p>Technical output checks do not establish government acceptance.</p></div></div>
            <div className="setup-grid">
              <div>
                <label className="field-label" htmlFor="ppi">Print resolution</label>
                <select id="ppi" value={ppi} onChange={event => changePpi(event.target.value === "300" ? 300 : 600)}>
                  {([600, 300] as const).map(value => {
                    const pixels = printDimensions(printFormat, value);
                    return <option key={value} value={value}>{value} PPI: {pixels.width} x {pixels.height} individual / {sheetSpec.width * value} x {sheetSpec.height * value} sheet</option>;
                  })}
                </select>
                <p className="caption">The suggested PPI uses the selected crop's actual resolution. These are print-quality choices, not government-mandated PPI.</p>
                {printFormat === "35x45" && <p className="caption">35 x 45 mm is rounded to the nearest whole pixel: 827 x 1063 at 600 PPI, or 413 x 531 at 300 PPI. Rounding is under 0.043 mm per dimension. This is a physical print, not a portal upload specification.</p>}
                {!resolutionOkay && <div className="warning-inline">
                  <strong>Insufficient crop resolution.</strong>
                  {!printResolutionOkay && <p>Print crop: {Math.floor(printRect.width)} x {Math.floor(printRect.height)} source pixels; {printPixels.width} x {printPixels.height} required for {printSpec.label} at {ppi} PPI.
                    {canUse300 ? " This crop supports 300 PPI without upscaling." : " Reduce print zoom while preserving the required framing, or use a higher-resolution original."}
                    {canUse300 && <> <button type="button" className="secondary" onClick={() => changePpi(300)}>Use 300 PPI for prints</button></>}
                  </p>}
                  {!portalResolutionOkay && <p>Portal crop: {Math.floor(portalRect.width)} x {Math.floor(portalRect.height)} source pixels; at least 630 x 810 required.
                    {" "}Changing print PPI cannot fix the portal crop. Reset the portal crop or reduce its zoom slightly, then check the framing. If that makes the head too small, use a closer or higher-resolution original. No upscaling is applied.
                  </p>}
                </div>}
                <label className="field-label" htmlFor="sheet-layout">Print sheet size and layout</label>
                <select id="sheet-layout" value={sheetPreset} onChange={event => {
                  const value = event.target.value;
                  if (!isSheetPreset(value)) { setError("Choose a supported print-sheet layout."); return; }
                  setSheetPreset(value); resetReview();
                }}>
                  {Object.entries(SHEET_PRESETS).map(([value, spec]) => <option key={value} value={value}>{spec.width} x {spec.height}: {(printFormat === "35x45" ? 2 : spec.columns) * spec.rows} photos, margins and cutting guides{value === "5x7" ? " (recommended)" : ""}</option>)}
                </select>
                <label className="checkbox"><input type="checkbox" checked={hasCutGuides}
                  onChange={event => { setShowCutGuides(event.target.checked); resetReview(); }} />Include cutting guides outside the photos</label>
                <p className="caption">Each photo is {printSpec.label}{printFormat === "35x45" ? ", to whole-pixel precision" : ""}. White gaps are 0.25 inch. Guides sit only in waste paper, never over the photos. Cut along the alignment of the short marks, not around the larger sheet.</p>
                <div className="notice">Order exactly <strong>{sheetSpec.width} x {sheetSpec.height} inches</strong>, actual size / 100%. Disable auto-enhancement, cropping and borderless expansion. Do not order the individual photo as a larger print. Measure a cut photo with a ruler. Margins do not compensate for a lab enlarging the sheet.</div>
              </div>
              <div className="review-list">
                {([
                  ["appearance", "I checked that one adult faces the camera, the expression and eyes meet the selected rules, and no facial detail is obstructed. I checked any glasses or covering exceptions."],
                  ["framing", "I placed the head guides correctly, checked each available crop against the applicable instructions, and reviewed the full background, lighting and sharpness."],
                  ["eyes", "I checked both eye markers, eye position against my current official instructions, and that the eyes are open, level and unobstructed. Detection is only an estimate."],
                  ["original", "I have permission to process this photo and confirmed its recency and original capture. I understand the tool cannot verify identity, filters or photo age."],
                  ["printing", "I understand the exact-size printing instructions and will verify the current application checklist and physical-copy count."],
                  ...(country === "generic35x45" ? [["countryRules", "I checked my destination's official 35 x 45 mm requirements, including head height, background, expression and editing. This generic profile checks size only."]] : []),
                  ...(isEdited ? [["edited", "I inspected the edited lighting, skin tones and edges and understand these edits may violate the application instructions. This is not an acceptance guarantee."]] : []),
                ] as [keyof Review, string][]).map(([key, label]) =>
                  <label className="checkbox" key={key}><input type="checkbox" checked={review[key]} onChange={event => {
                    setReview({ ...review, [key]: event.target.checked }); invalidate();
                  }} />{label}</label>)}
              </div>
            </div>
            <div className="generate-row"><button className="primary" type="button" disabled={!canGenerate} onClick={generate}>Prepare verified-size files <span aria-hidden="true">&rarr;</span></button>
              <p>{faces.length > 1 && !selectedFace ? "Select the intended face before exporting." : !eyes ? "Mark both eye centers before exporting." : !eyePositionOkay ? "Check eye markers inside each crop and any supplied reference range." : !reviewed ? "Complete the manual review to enable exports." : !headOkay ? (printFormat === "2x2" ? "Adjust the crop and head guides to the stated head-height range." : "Place both head guides inside the crop, with the chin below the head top.") : !resolutionOkay ? "A higher-resolution crop is needed." : "Ready to format. Acceptance is not guaranteed."}</p>
            </div>
          </section>
        </>}
      </fieldset>
      {outputs.length > 0 && <section className="panel downloads" aria-label="Prepared downloads">
        <span className="badge">Exact dimensions verified</span><h2>Your files are ready to inspect</h2>
        <p>Review each final image before submission or printing. Encoder quality and byte limits are checked, but visual acceptability needs your judgment.</p>
        <div className="output-grid">{outputs.map(output => <OutputCard key={output.name} output={output} />)}</div>
        <button className="text-button" type="button" onClick={() => triggerDownload(new Blob([report], { type: "application/json" }), "photo-preparation-report.json")}>Download checks &amp; printing instructions (JSON)</button>
      </section>}
      <footer><p>Local-first. No photo uploads. No government affiliation.</p><p>Version 0.6.3 &bull; <a href="/vision/model-provenance.json" target="_blank" rel="noreferrer">Local models</a> &bull; <a href="/third-party-notices.json" target="_blank" rel="noreferrer">Dependency notices</a></p></footer>
    </main>
  </div>;
}
