export const acceptedClientImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const maxClientSourceBytes = 20_000_000;
export const maxUploadedImageBytes = 10_000_000;

export interface CoverCrop {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
}

export interface PreparedImageUpload {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

export function validateClientImage(file: Pick<File, 'size' | 'type'>): void {
  if (!acceptedClientImageTypes.some((mimeType) => mimeType === file.type)) {
    throw new Error('IMAGE_TYPE_UNSUPPORTED');
  }
  if (file.size <= 0 || file.size > maxClientSourceBytes) {
    throw new Error('IMAGE_SIZE_INVALID');
  }
}

export function calculateCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  aspectRatio: number,
  focalX: number,
  focalY: number,
): CoverCrop {
  if (sourceWidth <= 0 || sourceHeight <= 0 || aspectRatio <= 0) {
    throw new Error('IMAGE_GEOMETRY_INVALID');
  }
  const sourceAspect = sourceWidth / sourceHeight;
  const sourceCropWidth = sourceAspect > aspectRatio ? sourceHeight * aspectRatio : sourceWidth;
  const sourceCropHeight = sourceAspect > aspectRatio ? sourceHeight : sourceWidth / aspectRatio;
  const xRange = sourceWidth - sourceCropWidth;
  const yRange = sourceHeight - sourceCropHeight;
  return {
    sourceX: xRange * clampPercent(focalX),
    sourceY: yRange * clampPercent(focalY),
    sourceWidth: sourceCropWidth,
    sourceHeight: sourceCropHeight,
  };
}

export async function prepareImageUpload(
  file: File,
  options: {
    readonly focalX?: number;
    readonly focalY?: number;
    readonly aspectRatio?: number;
    readonly maxOutputWidth?: number;
    readonly quality?: number;
  } = {},
): Promise<PreparedImageUpload> {
  validateClientImage(file);
  const decoded = await decodeImage(file);
  try {
    const aspectRatio = options.aspectRatio ?? 8 / 5;
    const crop = calculateCoverCrop(
      decoded.width,
      decoded.height,
      aspectRatio,
      options.focalX ?? 50,
      options.focalY ?? 50,
    );
    const width = Math.max(
      1,
      Math.min(options.maxOutputWidth ?? 1_600, Math.floor(crop.sourceWidth)),
    );
    const height = Math.max(1, Math.round(width / aspectRatio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('IMAGE_CANVAS_UNAVAILABLE');
    context.drawImage(
      decoded.source,
      crop.sourceX,
      crop.sourceY,
      crop.sourceWidth,
      crop.sourceHeight,
      0,
      0,
      width,
      height,
    );
    const quality = options.quality ?? 0.86;
    const preferredBlob = await canvasToBlob(canvas, 'image/webp', quality);
    const blob =
      preferredBlob.type === 'image/webp'
        ? preferredBlob
        : await canvasToBlob(canvas, 'image/jpeg', quality);
    if (blob.size <= 0 || blob.size > maxUploadedImageBytes) {
      throw new Error('IMAGE_OUTPUT_TOO_LARGE');
    }
    return { blob, width, height };
  } finally {
    decoded.close();
  }
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 50)) / 100;
}

async function decodeImage(file: File): Promise<{
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly close: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => {
        bitmap.close();
      },
    };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => {
        URL.revokeObjectURL(url);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('IMAGE_ENCODING_FAILED'));
      },
      type,
      quality,
    );
  });
}
