import buildLibheif, { type HeifDecoder, type HeifImage, type HeifModule } from "heic-decoder";
import { dimensionsAllowed } from "./core";

self.onmessage = async (event: MessageEvent<unknown>) => {
  let bitmap: ImageBitmap | undefined;
  let module: HeifModule | undefined;
  let decoder: HeifDecoder | undefined;
  let images: HeifImage[] = [];
  try {
    if (!(event.data instanceof ArrayBuffer)) throw new Error("Invalid HEIC decode request.");
    module = buildLibheif();
    decoder = new module.HeifDecoder();
    images = decoder.decode(event.data);
    const primary = images.filter(image => image.is_primary());
    if (primary.length !== 1) throw new Error("The HEIC primary photograph could not be selected.");
    const image = primary[0], width = image.get_width(), height = image.get_height();
    if (!dimensionsAllowed(width, height)) throw new Error("Decoded HEIC dimensions exceed the local safety limits.");
    const target = new ImageData(width, height);
    for (let index = 3; index < target.data.length; index += 4) target.data[index] = 255;
    const pixels = await new Promise<ImageData>((resolve, reject) => {
      image.display(target, result => result ? resolve(result) : reject(new Error("HEIC decoding failed.")));
    });
    bitmap = await createImageBitmap(pixels);
    self.postMessage({ bitmap }, { transfer: [bitmap] });
  } catch {
    bitmap?.close();
    self.postMessage({ error: "Could not decode this HEIC locally. It may be damaged or unsupported. Export a JPEG using a trusted app on your device, keeping the original." });
  } finally {
    for (const image of images) image.free();
    if (decoder?.decoder && module) module.heif_context_free(decoder.decoder);
  }
};
