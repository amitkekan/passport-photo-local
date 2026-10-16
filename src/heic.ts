import HeicWorker from "./heic.worker?worker&inline";

export function decodeHeic(buffer: ArrayBuffer): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const worker = new HeicWorker();
    const cleanup = () => { clearTimeout(timeout); worker.terminate(); };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Local HEIC decoding timed out. Export a JPEG on your device and try again."));
    }, 90_000);
    worker.onmessage = (event: MessageEvent<unknown>) => {
      cleanup();
      const result = event.data;
      if (typeof result === "object" && result !== null && "bitmap" in result && result.bitmap instanceof ImageBitmap) {
        resolve(result.bitmap);
      } else {
        reject(new Error(typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error : "The local HEIC decoder returned an invalid result."));
      }
    };
    worker.onerror = event => {
      event.preventDefault(); cleanup();
      reject(new Error("The local HEIC decoder could not start. Use a current browser or export a JPEG on your device."));
    };
    worker.onmessageerror = () => {
      cleanup(); reject(new Error("The local HEIC decoder could not transfer the decoded image."));
    };
    try { worker.postMessage(buffer, [buffer]); }
    catch (error) { cleanup(); reject(error); }
  });
}
