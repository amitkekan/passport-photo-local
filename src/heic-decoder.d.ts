declare module "heic-decoder" {
  export interface HeifImage {
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    display(target: ImageData, callback: (result: ImageData | null) => void): void;
    free(): void;
  }
  export interface HeifDecoder {
    decoder: number | null;
    decode(buffer: ArrayBuffer): HeifImage[];
  }
  export interface HeifModule {
    HeifDecoder: new () => HeifDecoder;
    heif_context_free(context: number): void;
  }
  export default function buildLibheif(): HeifModule;
}
