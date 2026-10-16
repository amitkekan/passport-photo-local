import { useState, type MouseEvent } from "react";
import type { Face } from "./core";
import type { Photo } from "./images";
import type { Eyes } from "./eyes";

export default function FaceSelector({ photo, faces, selected, onSelect, onManual, eyes, onEyes }: {
  photo: Photo; faces: Face[]; selected: Face | null; onSelect: (face: Face) => void; onManual: (face: Face) => void;
  eyes: Eyes | null; onEyes: (eyes: Eyes) => void;
}) {
  const [marking, setMarking] = useState<"head" | "eyes" | null>(null);
  const [top, setTop] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState("");
  const width = photo.canvas.width, height = photo.canvas.height;
  function mark(event: MouseEvent<HTMLImageElement>) {
    if (!marking) return;
    const area = event.currentTarget.getBoundingClientRect();
    const point = { x: (event.clientX - area.left) / area.width * width, y: (event.clientY - area.top) / area.height * height };
    if (!top) { setTop(point); return; }
    if (marking === "eyes") {
      const ordered = [top, point].sort((a, b) => a.x - b.x);
      if (ordered[1].x - ordered[0].x < width * 0.015) { setNotice("Mark two distinct eye centers, not the same eye twice."); return; }
      onEyes({ left: ordered[0], right: ordered[1], source: "manual" });
      setTop(null); setMarking(null); setNotice(""); return;
    }
    if (point.y - top.y < height * 0.05) { setNotice("Click the bottom of the chin, below your first mark. Or restart the two-point selection."); return; }
    const headHeight = point.y - top.y;
    const cx = (point.x + top.x) / 2;
    const headWidth = Math.min(headHeight * 0.75, 2 * cx, 2 * (width - cx));
    if (headWidth < width * 0.03) { setNotice("Choose points near the center of the actual head, not the image edge."); return; }
    const head = { x: cx - headWidth / 2, y: top.y, width: headWidth, height: headHeight };
    onManual({ bounds: head, head, confidence: 1, source: "manual" });
    setTop(null); setMarking(null); setNotice("");
  }
  return <div className="face-selector">
    <div>
      <h3>{faces.length === 1 ? "Face found: suggested crops are ready" : faces.length > 1 ? "Choose the person to frame" : "Review or mark the head"}</h3>
      <p>{faces.length === 0 ? "No confident face detection. Mark the top of the head and chin for a much better crop than a centered guess." :
        "Click the intended face. Hair and head coverings extend beyond a face detector's box, so review the estimated head guides."}</p>
      {faces.length > 1 && <div className="warning">Multiple faces detected. No face is chosen automatically. The final photo must show only the intended person.</div>}
      <div className="button-row">
        {faces.map((face, i) => <button type="button" className={face === selected ? "primary" : "secondary"} key={i}
          onClick={() => { setMarking(null); setTop(null); onSelect(face); }}>Select face {i + 1}</button>)}
      </div>
      <button type="button" className="text-button" onClick={() => { setMarking("head"); setTop(null); setNotice(""); }}>
        {marking === "head" ? "Restart head marking" : "Mark head manually"}
      </button>
      <div><button type="button" className="text-button" onClick={() => { setMarking("eyes"); setTop(null); setNotice(""); }}>Mark both eyes</button></div>
      <p className="caption">{eyes ? `${eyes.source === "detected" ? "Detected" : "Manually marked"} eye centers: inspect both orange markers. They do not verify open eyes or pose.` : "Eye centers are not marked. Click Mark both eyes, then the center of each pupil."}</p>
      {marking && <><p className="status" role="status">{marking === "eyes" ? (top ? "Click the center of the other pupil." : "Click the center of either pupil.") : top ? "Now click the bottom-center of the chin." : "Click the top-center of the hair/head in the full photo."}</p>
        <button type="button" className="text-button" onClick={() => { setMarking(null); setTop(null); }}>Cancel marking</button></>}
      {notice && <p className="warning-inline" role="alert">{notice}</p>}
      <p className="caption">{selected ? selected.source === "manual" ? "Using your manually marked head." : "Detected face selected. Head extent is estimated, not a verified hair boundary." : "No face selected yet. Manual crop controls remain available."}</p>
    </div>
    <div className={`face-selection-image ${marking ? "marking" : ""}`}>
      <img src={photo.preview} alt="Full original for face selection and head marking" onClick={mark} draggable={false} />
      {!marking && faces.map((face, i) => <button type="button" key={i} aria-label={`Choose detected face ${i + 1}`} className={`face-box ${selected === face ? "selected" : ""}`}
        style={{ left: `${face.bounds.x / width * 100}%`, top: `${face.bounds.y / height * 100}%`, width: `${face.bounds.width / width * 100}%`, height: `${face.bounds.height / height * 100}%` }}
        onClick={() => onSelect(face)}><span>Face {i + 1}</span></button>)}
      {top && <span className="head-mark" style={{ left: `${top.x / width * 100}%`, top: `${top.y / height * 100}%` }} />}
      {eyes && [eyes.left, eyes.right].map((eye, i) => <span key={i} className="head-mark eye-mark" style={{ left: `${eye.x / width * 100}%`, top: `${eye.y / height * 100}%` }} />)}
    </div>
  </div>;
}
