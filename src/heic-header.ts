type Box = { type: string; start: number; end: number };

export function readHeicHeader(data: Uint8Array): { format: "heic"; width: number; height: number } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const text = (offset: number) => String.fromCharCode(...data.subarray(offset, offset + 4));
  const invalid = () => new Error("The HEIC container is damaged or uses unsupported image metadata. Export it locally as JPEG and try again.");
  let count = 0;
  function boxes(start: number, end: number): Box[] {
    const result: Box[] = [];
    while (start < end) {
      if (++count > 10000 || end - start < 8) throw invalid();
      let size = view.getUint32(start), header = 8;
      if (size === 1) {
        if (end - start < 16) throw invalid();
        const extended = view.getBigUint64(start + 8);
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid();
        size = Number(extended); header = 16;
      } else if (size === 0) size = end - start;
      if (size < header || size > end - start) throw invalid();
      result.push({ type: text(start + 4), start: start + header, end: start + size });
      start += size;
    }
    return result;
  }
  function only(items: Box[], type: string): Box {
    const matches = items.filter(item => item.type === type);
    if (matches.length !== 1) throw invalid();
    return matches[0];
  }
  function need(box: Box, size: number) {
    if (box.end - box.start < size) throw invalid();
  }
  const root = boxes(0, data.length);
  const ftyp = only(root, "ftyp");
  need(ftyp, 8);
  if ((ftyp.end - ftyp.start) % 4 !== 0) throw invalid();
  const brands = [text(ftyp.start)];
  for (let offset = ftyp.start + 8; offset < ftyp.end; offset += 4) brands.push(text(offset));
  if (!brands.some(brand => brand === "heic" || brand === "heix")) {
    throw new Error("Only HEVC-based HEIC/HEIF still photographs are supported, not AVIF or video containers.");
  }
  if (brands.some(brand => ["msf1", "hevc", "hevx"].includes(brand)) || root.some(box => box.type === "moov")) {
    throw new Error("HEIC image sequences are not supported. Export the desired still photograph locally as JPEG.");
  }
  const meta = only(root, "meta");
  need(meta, 4);
  if (data[meta.start] !== 0) throw invalid();
  const children = boxes(meta.start + 4, meta.end);
  const pitm = only(children, "pitm");
  need(pitm, 6);
  const primaryVersion = data[pitm.start];
  if (primaryVersion > 1) throw invalid();
  need(pitm, primaryVersion === 0 ? 6 : 8);
  const primary = primaryVersion === 0 ? view.getUint16(pitm.start + 4) : view.getUint32(pitm.start + 4);
  const iinf = only(children, "iinf");
  need(iinf, 6);
  const infoVersion = data[iinf.start];
  if (infoVersion > 1) throw invalid();
  need(iinf, infoVersion === 0 ? 6 : 8);
  const entries = boxes(iinf.start + (infoVersion === 0 ? 6 : 8), iinf.end);
  const declared = infoVersion === 0 ? view.getUint16(iinf.start + 4) : view.getUint32(iinf.start + 4);
  if (entries.length !== declared) throw invalid();
  const images = new Set<number>();
  const seen = new Set<number>();
  for (const entry of entries) {
    if (entry.type !== "infe") throw invalid();
    need(entry, 12);
    const version = data[entry.start];
    if (version !== 2 && version !== 3) throw invalid();
    const idSize = version === 2 ? 2 : 4;
    need(entry, 4 + idSize + 6);
    const id = idSize === 2 ? view.getUint16(entry.start + 4) : view.getUint32(entry.start + 4);
    if (seen.has(id)) throw invalid();
    seen.add(id);
    if (view.getUint16(entry.start + 4 + idSize) !== 0) throw invalid();
    const type = text(entry.start + 6 + idSize);
    if (["hvc1", "grid", "iden", "tmap"].includes(type) && !(data[entry.start + 3] & 1)) images.add(id);
  }
  if (!images.has(primary)) {
    throw new Error("This HEIC has no supported visible primary photograph. Export the desired image locally as JPEG.");
  }
  const iprp = only(children, "iprp");
  const ipco = only(boxes(iprp.start, iprp.end), "ipco");
  const dimensions = boxes(ipco.start, ipco.end).filter(box => box.type === "ispe").map(box => {
    need(box, 12);
    if (data[box.start] !== 0) throw invalid();
    const width = view.getUint32(box.start + 4), height = view.getUint32(box.start + 8);
    if (width === 0 || height === 0) throw invalid();
    return { width, height };
  });
  if (!dimensions.length) throw invalid();
  // Conservative bounds include auxiliary images and tiles, not just the final visible canvas.
  return { format: "heic", width: Math.max(...dimensions.map(size => size.width)), height: Math.max(...dimensions.map(size => size.height)) };
}
